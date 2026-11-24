import { describe, expect, it } from "vitest";
import { classifyMessages } from "../../../../src/core/process/classify";
import { deduplicateItems } from "../../../../src/core/process/deduplicate";
import { normalizeConversation } from "../../../../src/core/normalize/normalize-conversation";

describe("deduplicateItems", () => {
  it("merges exact repeated facts while retaining variants and every source message", () => {
    const conversation = normalizeConversation({
      conversationId: "dedupe-conversation",
      title: null,
      messages: [
        { role: "user", content: "We must use React." },
        { role: "user", content: "we must use React" },
      ],
    });
    const items = classifyMessages(conversation.messages);

    const deduplicated = deduplicateItems(items);

    expect(deduplicated).toHaveLength(2); // Both requirement and technology classifications remain.
    for (const item of deduplicated) {
      expect(item.sourceRefs.map((source) => source.messageId)).toEqual(conversation.messages.map((message) => message.message_id));
      expect(item.textVariants).toHaveLength(2);
    }
  });

  it("does not merge negation, changed technical details, or different speakers", () => {
    const conversation = normalizeConversation({
      conversationId: "dedupe-distinct",
      title: null,
      messages: [
        { role: "user", content: "We must use React." },
        { role: "user", content: "We must not use React." },
        { role: "assistant", content: "We must use React." },
        { role: "user", content: "The requirement is to set FOO_BAR." },
        { role: "user", content: "The requirement is to set FOOBAR." },
      ],
    });

    expect(deduplicateItems(classifyMessages(conversation.messages))).toHaveLength(8);
  });

  it("collapses a long same-source log fragment while retaining both original quotes", () => {
    const conversation = normalizeConversation({
      conversationId: "dedupe-log-fragments",
      title: null,
      messages: [{
        role: "user",
        content: [
          "- 2026-11-25 01:18:32.702 [warning] [CodexMcpConnection] cli: message=\"codex_mcp::rmcp_client: failed to initialize MCP client during shutdown: MCP startup failed: The system cannot find the path specified. (os error 3)\" ye kia hy aaaaab",
          "- 2026-11-25 01:18:32.702 [warning] [CodexMcpConnection] cli: message=\"codex_mcp::rmcp_client: failed to initialize MCP client during shutdown: MCP startup failed: The system cannot find the path specified. (os error 3)\"",
        ].join("\n"),
      }],
    });

    const problems = deduplicateItems(classifyMessages(conversation.messages))
      .filter((item) => item.category === "problem");

    expect(problems).toHaveLength(1);
    expect(problems[0]?.textVariants).toHaveLength(2);
    expect(problems[0]?.sourceRefs).toHaveLength(2);
    expect(problems[0]?.text).toContain("ye kia hy aaaaab");
  });
});
