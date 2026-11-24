import { describe, expect, it } from "vitest";
import { createMessageBatches } from "../../../../src/core/process/create-batches";
import { normalizeConversation } from "../../../../src/core/normalize/normalize-conversation";

describe("createMessageBatches", () => {
  it("keeps message boundaries and preserves original chronological indexes", () => {
    const conversation = normalizeConversation({
      conversationId: "batch-conversation",
      title: null,
      messages: [
        { role: "user", content: "1234" },
        { role: "assistant", content: "5678" },
        { role: "user", content: "90" },
      ],
    });

    const batches = createMessageBatches(conversation, { maxBatchMessages: 2, maxBatchCharacters: 8 });

    expect(batches.map((batch) => batch.messages.map((message) => message.content))).toEqual([["1234", "5678"], ["90"]]);
    expect(batches.map((batch) => batch.startMessageIndex)).toEqual([0, 2]);
  });

  it("keeps an oversized message intact and identifies it", () => {
    const conversation = normalizeConversation({
      conversationId: "oversized-conversation",
      title: null,
      messages: [{ role: "user", content: "This message is larger than the test limit." }],
    });

    const [batch] = createMessageBatches(conversation, { maxBatchCharacters: 5 });

    expect(batch?.messages).toHaveLength(1);
    expect(batch?.oversizedMessageIds).toEqual([conversation.messages[0]?.message_id]);
  });

  it("returns no batches for an empty conversation", () => {
    const conversation = normalizeConversation({ conversationId: "empty", title: null, messages: [] });
    expect(createMessageBatches(conversation)).toEqual([]);
  });
});
