import type { ContextItem, ContextSourceReference } from "./types";

function normalizeTextForComparison(text: string, preserveWhitespace: boolean): string {
  const normalized = text.normalize("NFKC").replace(/\r\n?/g, "\n");
  if (preserveWhitespace) return normalized.trim();

  return normalized
    .replace(/^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+)/gm, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim()
    .toLocaleLowerCase("en-US");
}

function comparisonKey(item: ContextItem): string {
  const normalizedText = normalizeTextForComparison(item.text, item.category === "code_reference");
  return [item.category, item.originRole, item.status, item.topicKey ?? "", item.valueKey ?? "", normalizedText].join("\u0000");
}

function comparisonScope(item: ContextItem): string {
  return [item.category, item.originRole, item.status, item.topicKey ?? "", item.valueKey ?? ""].join("\u0000");
}

function normalizedForContainment(text: string): string {
  return normalizeTextForComparison(text, false).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function isSameSourceLogFragment(left: ContextItem, right: ContextItem): boolean {
  if (comparisonScope(left) !== comparisonScope(right)) return false;
  const leftSources = new Set(left.sourceRefs.map((source) => source.messageId));
  if (!right.sourceRefs.some((source) => leftSources.has(source.messageId))) return false;
  const a = normalizedForContainment(left.text);
  const b = normalizedForContainment(right.text);
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  // Restrict fuzzy containment to substantial text to avoid merging short,
  // meaningful phrases such as a technology name or status word.
  return shorter.length >= 60 && longer.includes(shorter);
}

function referenceKey(source: ContextSourceReference): string {
  return `${source.messageId}\u0000${source.role}\u0000${source.quote}`;
}

const confidenceRank: Record<ContextItem["confidence"], number> = { low: 1, medium: 2, high: 3 };

/** Merges only normalized exact repeats; all wording variants and source references are retained. */
export function deduplicateItems(items: readonly ContextItem[]): ContextItem[] {
  const merged = new Map<string, ContextItem>();

  for (const item of items) {
    const key = comparisonKey(item);
    const exact = merged.get(key);
    const existing = exact ?? [...merged.values()].find((candidate) => isSameSourceLogFragment(candidate, item));
    if (!existing) {
      merged.set(key, {
        ...item,
        textVariants: [...new Set(item.textVariants.length > 0 ? item.textVariants : [item.text])],
        sourceRefs: [...item.sourceRefs],
      });
      continue;
    }

    existing.textVariants = [...new Set([...existing.textVariants, item.text, ...item.textVariants])];
    if (item.text.length > existing.text.length) existing.text = item.text;
    const references = new Map(existing.sourceRefs.map((source) => [referenceKey(source), source]));
    for (const source of item.sourceRefs) references.set(referenceKey(source), source);
    existing.sourceRefs = [...references.values()].sort((left, right) => left.messageIndex - right.messageIndex);
    if (confidenceRank[item.confidence] > confidenceRank[existing.confidence]) existing.confidence = item.confidence;
    existing.priority = Math.max(existing.priority, item.priority);
    if (existing.resolution === "active" && item.resolution !== "active") existing.resolution = item.resolution;
  }

  return [...merged.values()];
}
