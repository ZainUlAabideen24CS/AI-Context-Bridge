import { useState } from "react";
import type { ConversationExtractionResult, ExtractionProgress, ExtractionProgressStage } from "../shared/types/conversation";
import type { ContextProcessResult } from "../core/process/types";
import { processConversation } from "../core/process/pipeline";
import type { RuntimeRequest, RuntimeResponse } from "../shared/types/messages";
import type { PlatformDetectionResult } from "../shared/types/platform";

type ExtractionState =
  | { status: "idle" }
  | { status: "loading"; stage: ExtractionProgressStage; message: string }
  | { status: "success"; result: ConversationExtractionResult }
  | { status: "error"; message: string };

export default function App() {
  const [detection, setDetection] = useState<PlatformDetectionResult | null>(null);
  const [detectionError, setDetectionError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [extraction, setExtraction] = useState<ExtractionState>({ status: "idle" });
  const [contextResult, setContextResult] = useState<ContextProcessResult | null>(null);
  const [processingContext, setProcessingContext] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  async function checkCurrentPage() {
    setChecking(true);
    setDetectionError(null);
    setDetection(null);
    setExtraction({ status: "idle" });
    setContextResult(null);
    setContextError(null);

    try {
      const request: RuntimeRequest = { type: "DETECT_ACTIVE_PLATFORM" };
      const response = await chrome.runtime.sendMessage(request) as RuntimeResponse;
      if (!response.ok) {
        setDetectionError(response.error);
        return;
      }
      if (!("supported" in response.result)) {
        setDetectionError("The extension received an unexpected response while checking this page.");
        return;
      }
      setDetection(response.result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not communicate with the extension.";
      setDetectionError(message);
    } finally {
      setChecking(false);
    }
  }

  async function extractConversation() {
    const requestId = crypto.randomUUID();
    setContextResult(null);
    setContextError(null);
    setExtraction({ status: "loading", stage: "connecting", message: "Connecting to ChatGPT…" });

    let port: chrome.runtime.Port | null = null;
    try {
      port = chrome.runtime.connect({ name: "popup" });
      port.onMessage.addListener((rawMessage: unknown) => {
        if (typeof rawMessage !== "object" || rawMessage === null) return;
        const message = rawMessage as { type?: string; progress?: ExtractionProgress };
        if (message.type === "EXTRACTION_PROGRESS" && message.progress?.requestId === requestId) {
          setExtraction((current) => current.status === "loading"
            ? { status: "loading", stage: message.progress!.stage, message: message.progress!.message }
            : current);
        }
      });

      const request: RuntimeRequest = { type: "EXTRACT_ACTIVE_CONVERSATION", requestId };
      const response = await chrome.runtime.sendMessage(request) as RuntimeResponse;
      if (!response.ok) {
        setExtraction({ status: "error", message: response.error });
        return;
      }
      if (!("conversation" in response.result)) {
        setExtraction({ status: "error", message: "The extension received an unexpected extraction response." });
        return;
      }
      setExtraction({ status: "success", result: response.result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not extract this conversation.";
      setExtraction({ status: "error", message });
    } finally {
      port?.disconnect();
    }
  }

  async function generateContext() {
    if (extraction.status !== "success") return;
    setProcessingContext(true);
    setContextError(null);
    setContextResult(null);

    try {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      const processed = processConversation(extraction.result.conversation, {
        extractionWarnings: [...extraction.result.warnings, ...extraction.result.validation.warnings],
      });
      setContextResult(processed);
      if (!processed.validation.valid) setContextError(processed.validation.errors.join(" "));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not process this conversation locally.";
      setContextError(message);
    } finally {
      setProcessingContext(false);
    }
  }

  const result = extraction.status === "success" ? extraction.result : null;

  return (
    <main className="w-[360px] bg-slate-50 p-5 text-slate-900">
      <header className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">AI Context Bridge</p>
        <h1 className="mt-1 text-xl font-bold">Carry your work forward</h1>
        <p className="mt-1 text-sm text-slate-600">Extract a ChatGPT conversation locally</p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-live="polite">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">Current platform</span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${detection?.supported ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
            {detection?.supported ? "ChatGPT" : "Not checked"}
          </span>
        </div>
        <p className={`mt-3 min-h-10 text-sm ${detectionError ? "text-rose-700" : "text-slate-600"}`}>
          {detectionError ?? detection?.message ?? "Check the active tab before extracting a conversation."}
        </p>
        <button
          type="button"
          onClick={() => void checkCurrentPage()}
          disabled={checking || extraction.status === "loading" || processingContext}
          className="mt-3 w-full rounded-lg border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-wait disabled:opacity-60"
        >
          {checking ? "Checking…" : "Check current page"}
        </button>
        {detection?.supported && (
          <button
            type="button"
            onClick={() => void extractConversation()}
            disabled={extraction.status === "loading" || processingContext}
            className="mt-2 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60"
          >
            {extraction.status === "loading" ? "Extracting…" : "Generate / Extract Conversation"}
          </button>
        )}
      </section>

      {extraction.status === "loading" && (
        <p className="mt-3 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800" role="status">
          {extraction.message}
        </p>
      )}

      {extraction.status === "error" && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {extraction.message}
        </p>
      )}

      {result && (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-live="polite">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">{result.conversation.title ?? "Untitled conversation"}</h2>
              <p className="mt-1 text-xs text-slate-500">{result.conversation.messages.length} messages extracted</p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${result.conversation.messages.length > 0 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
              {result.conversation.messages.length > 0 ? "Ready" : "No messages"}
            </span>
          </div>

          <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Conversation preview</h3>
          <div className="max-h-44 space-y-3 overflow-y-auto rounded-lg bg-slate-50 p-3">
            {result.conversation.messages.slice(0, 3).map((message) => (
              <article key={message.message_id}>
                <p className="mb-1 text-xs font-semibold capitalize text-indigo-700">{message.role}</p>
                <div className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700">{message.content}</div>
              </article>
            ))}
            {result.conversation.messages.length === 0 && <p className="text-xs text-slate-500">No non-empty messages were found.</p>}
            {result.conversation.messages.length > 3 && (
              <p className="border-t border-slate-200 pt-2 text-xs text-slate-500">Showing the first 3 of {result.conversation.messages.length} messages.</p>
            )}
          </div>

          {(result.warnings.length > 0 || result.validation.warnings.length > 0) && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <h3 className="text-xs font-semibold text-amber-900">Extraction warnings</h3>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-amber-900">
                {[...result.warnings, ...result.validation.warnings].map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}
              </ul>
            </div>
          )}
        </section>
      )}

      {result && (
        <section className="mt-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <button
            type="button"
            onClick={() => void generateContext()}
            disabled={processingContext || result.conversation.messages.length === 0}
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
          >
            {processingContext ? "Processing locally..." : "Generate Context Summary"}
          </button>
        </section>
      )}

      {contextError && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">{contextError}</p>}

      {contextResult && (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-live="polite">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Generated Context</h2>
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${contextResult.validation.valid ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
              {contextResult.validation.valid ? "Validated" : "Review needed"}
            </span>
          </div>
          {contextResult.context.conflicts.some((conflict) => conflict.status === "unresolved") && (
            <p className="mt-2 text-xs text-amber-800">Unresolved decisions are included for your review.</p>
          )}
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
            {contextResult.context.markdown}
          </pre>
        </section>
      )}

      <p className="mt-4 text-center text-xs text-slate-500">Messages are read from the current page only. Full history may not be loaded.</p>
    </main>
  );
}
