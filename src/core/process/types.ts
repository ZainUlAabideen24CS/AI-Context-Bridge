import type { ConversationRole, UniversalConversation } from "../../shared/types/conversation";
import type { SupportedPlatform } from "../../shared/types/platform";

export type ContextCategory =
  | "project"
  | "technology"
  | "requirement"
  | "decision"
  | "completed_work"
  | "progress"
  | "problem"
  | "code_reference"
  | "task"
  | "preference"
  | "important_fact"
  | "next_step";

export type ContextConfidence = "high" | "medium" | "low";
export type ContextStatus = "user_stated" | "assistant_suggestion" | "assistant_assertion" | "accepted" | "unresolved";
export type DecisionIntent = "initial" | "final" | "correction" | "ordinary";
export type ContextResolution = "active" | "unresolved" | "superseded";

export interface ContextSourceReference {
  messageId: string;
  role: ConversationRole;
  messageIndex: number;
  quote: string;
}

export interface ContextItem {
  id: string;
  category: ContextCategory;
  text: string;
  /** Alternate source wording is retained when punctuation/formatting-only duplicates merge. */
  textVariants: string[];
  confidence: ContextConfidence;
  status: ContextStatus;
  resolution: ContextResolution;
  originRole: ConversationRole;
  sourceRefs: ContextSourceReference[];
  priority: number;
  topicKey: string | null;
  valueKey: string | null;
  decisionIntent: DecisionIntent;
}

export interface ContextConflict {
  id: string;
  topicKey: string;
  itemIds: string[];
  sourceRefs: ContextSourceReference[];
  status: "resolved" | "unresolved";
  resolution: string | null;
}

export interface ContextRelationship {
  fromItemId: string;
  toItemId: string;
  type: "same_topic" | "same_source" | "supersedes";
}

export interface ContextBatch {
  index: number;
  startMessageIndex: number;
  messages: UniversalConversation["messages"];
  characterCount: number;
  oversizedMessageIds: string[];
}

export interface ContextEngineOptions {
  maxBatchMessages?: number;
  maxBatchCharacters?: number;
}

export interface ContextDocument {
  conversationId: string;
  title: string | null;
  platform: SupportedPlatform;
  messageCount: number;
  items: ContextItem[];
  conflicts: ContextConflict[];
  relationships: ContextRelationship[];
  warnings: string[];
  markdown: string;
}

export interface ContextValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ContextProcessResult {
  context: ContextDocument;
  validation: ContextValidationResult;
}

export interface ProcessedBatch {
  batch: ContextBatch;
  items: ContextItem[];
}

export interface MergedContext {
  items: ContextItem[];
  relationships: ContextRelationship[];
}
