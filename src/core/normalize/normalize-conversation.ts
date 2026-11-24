import type { UniversalConversation } from "../../shared/types/conversation";
import type { ExtractedConversation } from "./types";

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36).padStart(7, "0");
}

export function normalizeConversation(extracted: ExtractedConversation): UniversalConversation {
  const occurrences = new Map<string, number>();
  const conversationId = extracted.conversationId;

  const messages = extracted.messages.map((message) => {
    const content = message.content.replace(/\r\n?/g, "\n");
    const signature = `${message.role}\u0000${content}`;
    const occurrence = occurrences.get(signature) ?? 0;
    occurrences.set(signature, occurrence + 1);

    const messageId = message.sourceId?.trim()
      ? `chatgpt_${message.sourceId.trim()}`
      : `msg_${hash(`${conversationId}\u0000${signature}\u0000${occurrence}`)}`;

    return {
      conversation_id: conversationId,
      message_id: messageId,
      platform: "chatgpt" as const,
      role: message.role,
      content,
      timestamp: message.timestamp ?? null,
      content_type: message.contentType ?? "text",
    };
  });

  return {
    conversation_id: conversationId,
    platform: "chatgpt",
    title: extracted.title?.trim() || null,
    messages,
  };
}
