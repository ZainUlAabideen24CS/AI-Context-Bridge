import type { UniversalConversation } from "../../shared/types/conversation";
import type { ContextBatch, ContextEngineOptions } from "./types";

const DEFAULT_MAX_MESSAGES = 40;
const DEFAULT_MAX_CHARACTERS = 24_000;

export function createMessageBatches(
  conversation: UniversalConversation,
  options: ContextEngineOptions = {},
): ContextBatch[] {
  const maxMessages = Math.max(1, Math.floor(options.maxBatchMessages ?? DEFAULT_MAX_MESSAGES));
  const maxCharacters = Math.max(1, Math.floor(options.maxBatchCharacters ?? DEFAULT_MAX_CHARACTERS));
  const batches: ContextBatch[] = [];
  let current: ContextBatch | null = null;

  const flush = () => {
    if (!current) return;
    current.index = batches.length;
    batches.push(current);
    current = null;
  };

  conversation.messages.forEach((message, messageIndex) => {
    const characterCount = message.content.length;
    const exceedsCurrent = current !== null && (
      current.messages.length >= maxMessages || current.characterCount + characterCount > maxCharacters
    );
    if (exceedsCurrent) flush();

    if (!current) {
      current = {
        index: batches.length,
        startMessageIndex: messageIndex,
        messages: [],
        characterCount: 0,
        oversizedMessageIds: [],
      };
    }

    current.messages.push(message);
    current.characterCount += characterCount;
    if (characterCount > maxCharacters) current.oversizedMessageIds.push(message.message_id);
  });

  flush();
  return batches;
}
