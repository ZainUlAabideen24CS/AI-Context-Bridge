import { describe, expect, it } from "vitest";
import { classifyMessages } from "../../../../src/core/process/classify";
import { prioritizeItems } from "../../../../src/core/process/prioritize";
import { normalizeConversation } from "../../../../src/core/normalize/normalize-conversation";

describe("prioritizeItems", () => {
  it("ranks explicit user requirements above assistant suggestions", () => {
    const conversation = normalizeConversation({
      conversationId: "priority-conversation",
      title: null,
      messages: [
        { role: "assistant", content: "You could use PostgreSQL as the database." },
        { role: "user", content: "The extension must keep processing local." },
      ],
    });
    const items = prioritizeItems(classifyMessages(conversation.messages));
    const suggestion = items.find((item) => item.originRole === "assistant");
    const requirement = items.find((item) => item.category === "requirement");

    expect(suggestion?.status).toBe("assistant_suggestion");
    expect(requirement?.status).toBe("user_stated");
    expect(requirement?.priority).toBeGreaterThan(suggestion?.priority ?? 100);
  });

  it("keeps every item and uses source order to break equal-priority ties", () => {
    const conversation = normalizeConversation({
      conversationId: "priority-retention",
      title: null,
      messages: [
        { role: "user", content: "Current problem: the popup crashes." },
        { role: "user", content: "Current problem: storage fails." },
      ],
    });
    const originalItems = classifyMessages(conversation.messages);
    const prioritized = prioritizeItems(originalItems);

    expect(prioritized).toHaveLength(originalItems.length);
    expect(new Set(prioritized.map((item) => item.id))).toEqual(new Set(originalItems.map((item) => item.id)));
    expect(prioritized[0]?.sourceRefs[0]?.messageIndex).toBe(0);
    expect(prioritized.every((item) => item.priority >= 0 && item.priority <= 100)).toBe(true);
  });
});
