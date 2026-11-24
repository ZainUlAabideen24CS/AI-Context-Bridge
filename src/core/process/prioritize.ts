import type { ContextCategory, ContextItem } from "./types";

const categoryPriority: Record<ContextCategory, number> = {
  project: 76,
  technology: 82,
  requirement: 92,
  decision: 84,
  completed_work: 70,
  progress: 86,
  problem: 90,
  code_reference: 88,
  task: 85,
  preference: 80,
  important_fact: 74,
  next_step: 93,
};

const statusAdjustment: Record<ContextItem["status"], number> = {
  user_stated: 8,
  accepted: 14,
  assistant_suggestion: -12,
  assistant_assertion: -8,
  unresolved: -2,
};

function priorityFor(item: ContextItem): number {
  let priority = categoryPriority[item.category] + statusAdjustment[item.status];
  if (item.category === "decision" && (item.decisionIntent === "final" || item.decisionIntent === "correction")) priority += 8;
  if (item.confidence === "high") priority += 3;
  if (item.confidence === "low") priority -= 15;
  if (item.sourceRefs.some((source) => source.role === "user")) priority += 2;
  return Math.max(0, Math.min(100, priority));
}

/** Orders important information first but deliberately returns every item. */
export function prioritizeItems(items: readonly ContextItem[]): ContextItem[] {
  return items
    .map((item) => ({ ...item, priority: priorityFor(item) }))
    .sort((left, right) => {
      if (right.priority !== left.priority) return right.priority - left.priority;
      const leftIndex = Math.min(...left.sourceRefs.map((source) => source.messageIndex), Number.MAX_SAFE_INTEGER);
      const rightIndex = Math.min(...right.sourceRefs.map((source) => source.messageIndex), Number.MAX_SAFE_INTEGER);
      return leftIndex - rightIndex || left.id.localeCompare(right.id);
    });
}
