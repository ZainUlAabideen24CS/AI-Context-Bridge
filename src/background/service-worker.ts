import type { RuntimeRequest, RuntimeResponse } from "../shared/types/messages";
import type { PlatformDetectionResult } from "../shared/types/platform";
import type { ExtractionProgress } from "../shared/types/conversation";

const CHATGPT_HOSTS = new Set(["chatgpt.com", "chat.openai.com"]);
const popupPorts = new Set<chrome.runtime.Port>();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "popup") return;
  popupPorts.add(port);
  port.onDisconnect.addListener(() => popupPorts.delete(port));
});

function broadcastProgress(progress: ExtractionProgress): void {
  for (const port of popupPorts) {
    try {
      port.postMessage({ type: "EXTRACTION_PROGRESS", progress });
    } catch {
      popupPorts.delete(port);
    }
  }
}

function isChatGptUrl(url: string | undefined): boolean {
  if (!url) return false;

  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return CHATGPT_HOSTS.has(hostname) || hostname.endsWith(".chatgpt.com");
  } catch {
    return false;
  }
}

async function detectActivePlatform(): Promise<RuntimeResponse> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id === undefined || !tab.url) {
      return { ok: false, error: "Could not access the active browser tab." };
    }

    if (!isChatGptUrl(tab.url)) {
      const result: PlatformDetectionResult = {
        platform: null,
        supported: false,
        pageTitle: tab.title ?? "",
        pageUrl: tab.url,
        message: "This platform is not supported yet. Open a ChatGPT page to continue.",
      };
      return { ok: true, result };
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content/content-script.js"],
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "The page blocked script injection.";
      return { ok: false, error: `Could not connect to this page. ${detail}` };
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "CONTENT_DETECT_PLATFORM",
    } satisfies RuntimeRequest) as RuntimeResponse | undefined;

    if (!response) return { ok: false, error: "The page did not respond. Please try again." };
    return response;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "An unexpected extension error occurred.";
    return { ok: false, error: detail };
  }
}

async function extractActiveConversation(requestId: string): Promise<RuntimeResponse> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id === undefined || !tab.url) {
      return { ok: false, error: "Could not access the active browser tab." };
    }
    if (!isChatGptUrl(tab.url)) {
      return { ok: false, error: "Open a ChatGPT conversation before extracting messages." };
    }

    broadcastProgress({ requestId, stage: "connecting", message: "Connecting to ChatGPT..." });
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content/content-script.js"],
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "The page blocked script injection.";
      return { ok: false, error: `Could not connect to the ChatGPT page. ${detail}` };
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "CONTENT_EXTRACT_CONVERSATION",
      requestId,
    } satisfies RuntimeRequest) as RuntimeResponse | undefined;
    if (!response) return { ok: false, error: "ChatGPT did not respond. Reload the page and try again." };
    return response;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "An unexpected extension error occurred.";
    return { ok: false, error: `Could not extract the conversation. ${detail}` };
  }
}

chrome.runtime.onMessage.addListener((message: RuntimeRequest, _sender, sendResponse: (response: RuntimeResponse) => void) => {
  if (message.type === "EXTRACTION_PROGRESS") {
    broadcastProgress(message.progress);
    return;
  }

  if (message.type === "DETECT_ACTIVE_PLATFORM") {
    void detectActivePlatform().then(sendResponse).catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : "Could not detect the current platform.";
      sendResponse({ ok: false, error: detail });
    });
    return true;
  }

  if (message.type === "EXTRACT_ACTIVE_CONVERSATION") {
    void extractActiveConversation(message.requestId).then(sendResponse).catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : "Could not extract the current conversation.";
      sendResponse({ ok: false, error: detail });
    });
    return true;
  }

  return;
});
