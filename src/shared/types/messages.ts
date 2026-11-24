import type { PlatformDetectionResult } from "./platform";
import type { ConversationExtractionResult, ExtractionProgress } from "./conversation";

export type RuntimeRequest =
  | { type: "DETECT_ACTIVE_PLATFORM" }
  | { type: "CONTENT_DETECT_PLATFORM" }
  | { type: "EXTRACT_ACTIVE_CONVERSATION"; requestId: string }
  | { type: "CONTENT_EXTRACT_CONVERSATION"; requestId: string }
  | { type: "EXTRACTION_PROGRESS"; progress: ExtractionProgress };

export type RuntimeResponse =
  | { ok: true; result: PlatformDetectionResult }
  | { ok: true; result: ConversationExtractionResult }
  | { ok: false; error: string };
