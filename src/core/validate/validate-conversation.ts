import type { ConversationValidation, UniversalConversation } from "../../shared/types/conversation";

export interface ValidationResult {
  conversation: UniversalConversation;
  validation: ConversationValidation;
}

export function validateConversation(conversation: UniversalConversation): ValidationResult {
  let emptyMessageCount = 0;
  let duplicateMessageCount = 0;
  const seen = new Set<string>();
  const messages = conversation.messages.filter((message) => {
    if (!message.content.trim()) {
      emptyMessageCount += 1;
      return false;
    }

    const key = `${message.role}\u0000${message.content.trim()}`;
    if (seen.has(key)) duplicateMessageCount += 1;
    else seen.add(key);
    return true;
  });

  const warnings: string[] = [];
  if (emptyMessageCount > 0) {
    warnings.push(`${emptyMessageCount} empty message${emptyMessageCount === 1 ? " was" : "s were"} excluded.`);
  }
  if (duplicateMessageCount > 0) {
    warnings.push(`${duplicateMessageCount} exact duplicate message${duplicateMessageCount === 1 ? " was" : "s were"} detected and retained.`);
  }

  return {
    conversation: { ...conversation, messages },
    validation: { emptyMessageCount, duplicateMessageCount, warnings },
  };
}
