import type { UniversalConversation } from "../../shared/types/conversation";
import { attachAcceptanceEvidence, classifyMessage } from "./classify";
import { createMessageBatches } from "./create-batches";
import { mergeBatchResults } from "./merge-batches";
import { prioritizeItems } from "./prioritize";
import { resolveConflicts } from "./resolve-conflicts";
import type { ContextEngineOptions, ContextProcessResult, ProcessedBatch } from "./types";
import { renderContextMarkdown } from "../summarize/markdown";
import { validateContextSummary } from "../summarize/summary-validation";

export interface ProcessConversationOptions extends ContextEngineOptions {
  extractionWarnings?: readonly string[];
}

/** Deterministic local pipeline from normalized conversation to traceable Markdown context. */
export function processConversation(
  conversation: UniversalConversation,
  options: ProcessConversationOptions = {},
): ContextProcessResult {
  const batches = createMessageBatches(conversation, options);
  const rawBatches: ProcessedBatch[] = batches.map((batch) => ({
    batch,
    items: batch.messages.flatMap((message, index) => classifyMessage(message, batch.startMessageIndex + index)),
  }));

  const rawItems = rawBatches.flatMap((batch) => batch.items);
  const acceptedItems = attachAcceptanceEvidence(rawItems, conversation.messages);
  const acceptedById = new Map(acceptedItems.map((item) => [item.id, item]));
  const processedBatches = rawBatches.map((batch) => ({
    ...batch,
    items: batch.items.map((item) => acceptedById.get(item.id) ?? item),
  }));

  const merged = mergeBatchResults(processedBatches);
  const prioritizedItems = prioritizeItems(merged.items);
  const resolved = resolveConflicts(prioritizedItems);
  const relationships = [...merged.relationships, ...resolved.relationships];
  const warnings = [
    ...(options.extractionWarnings ?? []),
    ...batches.flatMap((batch) => batch.oversizedMessageIds.map((id) =>
      `Message ${id} exceeded the configured batch character limit and was processed intact.`)),
  ];
  if (resolved.items.length === 0) warnings.push("No context items matched the local classification rules.");
  warnings.push("Context classification is deterministic and rule-based; implicit or indirect information may not be identified.");

  const markdown = renderContextMarkdown(conversation, resolved.items, resolved.conflicts, warnings);
  const context = {
    conversationId: conversation.conversation_id,
    title: conversation.title,
    platform: conversation.platform,
    messageCount: conversation.messages.length,
    items: resolved.items,
    conflicts: resolved.conflicts,
    relationships,
    warnings,
    markdown,
  };
  const validation = validateContextSummary(context, conversation);

  return { context, validation };
}
