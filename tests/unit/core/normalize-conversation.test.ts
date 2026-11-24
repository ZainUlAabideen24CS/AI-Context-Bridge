import { describe, expect, it } from "vitest";
import { normalizeConversation } from "../../../src/core/normalize/normalize-conversation";

describe("normalizeConversation", () => {
  it("creates the SRS universal conversation shape and deterministic fallback message IDs", () => {
    const input = {
      conversationId: "conv_123",
      title: "  Project discussion  ",
      messages: [
        { role: "user" as const, content: "Hello\r\nworld" },
        { role: "assistant" as const, content: "Hi", sourceId: "turn-2" },
      ],
    };

    const first = normalizeConversation(input);
    const second = normalizeConversation(input);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      conversation_id: "conv_123",
      platform: "chatgpt",
      title: "Project discussion",
    });
    expect(first.messages[0]).toMatchObject({
      conversation_id: "conv_123",
      platform: "chatgpt",
      message_id: expect.stringMatching(/^msg_/),
      role: "user",
      content: "Hello\nworld",
      timestamp: null,
      content_type: "text",
    });
    expect(first.messages[1]?.message_id).toBe("chatgpt_turn-2");
  });

  it("preserves timestamps and rich text content types", () => {
    const conversation = normalizeConversation({
      conversationId: "conv_456",
      title: null,
      messages: [{
        role: "assistant",
        content: "## Heading\n\n- item\n\n```ts\nconst answer = 42;\n```\n\n[link](https://example.com)",
        timestamp: "2026-05-01T10:30:00Z",
        contentType: "rich_text",
      }],
    });

    expect(conversation.title).toBeNull();
    expect(conversation.messages[0]).toMatchObject({
      timestamp: "2026-05-01T10:30:00Z",
      content_type: "rich_text",
      content: expect.stringContaining("```ts"),
    });
  });
});
