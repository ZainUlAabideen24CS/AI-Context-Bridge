import { describe, expect, it } from "vitest";
import { classifyMessage, classifyMessages } from "../../../../src/core/process/classify";
import { resolveConflicts } from "../../../../src/core/process/resolve-conflicts";
import type { UniversalMessage } from "../../../../src/shared/types/conversation";

function message(messageId: string, role: UniversalMessage["role"], content: string): UniversalMessage {
  return {
    conversation_id: "conversation-classification",
    message_id: messageId,
    platform: "chatgpt",
    role,
    content,
    timestamp: null,
    content_type: "text",
  };
}

describe("message classification", () => {
  it("classifies project context, requirements, technologies, tasks, preferences, problems, and code", () => {
    const classified = classifyMessage(message("m1", "user", [
      "This project is a browser extension for carrying context.",
      "The stack includes React, TypeScript, and Vite.",
      "The extension must process data locally.",
      "TODO: add a Vitest test.",
      "I prefer concise progress messages.",
      "Current problem: extraction fails on long chats.",
      "```ts\nconst localOnly = true;\n```",
    ].join("\n")), 0);

    expect(classified.map((item) => item.category)).toEqual(expect.arrayContaining([
      "project", "technology", "requirement", "task", "preference", "problem", "code_reference",
    ]));
    expect(classified.every((item) => item.originRole === "user" && item.status === "user_stated")).toBe(true);
    expect(classified.every((item) => item.sourceRefs[0]?.messageId === "m1")).toBe(true);
    expect(classified.some((item) => item.text.includes("const localOnly"))).toBe(true);
  });

  it("records assistant proposals as suggestions and only marks them accepted with explicit user evidence", () => {
    const conversation = [
      message("assistant-1", "assistant", "I recommend using PostgreSQL as the database."),
      message("user-2", "user", "Approved, let's do that."),
    ];

    const items = classifyMessages(conversation);
    const decision = items.find((item) => item.category === "decision");

    expect(decision?.status).toBe("accepted");
    expect(decision?.originRole).toBe("assistant");
    expect(decision?.sourceRefs.map((source) => source.messageId)).toEqual(["assistant-1", "user-2"]);
    expect(classifyMessage(conversation[0]!, 0).every((item) => item.status === "assistant_suggestion")).toBe(true);
  });

  it("marks hedged statements unresolved with low confidence", () => {
    const items = classifyMessage(message("m3", "user", "Maybe we should use PostgreSQL."), 2);
    const technology = items.find((item) => item.category === "technology");

    expect(technology?.status).toBe("unresolved");
    expect(technology?.confidence).toBe("low");
  });

  it("treats a capable-sounding assistant recommendation as a suggestion when it proposes a tool", () => {
    const items = classifyMessage(message("m4", "assistant", "You can use PostgreSQL as the database."), 3);
    const decision = items.find((item) => item.category === "decision");

    expect(decision?.status).toBe("assistant_suggestion");
    expect(decision?.topicKey).toBe("choice:database");
    expect(decision?.valueKey).toBe("postgresql");
  });

  it("recognizes completed work, current progress, next steps, and explicitly marked facts", () => {
    const items = classifyMessage(message("m5", "user", [
      "Completed: implemented batch merging.",
      "Currently in progress: context validation.",
      "Next step: add a Markdown preview.",
      "Fact: source message IDs must remain traceable.",
    ].join("\n")), 4);

    expect(items.map((item) => item.category)).toEqual(expect.arrayContaining([
      "completed_work", "progress", "next_step", "important_fact",
    ]));
  });

  it("ignores timestamped informational telemetry without hiding warning and error context", () => {
    const info = classifyMessage(message("info", "assistant", "- 2026-11-25 01:19:52.426 [info] Reasoning summary item completed itemId=abc summary=[]"), 0);
    const warning = classifyMessage(message("warning", "assistant", "- 2026-11-25 01:19:52.426 [warning] [CodexMcpConnection] failed to initialize: startup failed. (os error 3)"), 1);
    const quotedLog = classifyMessage(message("quoted-log", "assistant", "The log says `Reasoning summary item completed`."), 2);

    expect(info).toEqual([]);
    expect(quotedLog.some((item) => item.category === "completed_work")).toBe(false);
    expect(warning.filter((item) => item.category === "problem")).toHaveLength(1);
    expect(warning.find((item) => item.category === "problem")?.text).toContain("(os error 3)");
  });

  it("keeps explicit references but does not promote raw telemetry URLs", () => {
    const markdown = classifyMessage(message("link", "assistant", "Read the [guide](https://example.com/docs)."), 0);
    const contextual = classifyMessage(message("contextual-link", "user", "See https://example.com/docs for details."), 1);
    const telemetry = classifyMessage(message("telemetry", "assistant", "[error] Failed request url=https://chatgpt.com/ces/v1/rgstr?threadId=abc"), 2);
    const linkedTelemetry = classifyMessage(message("linked-telemetry", "user", "- 2026-11-25 [error] Error fetching url=[https://chatgpt.com/ces/v1/rgstr?sid=abc](https://chatgpt.com/ces/v1/rgstr?sid=abc)"), 3);

    expect(markdown.some((item) => item.category === "code_reference")).toBe(true);
    expect(contextual.some((item) => item.category === "code_reference")).toBe(true);
    expect(telemetry).toEqual([]);
    expect(linkedTelemetry).toEqual([]);
    expect(classifyMessage(message("explanation", "assistant", "These logs are not errors. This is a network error unrelated to authentication."), 3)
      .some((item) => item.category === "problem")).toBe(false);
  });

  it("does not accept multiple conflicting assistant alternatives from a vague yes", () => {
    const items = classifyMessages([
      message("assistant-options", "assistant", "You could use PostgreSQL or SQL Server as the database."),
      message("user-yes", "user", "Yes."),
    ]).filter((item) => item.category === "decision");

    expect(items).toHaveLength(2);
    expect(items.every((item) => item.status === "assistant_suggestion")).toBe(true);
    expect(items.every((item) => item.sourceRefs.length === 1 && item.sourceRefs[0]?.role === "assistant")).toBe(true);
    expect(resolveConflicts(items).conflicts[0]?.status).toBe("unresolved");
  });
});
