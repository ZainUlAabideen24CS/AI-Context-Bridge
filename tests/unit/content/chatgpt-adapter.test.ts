// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { ChatGptAdapter } from "../../../src/content/adapters/chatgpt-adapter";

describe("ChatGptAdapter", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.title = "Choose Approval Mode | ChatGPT";
  });

  it("extracts the current ChatGPT timeline markup in chronological order", () => {
    document.body.innerHTML = `
      <main>
        <h1>Choose Approval Mode</h1>
        <div data-app-action-timeline-scroll role="region">
          <div data-turn-key="user-message-id">
            <div data-content-search-unit-key="fallback-turn-1:0:user" data-chatgpt-search-message-ids="user-message-id user-message-id">
              <div data-user-message-bubble="true">
                <div data-search-result-target>
                  <p>Pick an approach</p>
                  <ul><li>First option</li><li>Second option</li></ul>
                </div>
              </div>
            </div>
          </div>
          <div data-turn-key="assistant-message-id">
            <div data-content-search-unit-key="fallback-turn-1:1:assistant" data-chatgpt-search-message-ids="assistant-message-id">
              <div data-response-body>
                <h2>Recommended approach</h2>
                <p>Read <a href="https://example.com/guide">the guide</a>.</p>
                <pre><code class="language-ts">const approved = true;</code></pre>
              </div>
            </div>
          </div>
        </div>
      </main>`;

    const result = new ChatGptAdapter().extract(document, "https://chatgpt.com/c/conversation-123");

    expect(result.conversation.title).toBe("Choose Approval Mode");
    expect(result.conversation.conversationId).toBe("conversation-123");
    expect(result.conversation.messages).toHaveLength(2);
    expect(result.conversation.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(result.conversation.messages[0]).toMatchObject({
      sourceId: "user-message-id",
      content: expect.stringContaining("- First option"),
    });
    expect(result.conversation.messages[1]).toMatchObject({
      sourceId: "assistant-message-id",
      content: expect.stringContaining("## Recommended approach"),
    });
    expect(result.conversation.messages[1]?.content).toContain("[the guide](https://example.com/guide)");
    expect(result.conversation.messages[1]?.content).toContain("```ts\nconst approved = true;");
    expect(result.warnings.join(" ")).toContain("completeness could not be verified");
  });

  it("keeps support for the legacy message-role markup", () => {
    document.body.innerHTML = `
      <main>
        <article><div data-message-author-role="user" data-message-id="legacy-user"><p>Question</p></div></article>
        <article><div data-message-author-role="assistant" data-message-id="legacy-assistant"><p>Answer</p></div></article>
      </main>`;

    const result = new ChatGptAdapter().extract(document, "https://chatgpt.com/c/legacy-conversation");

    expect(result.conversation.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(result.conversation.messages.map((message) => message.sourceId)).toEqual(["legacy-user", "legacy-assistant"]);
  });
});
