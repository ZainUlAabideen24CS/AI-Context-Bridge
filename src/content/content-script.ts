import type { RuntimeRequest, RuntimeResponse } from "../shared/types/messages";
import type { ExtractionProgress } from "../shared/types/conversation";
import { normalizeConversation } from "../core/normalize/normalize-conversation";
import { validateConversation } from "../core/validate/validate-conversation";
import { ChatGptAdapter } from "./adapters/chatgpt-adapter";
import { detectPlatform } from "./platform-detection";

const contentWindow = window as Window & { __aiContextBridgeInstalled?: boolean };

if (!contentWindow.__aiContextBridgeInstalled) {
  contentWindow.__aiContextBridgeInstalled = true;
  chrome.runtime.onMessage.addListener((message: RuntimeRequest, _sender, sendResponse: (response: RuntimeResponse) => void) => {
    if (message.type === "CONTENT_DETECT_PLATFORM") {
      try {
        sendResponse({
          ok: true,
          result: detectPlatform(window.location.href, document.title),
        });
      } catch {
        sendResponse({ ok: false, error: "Could not detect the platform on this page." });
      }
      return;
    }

    if (message.type !== "CONTENT_EXTRACT_CONVERSATION") return;

    try {
      const reportProgress = (stage: ExtractionProgress["stage"], progressMessage: string) => {
        const progress: ExtractionProgress = { requestId: message.requestId, stage, message: progressMessage };
        void chrome.runtime.sendMessage({ type: "EXTRACTION_PROGRESS", progress } satisfies RuntimeRequest).catch(() => undefined);
      };

      reportProgress("extracting", "Reading messages currently shown on the page...");
      const extracted = new ChatGptAdapter().extract(document, window.location.href);
      reportProgress("validating", "Checking messages and preparing the conversation data...");

      const normalized = normalizeConversation(extracted.conversation);
      const { conversation, validation } = validateConversation(normalized);
      reportProgress("complete", "Extraction complete.");
      sendResponse({
        ok: true,
        result: {
          conversation,
          source_url: extracted.sourceUrl,
          extracted_at: new Date().toISOString(),
          warnings: extracted.warnings,
          validation,
        },
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "An unexpected extraction error occurred.";
      sendResponse({ ok: false, error: `Could not extract this conversation. ${detail}` });
    }
  });
}
