import type { ContextCategory, ContextItem } from "../process/types";

export interface SummarySectionDefinition {
  id: string;
  title: string;
  categories: readonly ContextCategory[];
}

/** The section order and names follow SRS FR-08. */
export const SUMMARY_SECTIONS: readonly SummarySectionDefinition[] = [
  { id: "overview", title: "Conversation Overview", categories: [] },
  { id: "background", title: "Project / Task Background", categories: ["project", "important_fact"] },
  { id: "requirements", title: "User Requirements", categories: ["requirement"] },
  { id: "technology", title: "Technology and Tools", categories: ["technology"] },
  { id: "decisions", title: "Important Decisions", categories: ["decision"] },
  { id: "completed", title: "Completed Work", categories: ["completed_work"] },
  { id: "progress", title: "Current Progress", categories: ["progress"] },
  { id: "problems", title: "Current Problems / Errors", categories: ["problem"] },
  { id: "references", title: "Important Code and References", categories: ["code_reference"] },
  { id: "pending", title: "Pending Tasks", categories: ["task"] },
  { id: "preferences", title: "User Working Preferences", categories: ["preference"] },
  { id: "next", title: "Immediate Next Steps", categories: ["next_step"] },
];

/** Assistant problem items remain in structured context but are hidden in the
 * rendered problem section whenever a user supplied the underlying report. */
export function visibleSummaryItems(items: readonly ContextItem[]): ContextItem[] {
  const hasUserReportedProblem = items.some((item) => item.category === "problem" && item.originRole === "user");
  return items.filter((item) =>
    item.category !== "problem" || !hasUserReportedProblem || item.originRole === "user",
  );
}
