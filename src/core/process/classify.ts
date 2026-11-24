import type { UniversalMessage } from "../../shared/types/conversation";
import {
  ACCEPTANCE_PATTERN,
  CATEGORY_RULES,
  CORRECTION_PATTERN,
  DECISION_DOMAIN_RULES,
  FINALITY_PATTERN,
  HEDGING_PATTERN,
  INITIAL_PATTERN,
  SUGGESTION_PATTERN,
  TECHNOLOGY_ENTRIES,
} from "./rules";
import type { ContextCategory, ContextItem, ContextSourceReference, DecisionIntent } from "./types";

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36).padStart(7, "0");
}

function splitSentences(line: string): string[] {
  return line.split(/(?<=[.!?])\s+(?=[A-Z0-9“"'])/u).map((part) => part.trim()).filter(Boolean);
}

function getStatements(content: string): { statements: string[]; codeBlocks: string[] } {
  const codeBlocks = [...content.matchAll(/```[^\n]*\n[\s\S]*?```/g)].map((match) => match[0]);
  const withoutCode = content.replace(/```[^\n]*\n[\s\S]*?```/g, " ");
  const statements = withoutCode.split(/\r?\n/).flatMap((rawLine) => {
    // Extracted rich-text often prefixes every line with a Markdown list marker.
    // Remove it before checking for timestamps and log levels.
    const line = rawLine.trim().replace(/^(?:[-*+]\s+|\d{1,2}[.)]\s+)/, "");
    const timestampedLog = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?\s+\[(info|debug|trace|warning|error)\]/i.test(line);
    // Informational telemetry is operational noise. Keep each warning/error log
    // intact so punctuation inside stack traces does not fragment it into false items.
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?\s+\[(?:info|debug|trace)\]/i.test(line)
      || /\breasoning summary item completed\b/i.test(line)
      // ChatGPT client registration telemetry is not conversation context.
      || /\/ces\/v\d+\/rgstr\b/i.test(line)) return [];
    const normalized = line.replace(/^\s{0,3}(?:[-*+]\s+|\d{1,2}[.)]\s+|#{1,6}\s+)/, "").trim();
    return (timestampedLog ? [normalized] : splitSentences(normalized)).filter(Boolean);
  });
  return { statements, codeBlocks };
}

function statusFor(message: UniversalMessage, statement: string): ContextItem["status"] {
  if (message.role === "assistant") {
    return SUGGESTION_PATTERN.test(statement) ? "assistant_suggestion" : "assistant_assertion";
  }
  return HEDGING_PATTERN.test(statement) ? "unresolved" : "user_stated";
}

function decisionIntentFor(statement: string): DecisionIntent {
  if (INITIAL_PATTERN.test(statement)) return "initial";
  if (CORRECTION_PATTERN.test(statement)) return "correction";
  if (FINALITY_PATTERN.test(statement)) return "final";
  return "ordinary";
}

function topicsForDecision(statement: string): { topicKey: string | null; valueKey: string | null }[] {
  const domain = DECISION_DOMAIN_RULES.find((rule) => rule.pattern.test(statement));
  const technologies = TECHNOLOGY_ENTRIES.filter((entry) => entry.pattern.test(statement));
  const candidates = domain
    ? technologies.filter((technology) => technology.topic === domain.topic)
    : technologies;
  const choices = candidates.map((technology) => ({
    topicKey: `choice:${domain?.topic ?? technology.topic}`,
    valueKey: technology.name.toLocaleLowerCase("en-US"),
  }));
  if (choices.length > 0) return [...new Map(choices.map((choice) => [`${choice.topicKey}\u0000${choice.valueKey}`, choice])).values()];
  return [{ topicKey: domain ? `choice:${domain.topic}` : null, valueKey: null }];
}

function sourceReference(message: UniversalMessage, messageIndex: number, quote: string): ContextSourceReference {
  return { messageId: message.message_id, role: message.role, messageIndex, quote };
}

function createItem(
  message: UniversalMessage,
  messageIndex: number,
  category: ContextCategory,
  text: string,
  confidence: ContextItem["confidence"],
  topicOverride?: { topicKey: string | null; valueKey: string | null },
): ContextItem {
  const status = statusFor(message, text);
  const topic = topicOverride ?? topicsForDecision(text)[0] ?? { topicKey: null, valueKey: null };
  const identity = [message.conversation_id, category, message.message_id, text, topic.topicKey ?? "", topic.valueKey ?? ""].join("\u0000");
  return {
    id: `ctx_${hash(identity)}`,
    category,
    text,
    textVariants: [text],
    confidence: HEDGING_PATTERN.test(text) ? "low" : confidence,
    status,
    resolution: "active",
    originRole: message.role,
    sourceRefs: [sourceReference(message, messageIndex, text)],
    priority: 0,
    topicKey: topic.topicKey,
    valueKey: category === "decision" ? topic.valueKey : null,
    decisionIntent: category === "decision" ? decisionIntentFor(text) : "ordinary",
  };
}

function classifyStatement(message: UniversalMessage, messageIndex: number, statement: string): ContextItem[] {
  const items: ContextItem[] = [];
  const seenCategories = new Set<ContextCategory>();

  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(statement)) {
      if (rule.category === "decision") {
        for (const topic of topicsForDecision(statement)) {
          items.push(createItem(message, messageIndex, rule.category, statement, rule.confidence, topic));
        }
      } else {
        items.push(createItem(message, messageIndex, rule.category, statement, rule.confidence));
      }
      seenCategories.add(rule.category);
    }
  }

  const technology = TECHNOLOGY_ENTRIES.some((entry) => entry.pattern.test(statement));
  const mentionsTechnologyStack = /\b(?:technology stack|tech stack|frameworks? and tools|tools? include)\b/i.test(statement);
  if ((technology || mentionsTechnologyStack) && !seenCategories.has("technology")) {
    items.push(createItem(message, messageIndex, "technology", statement, technology ? "high" : "medium"));
  }

  // Explicit Markdown links and prose-introduced references are useful. Raw URLs
  // embedded in telemetry/query parameters are retained in problem text but are
  // not promoted to reusable code references.
  const links = [...statement.matchAll(/\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g)]
    .filter((match) => !isTelemetryUrl(match[1] ?? ""));
  const contextualUrl = /\b(?:see|reference|docs?|documentation|source|link)\s*:?\s*https?:\/\/[^\s)]+/i.test(statement)
    && !isTelemetryUrl(statement);
  if ((links.length > 0 || contextualUrl) && !seenCategories.has("code_reference")) {
    items.push(createItem(message, messageIndex, "code_reference", statement, "high"));
  }

  return items;
}

function isTelemetryUrl(value: string): boolean {
  return /(?:\/ces\/v\d+\/rgstr\b|\b(?:telemetry|analytics|tracking|beacon)\b)/i.test(value);
}

export function classifyMessage(message: UniversalMessage, messageIndex: number): ContextItem[] {
  const { statements, codeBlocks } = getStatements(message.content);
  const items = statements.flatMap((statement) => classifyStatement(message, messageIndex, statement));

  for (const block of codeBlocks) {
    items.push(createItem(message, messageIndex, "code_reference", block, "high"));
  }

  return items;
}

export function attachAcceptanceEvidence(
  items: readonly ContextItem[],
  messages: readonly UniversalMessage[],
  startIndex = 0,
): ContextItem[] {
  const indexedMessages = messages.map((message, index) => ({ message, messageIndex: startIndex + index }));
  const itemsByMessage = new Map<number, ContextItem[]>();
  for (const item of items) {
    const source = item.sourceRefs[0];
    if (!source) continue;
    const group = itemsByMessage.get(source.messageIndex) ?? [];
    group.push(item);
    itemsByMessage.set(source.messageIndex, group);
  }

  const result = new Map(items.map((item) => [item.id, { ...item, sourceRefs: [...item.sourceRefs] }]));
  let pendingSuggestions: ContextItem[] = [];

  for (const { message, messageIndex } of indexedMessages) {
    if (message.role === "assistant") {
      pendingSuggestions = (itemsByMessage.get(messageIndex) ?? [])
        .filter((item) => item.status === "assistant_suggestion");
      continue;
    }

    if (ACCEPTANCE_PATTERN.test(message.content) && pendingSuggestions.length > 0) {
      const distinctSuggestions = new Set(pendingSuggestions.map((suggestion) => suggestion.sourceRefs[0]?.quote));
      const decisions = pendingSuggestions.filter((suggestion) => suggestion.category === "decision" && suggestion.topicKey !== null && suggestion.valueKey !== null);
      const ambiguousTopic = decisions.some((suggestion) => decisions.some((other) =>
        other.id !== suggestion.id && suggestion.topicKey !== null &&
        other.topicKey === suggestion.topicKey && other.valueKey !== suggestion.valueKey,
      ));
      const acceptableSuggestions = distinctSuggestions.size === 1 && !ambiguousTopic ? pendingSuggestions : [];

      for (const suggestion of acceptableSuggestions) {
        const accepted = result.get(suggestion.id);
        if (!accepted) continue;
        accepted.status = "accepted";
        accepted.sourceRefs.push(sourceReference(message, messageIndex, message.content.trim()));
      }
    }
    pendingSuggestions = [];
  }

  return [...result.values()];
}

export function classifyMessages(messages: readonly UniversalMessage[], startIndex = 0): ContextItem[] {
  const indexedMessages = messages.map((message, index) => ({ message, messageIndex: startIndex + index }));
  const items = indexedMessages.flatMap(({ message, messageIndex }) => classifyMessage(message, messageIndex));
  return attachAcceptanceEvidence(items, messages, startIndex);
}
