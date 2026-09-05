import "server-only";

import { createFalClient } from "@fal-ai/client";
import { H3_MAX_CONFIG } from "@/lib/classroom-config";
import { submitH3Clip } from "@/server/h3-request";
import { isRecord } from "@/lib/classroom-boundaries";
import type { Prompt, RenderTimings } from "@/lib/classroom-types";

export type FalVideoResult = Readonly<{
  providerUrl: string;
  expandedPrompt: string | null;
  queueLogs: readonly string[];
  timings: RenderTimings;
}>;

function validRemoteUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function parseFalResult(
  value: unknown,
  queueLogs: readonly string[],
  observed: Readonly<{ requestId: string; queueWaitMs: number | null; totalMs: number }>,
): FalVideoResult {
  if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.data.video)) {
    throw new Error("fal returned an invalid H3 Max response");
  }
  const providerUrl = value.data.video.url;
  if (!validRemoteUrl(providerUrl)) {
    throw new Error("fal returned an invalid video URL");
  }
  const expandedPrompt =
    typeof value.data.expanded_prompt === "string" ? value.data.expanded_prompt : null;
  const inferenceSeconds = isRecord(value.data.timings) ? value.data.timings.inference : null;
  const inferenceMs =
    typeof inferenceSeconds === "number" && Number.isFinite(inferenceSeconds)
      ? inferenceSeconds * 1_000
      : null;
  return {
    providerUrl,
    expandedPrompt,
    queueLogs,
    timings: {
      requestId: observed.requestId,
      queueWaitMs: observed.queueWaitMs,
      inferenceMs,
      totalMs: observed.totalMs,
    },
  };
}

export async function generateH3MaxClip(input: {
  prompt: Prompt;
  falKey: string;
  onSubmitted?: (requestId: string) => void;
}): Promise<FalVideoResult> {
  const fal = createFalClient({ credentials: input.falKey });
  const queueLogs: string[] = [];
  const submittedAtMs = Date.now();
  let beganRunningAtMs: number | null = null;
  const requestId = await submitH3Clip({ apiKey: input.falKey, prompt: input.prompt });
  input.onSubmitted?.(requestId);
  await fal.queue.subscribeToStatus(H3_MAX_CONFIG.endpoint, {
    requestId,
    mode: "streaming",
    connectionMode: "server",
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === "IN_PROGRESS" && beganRunningAtMs === null) {
        beganRunningAtMs = Date.now();
      }
      if ("logs" in update && Array.isArray(update.logs)) {
        for (const log of update.logs) {
          if (isRecord(log) && typeof log.message === "string") {
            queueLogs.push(log.message);
          }
        }
      }
    },
  });
  const result: unknown = await fal.queue.result(H3_MAX_CONFIG.endpoint, { requestId });
  const completedAtMs = Date.now();
  return parseFalResult(result, queueLogs, {
    requestId,
    queueWaitMs:
      beganRunningAtMs === null ? null : Math.max(0, beganRunningAtMs - submittedAtMs),
    totalMs: completedAtMs - submittedAtMs,
  });
}
