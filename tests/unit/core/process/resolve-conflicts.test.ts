import { describe, expect, it } from "vitest";
import { classifyMessages } from "../../../../src/core/process/classify";
import { resolveConflicts } from "../../../../src/core/process/resolve-conflicts";
import { normalizeConversation } from "../../../../src/core/normalize/normalize-conversation";

function getDecisionItems(messages: { role: "user" | "assistant"; content: string }[]) {
  const conversation = normalizeConversation({
    conversationId: "conflict-conversation",
    title: null,
    messages,
  });
  return classifyMessages(conversation.messages).filter((item) => item.category === "decision");
}

describe("resolveConflicts", () => {
  it("marks an earlier decision superseded when a later explicit user final decision resolves it", () => {
    const decisions = getDecisionItems([
      { role: "user", content: "Initial decision: Use PostgreSQL for the database." },
      { role: "user", content: "Final decision: We will use SQL Server for the database." },
    ]);

    const result = resolveConflicts(decisions);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.status).toBe("resolved");
    expect(result.conflicts[0]?.sourceRefs).toHaveLength(2);
    expect(result.items.find((item) => item.valueKey === "postgresql")?.resolution).toBe("superseded");
    expect(result.items.find((item) => item.valueKey === "sql server")?.resolution).toBe("active");
    expect(result.relationships).toHaveLength(1);
  });

  it("keeps assistant alternatives unresolved without user confirmation", () => {
    const decisions = getDecisionItems([
      { role: "assistant", content: "You could use PostgreSQL as the database." },
      { role: "assistant", content: "Alternatively, you might use SQL Server as the database." },
    ]);

    const result = resolveConflicts(decisions);

    expect(result.conflicts[0]?.status).toBe("unresolved");
    expect(result.items.every((item) => item.resolution === "unresolved")).toBe(true);
    expect(result.items.map((item) => item.status)).toEqual(["assistant_suggestion", "assistant_suggestion"]);
  });

  it("does not infer a conflict when decision topics differ", () => {
    const decisions = getDecisionItems([
      { role: "user", content: "Final decision: We will use PostgreSQL for the database." },
      { role: "user", content: "Final decision: We will use React as the framework." },
    ]);

    expect(resolveConflicts(decisions).conflicts).toHaveLength(0);
  });

  it("resolves an earlier decision when the user explicitly switches to a replacement", () => {
    const decisions = getDecisionItems([
      { role: "user", content: "We decided to use PostgreSQL as the database." },
      { role: "user", content: "We switched to SQL Server as the database." },
    ]);

    const result = resolveConflicts(decisions);

    expect(result.conflicts[0]?.status).toBe("resolved");
    expect(result.items.find((item) => item.valueKey === "postgresql")?.resolution).toBe("superseded");
    expect(result.items.find((item) => item.valueKey === "sql server")?.resolution).toBe("active");
  });
});
