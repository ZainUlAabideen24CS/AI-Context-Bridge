import type { UniversalConversation } from "../../shared/types/conversation";
import type { ContextConflict, ContextItem } from "../process/types";
import { SUMMARY_SECTIONS, visibleSummaryItems } from "./template";

function statusLabel(item: ContextItem): string {
  if (item.resolution === "superseded") return "Superseded";
  if (item.resolution === "unresolved" || item.status === "unresolved") return "Unresolved";
  if (item.status === "user_stated") return "User statement";
  if (item.status === "assistant_suggestion") return "Assistant suggestion";
  if (item.status === "assistant_assertion") return "Assistant statement";
  return "Accepted";
}

function displayText(text: string): string {
  let display = text.trim()
    .replace(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?\s+\[(?:warning|error)\]\s*/i, "")
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/^cli:\s*/i, "");
  const messageField = display.match(/^message="([\s\S]*?)"(.*)$/);
  if (messageField) display = (messageField[1] ?? "") + (messageField[2] ?? "");
  return display.replace(/\s{2,}/g, " ").trim();
}

function renderItem(item: ContextItem): string {
  const lines = displayText(item.text).split("\n");
  const first = lines.shift() ?? "";
  const output = [`- **${statusLabel(item)}; ${item.confidence} confidence** — ${first}`];
  for (const line of lines) output.push(`  ${line}`);
  const sources = [...new Set(item.sourceRefs.map((source) => source.messageId))];
  if (sources.length > 0) output.push(`  Sources: ${sources.map((id) => `\`${id}\``).join(", ")}`);
  return output.join("\n");
}

/**
 * Groups assistant problem fragments for presentation only. The ContextDocument
 * retains each original item unchanged for traceability and downstream use.
 */
function renderProblemItems(items: readonly ContextItem[]): string {
  const groups = new Map<string, ContextItem[]>();
  const keys: string[] = [];

  for (const item of items) {
    const assistantSource = item.originRole === "assistant"
      ? item.sourceRefs.find((source) => source.role === "assistant")?.messageId
      : undefined;
    const key = assistantSource ? "assistant:" + assistantSource : "item:" + item.id;
    const group = groups.get(key);
    if (group) group.push(item);
    else {
      groups.set(key, [item]);
      keys.push(key);
    }
  }

  return keys.map((key) => {
    const group = groups.get(key) ?? [];
    const first = group[0];
    if (!first || group.length === 1) return first ? renderItem(first) : "";

    const distinctTexts = [...new Set(group.map((item) => item.text.trim()).filter(Boolean))];
    const merged: ContextItem = {
      ...first,
      text: distinctTexts.join("\n"),
      textVariants: [...new Set(group.flatMap((item) => [item.text, ...item.textVariants]))],
      sourceRefs: group.flatMap((item) => item.sourceRefs),
      confidence: group.some((item) => item.confidence === "high")
        ? "high"
        : group.some((item) => item.confidence === "medium") ? "medium" : "low",
    };
    return renderItem(merged);
  }).filter(Boolean).join("\n\n");
}

function renderOverview(conversation: UniversalConversation, warnings: readonly string[]): string {
  const details = [
    ...(conversation.title ? [`- **Conversation:** ${conversation.title}`] : []),
    `- **Source platform:** ${conversation.platform}`,
    `- **Messages processed:** ${conversation.messages.length}`,
  ];
  if (warnings.length > 0) {
    details.push("- **Processing notes:**");
    for (const warning of warnings) details.push(`  - ${warning}`);
  }
  return details.join("\n");
}

export function renderContextMarkdown(
  conversation: UniversalConversation,
  items: readonly ContextItem[],
  _conflicts: readonly ContextConflict[],
  warnings: readonly string[] = [],
): string {
  const sections = ["# Conversation Context"];
  const visibleItems = visibleSummaryItems(items);

  for (const section of SUMMARY_SECTIONS) {
    const sectionItems = visibleItems.filter((item) => section.categories.includes(item.category));
    if (section.id !== "overview" && sectionItems.length === 0) continue;

    const content = section.id === "overview"
      ? renderOverview(conversation, warnings)
      : section.id === "problems"
        ? renderProblemItems(sectionItems)
        : sectionItems.map(renderItem).join("\n\n");
    sections.push(`## ${section.title}\n\n${content}`);
  }

  return `${sections.join("\n\n").trim()}\n`;
}
