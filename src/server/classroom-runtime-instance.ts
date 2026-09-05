import "server-only";

import { CLASSROOM_CONFIG, DEMO_CONFIG, H3_MAX_CONFIG, demoPricingAvailable, h3InputForPrompt, quoteForDuration } from "@/lib/classroom-config";
import { ClassroomRuntime } from "@/server/classroom-runtime";
import { ClassroomPlaylistRuntime } from "@/server/classroom-playlist-runtime";
import { createRecordingStore } from "@/server/archive";
import { generateH3MaxClip } from "@/server/fal";
import { classifyFalError } from "@/server/fal-error";
import { compileLessonScene, prepareLesson } from "@/server/lesson-producer";

function envKey(name: "FAL_KEY" | "GEMINI_API_KEY"): string | null {
  const key = process.env[name]?.trim();
  return key ? key : null;
}

function createRuntime(): ClassroomPlaylistRuntime {
  const recordings = createRecordingStore();
  const worker = new ClassroomRuntime({
    configured: () => envKey("FAL_KEY") !== null && envKey("GEMINI_API_KEY") !== null,
    fixture: () => false,
    prepare: async ({ sessionId, topic, durationSeconds, teacherId }) => {
      const key = envKey("GEMINI_API_KEY");
      if (!key || !envKey("FAL_KEY")) {
        return { ok: false, message: "FAL_KEY and GEMINI_API_KEY are required.", plannerAttemptsUsed: 1 };
      }
      if (!demoPricingAvailable()) {
        return { ok: false, message: "The demo discount has ended. Review the video price before starting.", plannerAttemptsUsed: 1 };
      }
      recordings?.record(sessionId, "lesson-request", {
        topic, durationSeconds, teacherId, demo: DEMO_CONFIG,
        estimatedFalCostCents: quoteForDuration(durationSeconds).expectedCents,
        actualBilledCost: null,
      });
      const result = await prepareLesson({
        topic, durationSeconds, teacherId, geminiKey: key,
        record: recordings ? (kind, data) => {
          if (kind === "planner-request") recordings.record(sessionId, kind, data);
          else recordings.afterRequest(() => recordings.record(sessionId, kind, data));
        } : undefined,
      });
      recordings?.afterRequest(() => recordings.record(sessionId, result.ok ? "lesson-prepared" : "planning-failed", { result }));
      return result;
    },
    compile: compileLessonScene,
    render: async ({ sessionId, plan }) => {
      const key = envKey("FAL_KEY");
      if (!key) {
        return {
          ok: false,
          reason: "render-failed",
          message: "FAL_KEY is missing. Add it to .env.local and restart the app.",
        };
      }
      if (!demoPricingAvailable()) {
        return { ok: false, reason: "render-failed", message: "The demo discount has ended. No further clips were submitted." };
      }
      let generated;
      let requestId: string | null = null;
      try {
        recordings?.record(sessionId, "video-request", {
          sceneNumber: plan.sceneNumber, endpoint: H3_MAX_CONFIG.endpoint,
          input: h3InputForPrompt(plan.prompt), plan,
          estimatedFalCostCents: CLASSROOM_CONFIG.videoAttemptCostCents, actualBilledCost: null,
        });
        generated = await generateH3MaxClip({
          prompt: plan.prompt, falKey: key,
          onSubmitted: (id) => {
            requestId = id;
            recordings?.afterRequest(() => recordings.record(sessionId, "video-submitted", { sceneNumber: plan.sceneNumber, requestId: id }));
          },
        });
      } catch (error) {
        const message = classifyFalError(error).message;
        recordings?.afterRequest(() => recordings.record(sessionId, "video-failed", {
          sceneNumber: plan.sceneNumber, requestId, message, actualBilledCost: null,
        }));
        return { ok: false, reason: "render-failed", message };
      }
      if (recordings) {
        const scene = {
          teacherId: plan.teacherId,
          sessionId,
          sceneNumber: plan.sceneNumber,
          videoUrl: generated.providerUrl,
          narration: plan.narration,
          summary: plan.summary,
          prompt: plan.prompt,
          expandedPrompt: generated.expandedPrompt,
          timings: generated.timings,
        };
        recordings.afterRequest(() => {
          recordings.record(sessionId, "video-completed", { sceneNumber: plan.sceneNumber, ...generated, actualBilledCost: null });
          recordings.saveSceneMetadata(scene);
        });
        void recordings.saveVideo(scene);
      }
      return {
        ok: true,
        videoUrl: generated.providerUrl,
        providerUrl: generated.providerUrl,
        expandedPrompt: generated.expandedPrompt,
        timings: generated.timings,
      };
    },
    clear: async () => {},
  });
  return new ClassroomPlaylistRuntime(worker, recordings ? (selection) => {
    recordings.record(selection.playlistId, "lesson-selection", { ...selection });
    if (selection.sessionId !== selection.playlistId) {
      recordings.record(selection.sessionId, "playlist-link", { ...selection });
    }
  } : undefined);
}

declare global {
  var classroomRuntimeV7: ClassroomPlaylistRuntime | undefined;
}

export function getClassroomRuntime(): ClassroomPlaylistRuntime {
  globalThis.classroomRuntimeV7 ??= createRuntime();
  return globalThis.classroomRuntimeV7;
}
