import type { SupportedPlatform } from "./platform";

export type ConversationRole = "user" | "assistant";
export type MessageContentType = "text" | "rich_text";

export interface UniversalMessage {
  conversation_id: string;
  message_id: string;
  platform: SupportedPlatform;
  role: ConversationRole;
  content: string;
  timestamp: string | null;
  content_type: MessageContentType;
}

export interface UniversalConversation {
  conversation_id: string;
  platform: SupportedPlatform;
  title: string | null;
  messages: UniversalMessage[];
}

export interface ConversationValidation {
  emptyMessageCount: number;
  duplicateMessageCount: number;
  warnings: string[];
}

export interface ConversationExtractionResult {
  conversation: UniversalConversation;
  source_url: string;
  extracted_at: string;
  warnings: string[];
  validation: ConversationValidation;
}

export type ExtractionProgressStage = "connecting" | "extracting" | "validating" | "complete";

export interface ExtractionProgress {
  requestId: string;
  stage: ExtractionProgressStage;
  message: string;
}
