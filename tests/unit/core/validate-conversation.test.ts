import { describe, expect, it } from "vitest";
import { normalizeConversation } from "../../../src/core/normalize/normalize-conversation";
import { validateConversation } from "../../../src/core/validate/validate-conversation";

describe("validateConversation", () => {
  it("excludes empty messages and reports exact duplicates without discarding repeated content", () => {
    const conversation = normalizeConversation({
      conversationId: "conv_validation",
      title: null,
      messages: [
        { role: "user", content: "  " },
        { role: "user", content: "Keep this" },
        { role: "user", content: "Keep this" },
        { role: "assistant", content: "Keep this" },
      ],
    });

    const result = validateConversation(conversation);

    expect(result.validation.emptyMessageCount).toBe(1);
    expect(result.validation.duplicateMessageCount).toBe(1);
    expect(result.conversation.messages).toHaveLength(3);
    expect(result.validation.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("1 empty message"),
      expect.stringContaining("1 exact duplicate message"),
    ]));
  });

  it("leaves non-empty unique messages unchanged", () => {
    const conversation = normalizeConversation({
      conversationId: "conv_clean",
      title: "Clean",
      messages: [{ role: "user", content: "Question" }, { role: "assistant", content: "Answer" }],
    });

    const result = validateConversation(conversation);

    expect(result.conversation).toEqual(conversation);
    expect(result.validation).toEqual({ emptyMessageCount: 0, duplicateMessageCount: 0, warnings: [] });
  });
});
