import "server-only";

import { DEMO_CONFIG, H3_MAX_CONFIG, demoPricingAvailable, h3InputForPrompt } from "@/lib/classroom-config";
import { ClassroomRuntime } from "@/server/classroom-runtime";
import { ClassroomPlaylistRuntime } from "@/server/classroom-playlist-runtime";
import { createRecordingStore } from "@/server/archive";
import { generateTokenPayVideo } from "@/server/tokenpay-video";
import { compileLessonScene, prepareLesson } from "@/server/lesson-producer";

function envKey(name: "TOKENDANCE_API_KEY" | "GEMINI_API_KEY"): string | null {
  const key = process.env[name]?.trim();
  return key ? key : null;
}

function createRuntime(): ClassroomPlaylistRuntime {
  const recordings = createRecordingStore();
  const worker = new ClassroomRuntime({
    configured: () => envKey("TOKENDANCE_API_KEY") !== null && envKey("GEMINI_API_KEY") !== null,
    fixture: () => false,
    prepare: async ({ sessionId, topic, durationSeconds, teacherId }) => {
      const key = envKey("GEMINI_API_KEY");
      if (!key || !envKey("TOKENDANCE_API_KEY")) {
        return { ok: false, message: "TOKENDANCE_API_KEY and GEMINI_API_KEY are required.", plannerAttemptsUsed: 1 };
      }
      if (!demoPricingAvailable()) {
        return { ok: false, message: "The local pricing review deadline has passed. Review the video price before starting.", plannerAttemptsUsed: 1 };
      }
      recordings?.record(sessionId, "lesson-request", {
        topic, durationSeconds, teacherId, demo: DEMO_CONFIG,
        estimatedVideoCostCents: null,
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
      const key = envKey("TOKENDANCE_API_KEY");
      if (!key) {
        return {
          ok: false,
          reason: "render-failed",
          message: "TOKENDANCE_API_KEY is missing. Add it to .env.local and restart the app.",
        };
      }
      if (!demoPricingAvailable()) {
        return { ok: false, reason: "render-failed", message: "The local pricing review deadline has passed. No further clips were submitted." };
      }
      let generated;
      let requestId: string | null = null;
      try {
        recordings?.record(sessionId, "video-request", {
          sceneNumber: plan.sceneNumber, endpoint: H3_MAX_CONFIG.endpoint,
          input: h3InputForPrompt(plan.prompt), plan,
          estimatedVideoCostCents: null, actualBilledCost: null,
        });
        generated = await generateTokenPayVideo({
          prompt: plan.prompt, apiKey: key,
          onSubmitted: (id) => {
            requestId = id;
            recordings?.afterRequest(() => recordings.record(sessionId, "video-submitted", { sceneNumber: plan.sceneNumber, requestId: id }));
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "TokenPay 视频生成失败。";
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
  var classroomRuntimeTokenPayV1: ClassroomPlaylistRuntime | undefined;
}

export function getClassroomRuntime(): ClassroomPlaylistRuntime {
  globalThis.classroomRuntimeTokenPayV1 ??= createRuntime();
  return globalThis.classroomRuntimeTokenPayV1;
}
