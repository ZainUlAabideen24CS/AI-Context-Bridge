import type { PlatformDetectionResult, SupportedPlatform } from "../shared/types/platform";

export function detectPlatform(url: string, pageTitle: string): PlatformDetectionResult {
  let hostname: string;

  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return {
      platform: null,
      supported: false,
      pageTitle,
      pageUrl: url,
      message: "This page address could not be recognized.",
    };
  }

  const platform: SupportedPlatform | null =
    hostname === "chatgpt.com" || hostname.endsWith(".chatgpt.com") || hostname === "chat.openai.com"
      ? "chatgpt"
      : null;

  return {
    platform,
    supported: platform !== null,
    pageTitle,
    pageUrl: url,
    message: platform === "chatgpt" ? "ChatGPT is ready." : "This platform is not supported yet.",
  };
}
