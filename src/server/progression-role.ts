import type { ProgressionRole } from "@/lib/classroom-types";

function normalizedRole(value: unknown): ProgressionRole | null {
  if (typeof value !== "string") return null;
  const role = value.trim().toLowerCase().replace(/[\s_]+/g, "-");
  switch (role) {
    case "hook":
    case "introduction":
    case "intro":
    case "opening":
    case "engagement":
      return "hook";
    case "foundation":
    case "background":
    case "context":
    case "setup":
    case "definition":
    case "basics":
      return "foundation";
    case "mechanism":
    case "explanation":
    case "causal-explanation":
    case "process":
    case "how-it-works":
      return "mechanism";
    case "example":
    case "demonstration":
    case "illustration":
    case "case-study":
      return "example";
    case "connection":
    case "comparison":
    case "relationship":
    case "link":
      return "connection";
    case "misconception":
    case "correction":
    case "myth":
    case "clarification":
      return "misconception";
    case "application":
    case "real-world-application":
    case "real-world":
    case "practice":
    case "implication":
      return "application";
    case "transition":
    case "bridge":
    case "pivot":
      return "transition";
    case "synthesis":
    case "conclusion":
    case "integration":
    case "takeaway":
      return "synthesis";
    case "recap":
    case "summary":
    case "review":
      return "recap";
    default:
      return null;
  }
}

function roleForPosition(position: number, totalPositions: number): ProgressionRole {
  if (position <= 1) return "hook";
  if (position >= totalPositions) return "recap";
  if (position === totalPositions - 1) return "synthesis";
  switch ((position - 2) % 7) {
    case 0: return "foundation";
    case 1: return "mechanism";
    case 2: return "example";
    case 3: return "connection";
    case 4: return "misconception";
    case 5: return "application";
    default: return "transition";
  }
}

export function plannerProgressionRole(input: Readonly<{
  value: unknown;
  position: number;
  totalPositions: number;
}>): ProgressionRole {
  if (input.position <= 1 || input.position >= input.totalPositions) {
    return roleForPosition(input.position, input.totalPositions);
  }
  return normalizedRole(input.value) ?? roleForPosition(input.position, input.totalPositions);
}
