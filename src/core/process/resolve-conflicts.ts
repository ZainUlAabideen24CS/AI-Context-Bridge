import type { ContextConflict, ContextItem, ContextRelationship } from "./types";

export interface ConflictResolutionResult {
  items: ContextItem[];
  conflicts: ContextConflict[];
  relationships: ContextRelationship[];
}

function latestMessageIndex(item: ContextItem): number {
  return Math.max(-1, ...item.sourceRefs.map((source) => source.messageIndex));
}

function hasExplicitUserResolution(item: ContextItem): boolean {
  const hasUserEvidence = item.sourceRefs.some((source) => source.role === "user");
  return hasUserEvidence && (
    item.status === "accepted" ||
    (item.status === "user_stated" && (item.decisionIntent === "final" || item.decisionIntent === "correction"))
  );
}

function uniqueSourceReferences(items: readonly ContextItem[]) {
  const references = new Map<string, ContextItem["sourceRefs"][number]>();
  for (const item of items) {
    for (const source of item.sourceRefs) {
      references.set(`${source.messageId}\u0000${source.quote}`, source);
    }
  }
  return [...references.values()].sort((left, right) => left.messageIndex - right.messageIndex);
}

/** Resolves only clearly keyed decision conflicts; ambiguous alternatives remain visible. */
export function resolveConflicts(input: readonly ContextItem[]): ConflictResolutionResult {
  const items = input.map((item) => ({ ...item, sourceRefs: [...item.sourceRefs] }));
  const decisionGroups = new Map<string, ContextItem[]>();

  for (const item of items) {
    if (item.category !== "decision" || !item.topicKey || !item.valueKey) continue;
    const group = decisionGroups.get(item.topicKey) ?? [];
    group.push(item);
    decisionGroups.set(item.topicKey, group);
  }

  const conflicts: ContextConflict[] = [];
  const relationships: ContextRelationship[] = [];

  for (const [topicKey, group] of decisionGroups) {
    const values = new Set(group.map((item) => item.valueKey));
    if (values.size < 2) continue;

    const explicitChoices = group
      .filter(hasExplicitUserResolution)
      .sort((left, right) => latestMessageIndex(right) - latestMessageIndex(left));
    const latestExplicitChoice = explicitChoices[0];
    const nextExplicitChoice = explicitChoices.find((item) => item.valueKey !== latestExplicitChoice?.valueKey);
    const isUnambiguous = latestExplicitChoice !== undefined &&
      (!nextExplicitChoice || latestMessageIndex(latestExplicitChoice) > latestMessageIndex(nextExplicitChoice));

    if (isUnambiguous && latestExplicitChoice) {
      latestExplicitChoice.resolution = "active";
      for (const item of group) {
        if (item.valueKey !== latestExplicitChoice.valueKey && latestMessageIndex(item) < latestMessageIndex(latestExplicitChoice)) {
          item.resolution = "superseded";
          relationships.push({ fromItemId: latestExplicitChoice.id, toItemId: item.id, type: "supersedes" });
        }
      }
    } else {
      for (const item of group) item.resolution = "unresolved";
    }

    const conflictId = `conflict_${topicKey.replace(/[^a-zA-Z0-9]+/g, "_")}_${[...values].sort().join("_")}`;
    conflicts.push({
      id: conflictId,
      topicKey,
      itemIds: group.map((item) => item.id),
      sourceRefs: uniqueSourceReferences(group),
      status: isUnambiguous ? "resolved" : "unresolved",
      resolution: isUnambiguous ? latestExplicitChoice?.text ?? null : null,
    });
  }

  return { items, conflicts, relationships };
}
