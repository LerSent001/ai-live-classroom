import "server-only";
import { createHash } from "node:crypto";
import { wallets } from "@/server/tokenpay-wallet";

import { DEMO_CONFIG, H3_MAX_CONFIG, demoPricingAvailable, h3InputForPrompt } from "@/lib/classroom-config";
import { ClassroomRuntime } from "@/server/classroom-runtime";
import { ClassroomPlaylistRuntime } from "@/server/classroom-playlist-runtime";
import { createRecordingStore } from "@/server/archive";
import { generateTokenPayVideo } from "@/server/tokenpay-video";
import { compileLessonScene, prepareLesson } from "@/server/lesson-producer";

function createRuntime(owner: string, credentialId: string): ClassroomPlaylistRuntime {
  const recordings = createRecordingStore(owner);
  const sessionKeys = new Map<string, string>();
  const worker = new ClassroomRuntime({
    configured: () => wallets.get(owner) !== null && fingerprint(wallets.get(owner)) === credentialId,
    fixture: () => false,
    prepare: async ({ sessionId, topic, durationSeconds, teacherId }) => {
      const key = wallets.get(owner);
      if (!key || fingerprint(key) !== credentialId) {
        return { ok: false, message: "请先连接自己的 TokenPay 钱包。", plannerAttemptsUsed: 1 };
      }
      if (!demoPricingAvailable()) {
        return { ok: false, message: "The local pricing review deadline has passed. Review the video price before starting.", plannerAttemptsUsed: 1 };
      }
      recordings?.record(sessionId, "lesson-request", {
        topic, durationSeconds, teacherId, demo: DEMO_CONFIG,
        estimatedVideoCostCents: null,
        actualBilledCost: null,
      });
      sessionKeys.set(sessionId, key);
      const result = await prepareLesson({
        topic, durationSeconds, teacherId, tokenpayKey: key,
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
      const key = wallets.get(owner);
      if (!key || sessionKeys.get(sessionId) !== key) {
        return {
          ok: false,
          reason: "render-failed",
          message: "钱包已断开或切换，请重新开始课程。",
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

function fingerprint(key: string | null): string { return createHash("sha256").update(key || "").digest("hex"); }
const globalRuntime = globalThis as typeof globalThis & { classroomWalletRuntimesV2?: Map<string, { credentialId: string; runtime: ClassroomPlaylistRuntime }> };
export function getClassroomRuntime(owner: string): ClassroomPlaylistRuntime {
  if (!/^[a-f0-9]{64}$/.test(owner)) throw new Error("请刷新课堂。");
  const runtimes = globalRuntime.classroomWalletRuntimesV2 ??= new Map();
  const credentialId = fingerprint(wallets.get(owner));
  let entry = runtimes.get(owner);
  if (!entry || entry.credentialId !== credentialId) {
    entry = { credentialId, runtime: createRuntime(owner, credentialId) };
    runtimes.set(owner, entry);
  }
  return entry.runtime;
}
