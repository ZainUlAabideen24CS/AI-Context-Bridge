import { describe, expect, it } from "vitest";
import { normalizeConversation } from "../../../../src/core/normalize/normalize-conversation";
import { processConversation } from "../../../../src/core/process/pipeline";

describe("processConversation", () => {
  it("runs batches through classification, traceable merging, prioritization, conflict resolution, and Markdown validation", () => {
    const conversation = normalizeConversation({
      conversationId: "pipeline-conversation",
      title: "Context transfer project",
      messages: [
        { role: "assistant", content: "You could use PostgreSQL as the database." },
        { role: "user", content: "Final decision: We will use SQL Server for the database." },
        { role: "user", content: "The project must preserve code snippets." },
        { role: "user", content: "```ts\nconst local = true;\n```" },
      ],
    });

    const result = processConversation(conversation, {
      maxBatchMessages: 1,
      extractionWarnings: ["Only rendered messages were available."],
    });

    expect(result.validation.valid).toBe(true);
    expect(result.context.conflicts).toHaveLength(1);
    expect(result.context.conflicts[0]?.status).toBe("resolved");
    expect(result.context.items.some((item) => item.category === "requirement")).toBe(true);
    expect(result.context.items.some((item) => item.category === "code_reference")).toBe(true);
    expect(result.context.items.find((item) => item.valueKey === "postgresql")?.resolution).toBe("superseded");
    expect(result.context.items.find((item) => item.valueKey === "sql server")?.resolution).toBe("active");
    expect(result.context.markdown).toContain("## Important Decisions");
    expect(result.context.markdown).toContain("Only rendered messages were available.");
    expect(result.context.items.every((item) => item.sourceRefs.length > 0)).toBe(true);
  });

  it("preserves assistant suggestion acceptance evidence across batch boundaries", () => {
    const conversation = normalizeConversation({
      conversationId: "pipeline-acceptance",
      title: null,
      messages: [
        { role: "assistant", content: "I recommend using PostgreSQL as the database." },
        { role: "user", content: "Approved, let's do that." },
      ],
    });

    const result = processConversation(conversation, { maxBatchMessages: 1 });
    const accepted = result.context.items.find((item) => item.category === "decision");

    expect(accepted?.status).toBe("accepted");
    expect(accepted?.sourceRefs.map((source) => source.messageId)).toEqual(conversation.messages.map((message) => message.message_id));
    expect(result.validation.valid).toBe(true);
  });

  it("retains unclassified and unresolved information as warnings/conflicts without inventing content", () => {
    const conversation = normalizeConversation({
      conversationId: "pipeline-uncertain",
      title: null,
      messages: [
        { role: "assistant", content: "You could use PostgreSQL as the database." },
        { role: "assistant", content: "Alternatively, you might use SQL Server as the database." },
        { role: "user", content: "Maybe we need to add a settings panel." },
      ],
    });

    const result = processConversation(conversation);

    expect(result.context.conflicts.some((conflict) => conflict.status === "unresolved")).toBe(true);
    expect(result.context.items.some((item) => item.category === "task" && item.status === "unresolved")).toBe(true);
    expect(result.context.markdown).toContain("Unresolved");
    expect(result.validation.valid).toBe(true);
  });
});
