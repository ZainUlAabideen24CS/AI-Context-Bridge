export type SupportedPlatform = "chatgpt";

export interface PlatformDetectionResult {
  platform: SupportedPlatform | null;
  supported: boolean;
  pageTitle: string;
  pageUrl: string;
  message: string;
}
