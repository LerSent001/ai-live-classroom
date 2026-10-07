// Main classroom and legacy Demo share the TokenDance script configuration.
// Only the main classroom uses this wallet-based video adapter.
import { CLASSROOM_CONFIG, LESSON_PLANNER_CONFIG } from "@/lib/classroom-config";
export { LESSON_PLANNER_CONFIG };
export const H3_MAX_CONFIG = {
  endpoint: "https://tokendance.space/gateway/minimax/v2/video_generation",
  model: "minimax-h3-max",
  duration: CLASSROOM_CONFIG.clipDurationSeconds,
  resolution: "768P",
  appUrl: "https://github.com/LerSent001/ai-live-classroom",
} as const;
export function h3InputForPrompt(prompt: string) {
  return {
    model: H3_MAX_CONFIG.model, duration: H3_MAX_CONFIG.duration,
    resolution: H3_MAX_CONFIG.resolution, ratio: "16:9",
    content: [{ type: "text", text: prompt }],
  };
}
