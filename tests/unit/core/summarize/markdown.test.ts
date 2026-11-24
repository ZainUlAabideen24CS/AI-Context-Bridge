import { describe, expect, it } from "vitest";
import { classifyMessages } from "../../../../src/core/process/classify";
import { prioritizeItems } from "../../../../src/core/process/prioritize";
import { renderContextMarkdown } from "../../../../src/core/summarize/markdown";
import { normalizeConversation } from "../../../../src/core/normalize/normalize-conversation";

describe("renderContextMarkdown", () => {
  it("renders applicable SRS sections, speaker status, and message traceability without adding empty sections", () => {
    const conversation = normalizeConversation({
      conversationId: "summary-conversation",
      title: "Portable context",
      messages: [
        { role: "user", content: "The project must preserve technical details." },
        { role: "assistant", content: "You could use TypeScript." },
      ],
    });
    const markdown = renderContextMarkdown(conversation, prioritizeItems(classifyMessages(conversation.messages)), [], ["Extraction completeness is unknown."]);

    expect(markdown).toContain("## Conversation Overview");
    expect(markdown).toContain("## User Requirements");
    expect(markdown).toContain("## Technology and Tools");
    expect(markdown).toContain("User statement");
    expect(markdown).toContain("Assistant suggestion");
    expect(markdown).toContain(conversation.messages[0]?.message_id ?? "");
    expect(markdown).toContain("Extraction completeness is unknown.");
    expect(markdown).not.toContain("## Pending Tasks");
  });

  it("shows the user-reported problem without repeating assistant diagnostic fragments", () => {
    const conversation = normalizeConversation({
      conversationId: "summary-problem-grouping",
      title: "Startup issue",
      messages: [
        { role: "user", content: "The MCP startup failed and the path was not found." },
        { role: "assistant", content: "MCP startup failed. The system cannot find the path specified. Activation failed." },
      ],
    });
    const items = classifyMessages(conversation.messages);
    const problemItems = items.filter((item) => item.category === "problem");
    const markdown = renderContextMarkdown(conversation, items, []);

    expect(problemItems.length).toBeGreaterThan(1);
    expect(items.some((item) => item.originRole === "assistant" && item.category === "problem")).toBe(true);
    expect(markdown).toContain("User statement");
    expect(markdown).toContain("MCP startup failed");
    expect(markdown).not.toContain("Assistant statement;");
    expect(markdown).toContain(conversation.messages[0]?.message_id ?? "");
    expect(problemItems.some((item) => item.sourceRefs.some((source) => source.messageId === conversation.messages[1]?.message_id))).toBe(true);
  });

  it("groups assistant-only problem fragments from one message into one entry", () => {
    const conversation = normalizeConversation({
      conversationId: "summary-assistant-problem",
      title: null,
      messages: [{
        role: "assistant",
        content: "MCP startup failed. The system cannot find the path specified. Activation failed.",
      }],
    });
    const items = classifyMessages(conversation.messages);
    const markdown = renderContextMarkdown(conversation, items, []);

    expect(markdown.match(/\*\*Assistant statement;/g)).toHaveLength(1);
    expect(markdown).toContain("MCP startup failed.");
    expect(markdown).toContain("The system cannot find the path specified.");
    expect(markdown).toContain("Activation failed.");
  });

  it("cleans log metadata from the Markdown display while preserving its source trace", () => {
    const conversation = normalizeConversation({
      conversationId: "summary-clean-log",
      title: null,
      messages: [{
        role: "user",
        content: '2026-11-25 01:18:32.702 [warning] [CodexMcpConnection] cli: message="codex_mcp::rmcp_client: failed to initialize MCP client: The system cannot find the path specified. (os error 3)" ye kia hy',
      }],
    });
    const items = classifyMessages(conversation.messages);
    const markdown = renderContextMarkdown(conversation, items, []);

    expect(markdown).not.toContain("2026-11-25 01:18:32.702");
    expect(markdown).not.toContain("[CodexMcpConnection]");
    expect(markdown).toContain("codex_mcp::rmcp_client: failed to initialize MCP client");
    expect(markdown).toContain("ye kia hy");
    expect(markdown).toContain(conversation.messages[0]?.message_id ?? "");
    expect(items[0]?.sourceRefs[0]?.quote).toContain("2026-11-25 01:18:32.702");
  });
});
