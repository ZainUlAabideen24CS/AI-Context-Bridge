import type { UniversalConversation } from "../../shared/types/conversation";
import type { ContextCategory, ContextDocument, ContextStatus, ContextValidationResult } from "../process/types";
import { visibleSummaryItems } from "./template";

const categories = new Set<ContextCategory>([
  "project", "technology", "requirement", "decision", "completed_work", "progress",
  "problem", "code_reference", "task", "preference", "important_fact", "next_step",
]);
const statuses = new Set<ContextStatus>([
  "user_stated", "assistant_suggestion", "assistant_assertion", "accepted", "unresolved",
]);
const confidences = new Set(["high", "medium", "low"]);
const resolutions = new Set(["active", "unresolved", "superseded"]);

export function validateContextSummary(
  document: ContextDocument,
  conversation: UniversalConversation,
): ContextValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const messageById = new Map(conversation.messages.map((message, index) => [message.message_id, { message, index }]));
  const itemIds = new Set<string>();
  const visibleItemIds = new Set(visibleSummaryItems(document.items).map((item) => item.id));

  if (!document.conversationId || document.conversationId !== conversation.conversation_id) {
    errors.push("Context conversation ID is missing or does not match the source conversation.");
  }
  if (document.platform !== conversation.platform) errors.push("Context platform does not match the source conversation.");
  if (document.messageCount !== conversation.messages.length) errors.push("Context message count does not match the source conversation.");
  if (!document.markdown.trim() || !document.markdown.includes("## Conversation Overview")) {
    errors.push("Markdown summary is empty or missing the required conversation overview.");
  }

  for (const item of document.items) {
    if (!item.id || itemIds.has(item.id)) errors.push(`Context item has a missing or duplicate ID: ${item.id || "(empty)"}.`);
    itemIds.add(item.id);
    if (!categories.has(item.category)) errors.push(`Context item ${item.id} has an invalid category.`);
    if (!statuses.has(item.status)) errors.push(`Context item ${item.id} has an invalid conversational status.`);
    if (!confidences.has(item.confidence)) errors.push(`Context item ${item.id} has an invalid confidence value.`);
    if (!resolutions.has(item.resolution)) errors.push(`Context item ${item.id} has an invalid conflict resolution status.`);
    if (!item.text.trim()) errors.push(`Context item ${item.id} has no text.`);
    if (item.textVariants.length === 0 || !item.textVariants.includes(item.text)) {
      errors.push(`Context item ${item.id} is missing its source wording.`);
    }
    if (item.sourceRefs.length === 0) errors.push(`Context item ${item.id} has no source references.`);

    for (const source of item.sourceRefs) {
      const sourceMessage = messageById.get(source.messageId);
      if (!sourceMessage) {
        errors.push(`Context item ${item.id} references missing source message ${source.messageId}.`);
        continue;
      }
      if (sourceMessage.index !== source.messageIndex || sourceMessage.message.role !== source.role) {
        errors.push(`Context item ${item.id} has incorrect metadata for source message ${source.messageId}.`);
      }
      if (!source.quote.trim() || !sourceMessage.message.content.includes(source.quote)) {
        errors.push(`Context item ${item.id} has source text that cannot be verified in ${source.messageId}.`);
      }
      if (visibleItemIds.has(item.id) && !document.markdown.includes(`\`${source.messageId}\``)) {
        errors.push(`Markdown summary is missing source reference ${source.messageId}.`);
      }
    }

    for (const variant of item.textVariants) {
      if (!item.sourceRefs.some((source) => source.quote === variant)) {
        errors.push(`Context item ${item.id} contains wording without a matching source reference.`);
      }
    }
  }

  for (const conflict of document.conflicts) {
    if (conflict.itemIds.length < 2) errors.push(`Conflict ${conflict.id} has fewer than two items.`);
    for (const itemId of conflict.itemIds) {
      if (!itemIds.has(itemId)) errors.push(`Conflict ${conflict.id} references missing context item ${itemId}.`);
    }
    if (conflict.sourceRefs.length === 0) errors.push(`Conflict ${conflict.id} has no source references.`);
    for (const source of conflict.sourceRefs) {
      const sourceMessage = messageById.get(source.messageId);
      if (!sourceMessage || sourceMessage.index !== source.messageIndex || sourceMessage.message.role !== source.role) {
        errors.push(`Conflict ${conflict.id} has an invalid source reference ${source.messageId}.`);
      }
    }
    if (conflict.status === "unresolved") warnings.push(`Conflict ${conflict.id} remains unresolved and needs review.`);
  }

  for (const relationship of document.relationships) {
    if (!itemIds.has(relationship.fromItemId) || !itemIds.has(relationship.toItemId)) {
      errors.push(`Relationship ${relationship.fromItemId} → ${relationship.toItemId} references a missing item.`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
