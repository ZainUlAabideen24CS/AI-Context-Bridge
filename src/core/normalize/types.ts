import type { ConversationRole, MessageContentType } from "../../shared/types/conversation";

export interface ExtractedMessage {
  sourceId?: string | null;
  role: ConversationRole;
  content: string;
  timestamp?: string | null;
  contentType?: MessageContentType;
}

export interface ExtractedConversation {
  conversationId: string;
  title: string | null;
  messages: ExtractedMessage[];
}
