import { deduplicateItems } from "./deduplicate";
import type { ContextItem, ContextRelationship, MergedContext, ProcessedBatch } from "./types";

function createStarRelationships(
  items: readonly ContextItem[],
  keyOf: (item: ContextItem) => string | null,
  type: ContextRelationship["type"],
): ContextRelationship[] {
  const groups = new Map<string, ContextItem[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  const relationships: ContextRelationship[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const anchor = group[0];
    if (!anchor) continue;
    for (const related of group.slice(1)) {
      relationships.push({ fromItemId: anchor.id, toItemId: related.id, type });
    }
  }
  return relationships;
}

export function mergeBatchResults(batches: readonly ProcessedBatch[]): MergedContext {
  const allItems = batches.flatMap((batch) => batch.items);
  const items = deduplicateItems(allItems);
  const sameTopic = createStarRelationships(items, (item) => item.topicKey, "same_topic");
  const sameSource = createStarRelationships(items, (item) => {
    const uniqueMessageIds = [...new Set(item.sourceRefs.map((source) => source.messageId))];
    return uniqueMessageIds.length === 1 ? uniqueMessageIds[0] ?? null : null;
  }, "same_source");

  return { items, relationships: [...sameTopic, ...sameSource] };
}
