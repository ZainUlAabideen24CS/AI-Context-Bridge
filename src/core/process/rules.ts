import type { ContextCategory } from "./types";

export interface CategoryRule {
  category: ContextCategory;
  pattern: RegExp;
  confidence: "high" | "medium";
}

export const CATEGORY_RULES: readonly CategoryRule[] = [
  { category: "requirement", pattern: /\b(?:requirement|must|shall|required to|needs? to|want(?:s)? to|please|do not|don't|never|always)\b/i, confidence: "high" },
  { category: "decision", pattern: /\b(?:decision\s*:|decided|final (?:choice|decision)|initial (?:choice|decision)|we(?:'ll| will) use|i(?:'ll| will) use|go with|switch(?:ed)? to|replace .+ with|choose|chosen|recommend(?:ed|s)? .+ as|suggest(?:ed|s)? .+ as|(?:can|could|might|should|consider) use .+ as|use .+ as (?:the )?(?:database|framework|language|platform|provider)|(?:database|framework|language|platform|provider) (?:is|will be|:) .+)\b/i, confidence: "high" },
  { category: "completed_work", pattern: /\b(?:completed|implemented|finished|fixed|resolved|done|shipped|now supports)\b/i, confidence: "high" },
  { category: "next_step", pattern: /\b(?:immediate next step|next step|next action|first,? we should|first,? do)\b/i, confidence: "high" },
  { category: "task", pattern: /\b(?:todo|to-do|pending|action item|task\s*:|need to|needs to|still have to)\b/i, confidence: "high" },
  { category: "problem", pattern: /\b(?:problem|issue|error|bug)\s*:\s*|\b(?:problem|issue|error|bug)\s+(?:with|in|when|occurred|fetching|caused|prevents?|blocks?)\b|\b(?:fails?|failed|blocked|cannot|can't|doesn't work|not working|crash(?:es|ed)?)\b/i, confidence: "high" },
  { category: "progress", pattern: /\b(?:currently|in progress|working on|started|status\s*:|at this point|so far)\b/i, confidence: "medium" },
  { category: "preference", pattern: /\b(?:i prefer|my preference|please keep|i like|i don't like|always use|never use|working style)\b/i, confidence: "high" },
  { category: "project", pattern: /\b(?:this project|the project is|project overview|project goal|we are building|i am building|i'm building|the goal is|working on a)\b/i, confidence: "medium" },
  { category: "important_fact", pattern: /\b(?:important fact|fact\s*:|remember that|note that|assumption\s*:|key detail)/i, confidence: "high" },
];

export interface TechnologyEntry {
  name: string;
  topic: string;
  pattern: RegExp;
}

const TECHNOLOGIES: readonly [string, string[]][] = [
  ["database", ["PostgreSQL", "Postgres", "SQL Server", "MSSQL", "MySQL", "SQLite", "MongoDB", "Redis", "Oracle Database"]],
  ["language", ["TypeScript", "JavaScript", "Python", "Java", "C++", "C#", "Rust", "Go", "Kotlin", "Swift"]],
  ["framework", ["React", "Next.js", "Vue", "Angular", "Svelte", "Django", "FastAPI", "Flask", "Spring"]],
  ["build_tool", ["Vite", "Webpack", "Rollup", "esbuild", "Turbopack"]],
  ["browser_extension", ["Chrome Extension", "Manifest V3", "Chrome Storage API"]],
  ["styling", ["Tailwind CSS", "CSS", "Sass"]],
  ["cloud", ["AWS", "Amazon Web Services", "Azure", "Google Cloud", "GCP"]],
  ["testing_tool", ["Vitest", "Playwright", "Jest", "Cypress"]],
  ["runtime", ["Node.js", "Deno", "Bun"]],
  ["version_control", ["Git", "GitHub"]],
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const TECHNOLOGY_ENTRIES: readonly TechnologyEntry[] = TECHNOLOGIES.flatMap(([topic, names]) =>
  names.map((name) => ({
    name,
    topic,
    pattern: name === "Go"
      ? /(?:^|[^\p{L}\p{N}])Go(?!\s+with\b)(?=$|[^\p{L}\p{N}])/u
      : new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(name)}(?=$|[^\\p{L}\\p{N}])`, "iu"),
  })),
);

export const DECISION_DOMAIN_RULES: readonly { topic: string; pattern: RegExp }[] = [
  { topic: "database", pattern: /\b(?:database|db|data store)\b/i },
  { topic: "framework", pattern: /\b(?:framework|frontend framework|backend framework)\b/i },
  { topic: "language", pattern: /\b(?:programming language|language)\b/i },
  { topic: "cloud", pattern: /\b(?:cloud provider|hosting provider|hosting)\b/i },
  { topic: "platform", pattern: /\b(?:platform|browser)\b/i },
  { topic: "build_tool", pattern: /\b(?:build tool|bundler)\b/i },
  { topic: "testing_tool", pattern: /\b(?:test runner|testing framework)\b/i },
];

export const SUGGESTION_PATTERN = /\b(?:recommend(?:ed|s)?|suggest(?:ed|s)?)\b|\b(?:could|might|may|should|consider)\b|\byou can use\b|\bproposal\s*:/i;
export const ACCEPTANCE_PATTERN = /^\s*(?:(?:okay|sure)[, ]+)?(?:yes|approved|i agree|agreed|that works|let's do that|go with that|sounds good)\b/i;
export const HEDGING_PATTERN = /\b(?:maybe|perhaps|possibly|not sure|might be|could be|i think|i guess|tentative)\b/i;
export const CORRECTION_PATTERN = /\b(?:actually|instead|change(?:d)? (?:to|from)|switch(?:ed)? to|correction|not .+ but|rather than|replace .+ with)\b/i;
export const FINALITY_PATTERN = /\b(?:final(?:ly)?|confirmed|settled|final decision|we will use|we'll use|i will use|i'll use|choose|chosen|select|selected|go with)\b/i;
export const INITIAL_PATTERN = /\b(?:initial(?:ly)?|originally|at first|first decision)\b/i;
