import type { ConversationRole, MessageContentType } from "../../shared/types/conversation";
import type { ExtractedConversation, ExtractedMessage } from "../../core/normalize/types";

// Keep ChatGPT-specific selectors in this adapter so website changes stay isolated.
const SELECTORS = {
  timeline: '[data-app-action-timeline-scroll][role="region"]',
  userBubble: '[data-user-message-bubble="true"]',
  assistantUnit: '[data-content-search-unit-key$=":assistant"]',
  messageInMain: 'main [data-message-author-role="user"], main [data-message-author-role="assistant"]',
  messageAnywhere: '[data-message-author-role="user"], [data-message-author-role="assistant"]',
  turn: 'article[data-turn], article[data-testid^="conversation-turn"]',
  conversationTitle: '[data-testid="conversation-title"], main h1',
  timestamp: "time[datetime]",
} as const;

const EXCLUDED_TAGS = new Set(["BUTTON", "SCRIPT", "STYLE", "SVG", "NAV"]);
const BLOCK_TAGS = new Set(["ADDRESS", "ARTICLE", "ASIDE", "DIV", "P", "SECTION"]);

function cleanBlock(value: string): string {
  return value
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeLink(href: string, baseUrl: string): string | null {
  try {
    const url = new URL(href, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function renderList(element: Element, baseUrl: string, depth: number): string {
  const ordered = element.tagName === "OL";
  const items = Array.from(element.children).filter((child) => child.tagName === "LI");
  return items.map((item, index) => {
    const nestedLists = Array.from(item.children).filter((child) => child.tagName === "UL" || child.tagName === "OL");
    const content = Array.from(item.childNodes)
      .filter((child) => !(child instanceof Element && (child.tagName === "UL" || child.tagName === "OL")))
      .map((child) => renderNode(child, baseUrl, depth + 1))
      .join("")
      .trim();
    const indent = "  ".repeat(depth);
    const marker = ordered ? `${index + 1}.` : "-";
    const nested = nestedLists.map((list) => renderList(list, baseUrl, depth + 1)).filter(Boolean).join("\n");
    return `${indent}${marker} ${content}${nested ? `\n${nested}` : ""}`;
  }).join("\n");
}

function renderNode(node: Node, baseUrl: string, depth = 0): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof Element)) return "";

  const element = node;
  const tag = element.tagName;
  if (EXCLUDED_TAGS.has(tag) || element.getAttribute("aria-hidden") === "true" || element.getAttribute("data-testid")?.includes("toolbar")) {
    return "";
  }

  if (tag === "BR") return "\n";
  if (tag === "PRE") {
    const code = element.querySelector("code");
    const content = (code?.textContent ?? element.textContent ?? "").replace(/\n+$/, "");
    const languageClass = code?.className.match(/(?:^|\s)language-([\w+-]+)/)?.[1] ?? "";
    return `\n\n\`\`\`${languageClass}\n${content}\n\`\`\`\n\n`;
  }
  if (tag === "UL" || tag === "OL") return `\n${renderList(element, baseUrl, depth)}\n`;

  const children = Array.from(element.childNodes).map((child) => renderNode(child, baseUrl, depth)).join("");
  if (/^H[1-6]$/.test(tag)) {
    const level = Number(tag.slice(1));
    return `\n\n${"#".repeat(level)} ${children.trim()}\n\n`;
  }
  if (tag === "A") {
    const href = element.getAttribute("href");
    const url = href ? safeLink(href, baseUrl) : null;
    const label = children.trim() || url || "";
    return url ? `[${label}](${url})` : label;
  }
  if (tag === "CODE") return `\`${children.trim()}\``;
  if (tag === "BLOCKQUOTE") return `\n\n${children.trim().split("\n").map((line) => `> ${line}`).join("\n")}\n\n`;
  if (tag === "LI") return `- ${children.trim()}`;
  if (BLOCK_TAGS.has(tag)) return `\n${children.trim()}\n`;
  return children;
}

function serializeMessage(element: Element, baseUrl: string): { content: string; contentType: MessageContentType } {
  const content = cleanBlock(Array.from(element.childNodes).map((child) => renderNode(child, baseUrl)).join(""));
  const contentType = element.querySelector("pre, h1, h2, h3, h4, h5, h6, ul, ol, a, blockquote")
    ? "rich_text"
    : "text";
  return { content, contentType };
}

function findMessageElements(document: Document): Element[] {
  const timeline = document.querySelector(SELECTORS.timeline);
  const scope: ParentNode = timeline ?? document;
  const currentShell = Array.from(scope.querySelectorAll(`${SELECTORS.userBubble}, ${SELECTORS.assistantUnit}`));
  if (currentShell.length > 0) {
    // Assistant units can be nested; keep the outer unit to avoid duplicate text.
    return currentShell.filter((element) => {
      if (!element.matches(SELECTORS.assistantUnit)) return true;
      return !element.parentElement?.closest(SELECTORS.assistantUnit);
    });
  }

  const legacyInMain = Array.from(scope.querySelectorAll(SELECTORS.messageInMain));
  if (legacyInMain.length > 0) return legacyInMain;

  const legacyAnywhere = Array.from(scope.querySelectorAll(SELECTORS.messageAnywhere));
  if (legacyAnywhere.length > 0) return legacyAnywhere;

  return Array.from(scope.querySelectorAll(SELECTORS.turn));
}

function roleFor(element: Element): ConversationRole | null {
  const explicitRole = element.getAttribute("data-message-author-role") ?? element.getAttribute("data-turn");
  if (explicitRole === "user" || explicitRole === "assistant") return explicitRole;
  if (element.matches(SELECTORS.userBubble)) return "user";
  if (element.matches(SELECTORS.assistantUnit)) return "assistant";

  const turnRole = element.closest(SELECTORS.turn)?.getAttribute("data-turn");
  return turnRole === "user" || turnRole === "assistant" ? turnRole : null;
}

function messageContentRoot(element: Element, role: ConversationRole): Element {
  const currentShellContent = role === "user"
    ? element.querySelector("[data-search-result-target], .bg-user-message, .user-message-bubble-color")
    : element.querySelector("[data-response-body], [data-markdown-copy], [data-dil-response]");
  return currentShellContent ?? element;
}

function sourceMessageId(element: Element): string | null {
  const directId = element.getAttribute("data-message-id");
  if (directId || element.id) return directId || element.id;

  const messageIdContainer = element.closest("[data-chatgpt-search-message-ids]");
  const searchMessageIds = messageIdContainer?.getAttribute("data-chatgpt-search-message-ids");
  if (searchMessageIds) {
    const uniqueIds = [...new Set(searchMessageIds.trim().split(/\s+/).filter(Boolean))];
    if (uniqueIds.length > 0) return uniqueIds[0] ?? null;
  }

  const turnKey = element.closest("[data-turn-key]")?.getAttribute("data-turn-key");
  return turnKey || element.getAttribute("data-turn-id");
}

function conversationIdFromUrl(url: URL): string {
  const parts = url.pathname.split("/").filter(Boolean);
  const conversationIndex = parts.lastIndexOf("c");
  const conversationPart = conversationIndex >= 0 ? parts[conversationIndex + 1] : undefined;
  if (conversationPart) return conversationPart;
  return `page_${url.pathname.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "") || "home"}`;
}

function conversationTitle(document: Document): string | null {
  const titleElement = document.querySelector(SELECTORS.conversationTitle);
  const visibleTitle = titleElement?.textContent?.trim();
  if (visibleTitle && visibleTitle.toLowerCase() !== "chatgpt") return visibleTitle;

  const pageTitle = document.title.trim().replace(/\s*[|-]\s*chatgpt\s*$/i, "").trim();
  return pageTitle && pageTitle.toLowerCase() !== "chatgpt" ? pageTitle : null;
}

export class ChatGptAdapter {
  extract(document: Document, pageUrl: string): { conversation: ExtractedConversation; sourceUrl: string; warnings: string[] } {
    const url = new URL(pageUrl);
    const elements = findMessageElements(document);
    const messages: ExtractedMessage[] = [];
    const sourceIdOccurrences = new Map<string, number>();

    for (const element of elements) {
      const role = roleFor(element);
      if (!role) continue;

      const contentRoot = messageContentRoot(element, role);
      const { content, contentType } = serializeMessage(contentRoot, url.href);
      const nativeId = sourceMessageId(element);
      let sourceId = nativeId;
      if (nativeId) {
        const count = sourceIdOccurrences.get(nativeId) ?? 0;
        sourceIdOccurrences.set(nativeId, count + 1);
        if (count > 0) sourceId = `${nativeId}_${count}`;
      }

      const timestampElement = element.querySelector(SELECTORS.timestamp);
      const timestamp = timestampElement?.getAttribute("datetime") ?? null;
      messages.push({ sourceId, role, content, timestamp, contentType });
    }

    const warnings = [
      "Only messages currently rendered on this page were extracted. Full conversation completeness could not be verified; older or virtualized messages may be missing.",
    ];
    if (messages.length === 0) {
      warnings.push("No user or assistant messages were found. Confirm that a conversation is open and loaded.");
    }

    return {
      conversation: {
        conversationId: conversationIdFromUrl(url),
        title: conversationTitle(document),
        messages,
      },
      sourceUrl: url.href,
      warnings,
    };
  }
}
