import { describe, expect, it } from "vitest";
import { classifyMessages } from "../../../../src/core/process/classify";
import { mergeBatchResults } from "../../../../src/core/process/merge-batches";
import { normalizeConversation } from "../../../../src/core/normalize/normalize-conversation";
import type { ProcessedBatch } from "../../../../src/core/process/types";

describe("mergeBatchResults", () => {
  it("deduplicates across batches while preserving all source references and topic relationships", () => {
    const conversation = normalizeConversation({
      conversationId: "merge-conversation",
      title: null,
      messages: [
        { role: "user", content: "We must use React." },
        { role: "user", content: "we must use React" },
        { role: "user", content: "Initial decision: Use PostgreSQL for the database." },
        { role: "user", content: "Final decision: We will use SQL Server for the database." },
      ],
    });
    const firstBatch: ProcessedBatch = { batch: { index: 0, startMessageIndex: 0, messages: conversation.messages.slice(0, 2), characterCount: 0, oversizedMessageIds: [] }, items: classifyMessages(conversation.messages.slice(0, 2), 0) };
    const secondBatch: ProcessedBatch = { batch: { index: 1, startMessageIndex: 2, messages: conversation.messages.slice(2), characterCount: 0, oversizedMessageIds: [] }, items: classifyMessages(conversation.messages.slice(2), 2) };

    const merged = mergeBatchResults([firstBatch, secondBatch]);
    const repeatedRequirement = merged.items.find((item) => item.category === "requirement");

    expect(repeatedRequirement?.sourceRefs.map((source) => source.messageId)).toEqual([
      conversation.messages[0]?.message_id,
      conversation.messages[1]?.message_id,
    ]);
    expect(merged.items.some((item) => item.valueKey === "postgresql")).toBe(true);
    expect(merged.items.some((item) => item.valueKey === "sql server")).toBe(true);
    expect(merged.relationships.some((relationship) => relationship.type === "same_topic")).toBe(true);
  });

  it("relates categories that share explicit source or topic evidence", () => {
    const conversation = normalizeConversation({
      conversationId: "merge-relations",
      title: null,
      messages: [
        { role: "user", content: "The requirement is to keep React in the technology stack." },
        { role: "user", content: "We decided to use React as the framework." },
      ],
    });
    const items = classifyMessages(conversation.messages);
    const batch: ProcessedBatch = {
      batch: { index: 0, startMessageIndex: 0, messages: conversation.messages, characterCount: 0, oversizedMessageIds: [] },
      items,
    };

    const merged = mergeBatchResults([batch]);

    expect(merged.relationships.some((relationship) => relationship.type === "same_source")).toBe(true);
    expect(merged.relationships.some((relationship) => relationship.type === "same_topic")).toBe(true);
  });
});
