import { describe, expect, it } from "vitest";
import { processConversation } from "../../../../src/core/process/pipeline";
import { validateContextSummary } from "../../../../src/core/summarize/summary-validation";
import { normalizeConversation } from "../../../../src/core/normalize/normalize-conversation";

describe("validateContextSummary", () => {
  it("accepts a traceable context summary and detects broken source references", () => {
    const conversation = normalizeConversation({
      conversationId: "validation-summary",
      title: "Traceability",
      messages: [{ role: "user", content: "We must preserve all source IDs." }],
    });
    const result = processConversation(conversation);

    expect(result.validation.valid).toBe(true);

    const broken = {
      ...result.context,
      items: result.context.items.map((item, index) => index === 0
        ? { ...item, sourceRefs: [{ ...item.sourceRefs[0]!, messageId: "missing-message" }] }
        : item),
    };
    const validation = validateContextSummary(broken, conversation);

    expect(validation.valid).toBe(false);
    expect(validation.errors.join(" ")).toContain("missing source message");
  });

  it("does not require hidden assistant problem references to appear in Markdown", () => {
    const conversation = normalizeConversation({
      conversationId: "validation-hidden-diagnostics",
      title: "Startup issue",
      messages: [
        { role: "user", content: "The MCP startup failed and the path was not found." },
        { role: "assistant", content: "MCP startup failed. The system cannot find the path specified. Activation failed." },
      ],
    });
    const result = processConversation(conversation);

    expect(result.context.items.some((item) =>
      item.category === "problem" && item.originRole === "assistant",
    )).toBe(true);
    expect(result.context.markdown).not.toContain("Assistant statement;");
    expect(result.validation.valid).toBe(true);
    expect(result.validation.errors).toEqual([]);
  });
});
