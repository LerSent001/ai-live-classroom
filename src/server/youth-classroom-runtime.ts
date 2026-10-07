import { createHash } from "node:crypto";
import { DEMO_CONFIG, PLANNER_SYSTEM_PROMPT, preparationPrompt, sceneCountForDuration } from "@/lib/classroom-config";
import { ClassroomRuntime } from "@/server/classroom-runtime";
import { ClassroomPlaylistRuntime } from "@/server/classroom-playlist-runtime";
import { compileLessonScene, parseInitialLesson } from "@/server/lesson-plan";
import { requestTokenDancePlan } from "@/server/youth-tokenpay-planner";
import { collectTokenDanceVideo, generateTokenDanceVideo } from "@/server/youth-tokenpay-video";
import { H3_MAX_CONFIG, LESSON_PLANNER_CONFIG, h3InputForPrompt } from "@/server/youth-tokenpay-config";
import type { RecordingStore } from "@/server/recording-store";
import type { WalletStore } from "@/server/youth-tokenpay-wallet";
import { youthBudget } from "./youth-budget";
import { YouthRecordingRecovery } from "./youth-recording-recovery";
import { SavedClassrooms } from "./saved-classrooms";
import { isRecord, parseTeacherId, toClassroomSessionId, toCommandId } from "@/lib/classroom-boundaries";

type WalletSource = Pick<WalletStore, "get" | "revision">;
type Providers = {
  plan: typeof requestTokenDancePlan;
  video: typeof generateTokenDanceVideo;
  preflight?: typeof youthBudget.reserve;
  download?: typeof fetch;
  budget?: Pick<typeof youthBudget, "begin" | "finish" | "close" | "complete" | "uncertain" | "restore">;
};
const providers: Providers = { plan: requestTokenDancePlan, video: generateTokenDanceVideo,
  preflight: youthBudget.reserve.bind(youthBudget), budget: youthBudget };
function credential(wallet: WalletSource, owner: string): string {
  return `${wallet.revision(owner)}:${createHash("sha256").update(wallet.get(owner) ?? "").digest("hex")}`;
}

// Separate runtime per browser AND wallet revision. Old queued work cannot start
// on a replacement wallet, including disconnect -> reconnect to the same key.
export class YouthRuntimeRegistry {
  private entries = new Map<string, { credential: string; runtime: ClassroomPlaylistRuntime }>();
  private recovery = new Map<string, YouthRecordingRecovery>();
  constructor(
    private wallet: WalletSource,
    private recordingFor: (owner: string) => RecordingStore | null,
    private provider: Providers = providers,
  ) {}
  get(owner: string): ClassroomPlaylistRuntime {
    if (!/^[a-f0-9]{64}$/.test(owner)) throw new Error("钱包身份无效，请重新进入教室。");
    const id = credential(this.wallet, owner);
    const existing = this.entries.get(owner);
    if (existing?.credential === id) return existing.runtime;
    const recordings = this.recordingFor(owner);
    const keyForRequest = () => credential(this.wallet, owner) === id ? this.wallet.get(owner) : null;
    const budgetId = (sessionId: string) => `${owner}:${sessionId}`;
    let refreshQueued = false;
    const budgetSettled = new Set<string>();
    const budgetTracked = new Set<string>();
    const preparing = new Set<string>(), cancelled = new Set<string>();
    const worker = new ClassroomRuntime({
      configured: () => keyForRequest() !== null,
      fixture: () => false,
      generateWithoutPlayback: true,
      onUpdate: snapshot => {
        if (budgetTracked.has(snapshot.id) && snapshot.lesson && snapshot.scenes.length === snapshot.lesson.targetSceneCount && snapshot.scenes.every(scene => (scene.kind === "ready" || scene.kind === "playing" || scene.kind === "played") && scene.segment.kind === "generated") && !budgetSettled.has(snapshot.id)) {
          budgetSettled.add(snapshot.id);
          this.provider.budget?.complete(budgetId(snapshot.id));
          recordings?.afterRequest(() => recordings.record(snapshot.id, "budget-settled", { reason: "all-provider-results-collected", actualBilledCost: null }));
        }
        if (!refreshQueued) {
          refreshQueued = true;
          queueMicrotask(() => { refreshQueued = false; runtime?.refresh(); });
        }
      },
      prepare: async ({ sessionId, topic, durationSeconds, teacherId }) => {
        const adaptiveOpening = durationSeconds === DEMO_CONFIG.initialDurationSeconds;
        preparing.add(sessionId);
        const key = keyForRequest();
        if (!key) { preparing.delete(sessionId); return { ok: false, message: "钱包已断开或切换，请重新连接后开始。", plannerAttemptsUsed: 1 }; }
        const started = Date.now();
        let budgetActive = false;
        try {
          if (this.provider.preflight && !recordings) throw new Error("请开启 SAVE_RECORDINGS 后开始，以保留已付费任务编号。未提交付费请求。");
          const quote = await this.provider.preflight?.(budgetId(sessionId), key, { topic, teacherId, durationSeconds, adaptiveOpening });
          if (cancelled.has(sessionId)) throw new Error("已退出课程，未提交付费请求。");
          // Wallet may have changed during the read-only preflight.
          if (keyForRequest() !== key) throw new Error("钱包已断开或切换，未提交付费请求。");
          this.provider.budget?.begin(budgetId(sessionId));
          budgetActive = true;
          if (quote) {
            budgetTracked.add(sessionId);
            recordings?.record(sessionId, "budget-reserved", { ...quote, keyHash: createHash("sha256").update(key).digest("hex"), actualBilledCost: null });
          }
          recordings?.record(sessionId, "lesson-request", {
            topic, durationSeconds, teacherId, adaptiveOpening, demo: DEMO_CONFIG,
            provider: "TokenDance", actualBilledCost: null,
          });
          const output = await this.provider.plan({
            apiKey: key, systemPrompt: PLANNER_SYSTEM_PROMPT,
            prompt: preparationPrompt(topic, sceneCountForDuration(durationSeconds), teacherId, { adaptiveOpening }),
            record: recordings ? (kind, data) => {
              if (kind === "planner-request") recordings.record(sessionId, kind, data);
              else recordings.afterRequest(() => recordings.record(sessionId, kind, data));
            } : undefined,
          });
          const result = {
            ok: true as const,
            lesson: parseInitialLesson({ teacherId, topic, durationSeconds, adaptiveOpening, output, latencyMs: Date.now() - started, preparedBy: `TokenDance / ${LESSON_PLANNER_CONFIG.tokenDanceModel}` }),
            ledger: { nextStepIndex: 0, conceptsPlanned: [], recentNarrations: [], recentVisuals: [] },
            plannerAttemptsUsed: 1 as const,
          };
          recordings?.afterRequest(() => recordings.record(sessionId, "lesson-prepared", { result }));
          if (adaptiveOpening && !cancelled.has(sessionId)) {
            if (keyForRequest() !== key) throw new Error("钱包已断开或切换，脚本已保存，不再提交视频。");
            const actualQuote = await this.provider.preflight?.(budgetId(sessionId), key, { topic, teacherId, durationSeconds: result.lesson.durationSeconds, phase: "lesson" });
            if (actualQuote) recordings?.afterRequest(() => recordings.record(sessionId, "budget-reserved", { ...actualQuote, keyHash: createHash("sha256").update(key).digest("hex"), actualBilledCost: null }));
          }
          return result;
        } catch (error) {
          if (error instanceof Error && /提交结果未知/.test(error.message)) this.provider.budget?.uncertain(budgetId(sessionId));
          const result = { ok: false as const, message: error instanceof SyntaxError ? "课程脚本格式无效，没有自动重试。" : error instanceof Error ? error.message : "课程规划失败，请检查钱包状态。", plannerAttemptsUsed: 1 as const };
          recordings?.afterRequest(() => recordings.record(sessionId, "planning-failed", { result }));
          return result;
        } finally {
          if (budgetActive) this.provider.budget?.finish(budgetId(sessionId));
          else this.provider.budget?.close(budgetId(sessionId));
          preparing.delete(sessionId); cancelled.delete(sessionId);
        }
      },
      compile: compileLessonScene,
      render: async ({ sessionId, plan }) => {
        const key = keyForRequest();
        if (!key) return { ok: false, reason: "render-failed", message: "钱包已断开或切换，不再提交新片段。已提交任务可能继续计费。" };
        let requestId: string | null = null;
        let videoUrl: string | null = null;
        this.provider.budget?.begin(budgetId(sessionId));
        try {
          recordings?.record(sessionId, "video-request", {
            sceneNumber: plan.sceneNumber, endpoint: H3_MAX_CONFIG.endpoint,
            input: h3InputForPrompt(plan.prompt), plan, keyHash: createHash("sha256").update(key).digest("hex"), actualBilledCost: null,
          });
          const generated = await collectTokenDanceVideo({ prompt: plan.prompt, apiKey: key,
            onSubmitted: (id) => {
              requestId = id;
              recordings?.afterRequest(() => recordings.record(sessionId, "video-submitted", { sceneNumber: plan.sceneNumber, requestId: id }));
            },
            onQueryRetry: ({ requestId: id, attempt, reason }) => {
              recordings?.afterRequest(() => recordings.record(sessionId, "video-query-retry", {
                sceneNumber: plan.sceneNumber, requestId: id, attempt, reason,
              }));
            },
          }, this.provider.video, { onPending: id => recordings?.afterRequest(() => recordings.record(sessionId, "video-collection-pending", { sceneNumber: plan.sceneNumber, requestId: id })) });
          if (recordings) {
            const scene = { teacherId: plan.teacherId, sessionId, sceneNumber: plan.sceneNumber,
              videoUrl: generated.providerUrl, narration: plan.narration, summary: plan.summary,
              prompt: plan.prompt, expandedPrompt: generated.expandedPrompt, timings: generated.timings };
            recordings.afterRequest(() => {
              recordings.record(sessionId, "video-completed", { sceneNumber: plan.sceneNumber, ...generated, actualBilledCost: null });
              recordings.saveSceneMetadata(scene);
            });
            const downloaded = await recordings.saveVideo(scene, this.provider.download);
            if (downloaded) videoUrl = `/api/youth/saved-video/${encodeURIComponent(sessionId)}/${plan.sceneNumber}`;
          }
          return { ok: true, videoUrl: videoUrl ?? generated.providerUrl, providerUrl: generated.providerUrl,
            expandedPrompt: generated.expandedPrompt, timings: generated.timings };
        } catch (error) {
          const message = error instanceof Error ? error.message : "视频生成失败，未自动重新提交。";
          if (!/已结束：/.test(message)) this.provider.budget?.uncertain(budgetId(sessionId));
          recordings?.afterRequest(() => recordings.record(sessionId, "video-failed", { sceneNumber: plan.sceneNumber, requestId, message, actualBilledCost: null }));
          return { ok: false, reason: "render-failed", message };
        } finally {
          this.provider.budget?.finish(budgetId(sessionId));
        }
      },
      clear: async (sessionId) => {
        if (preparing.has(sessionId)) cancelled.add(sessionId);
        this.provider.budget?.close(budgetId(sessionId));
      },
    });
    const runtime = new ClassroomPlaylistRuntime(worker, recordings ? (selection) => {
      recordings.record(selection.playlistId, "lesson-selection", { ...selection });
      if (selection.sessionId !== selection.playlistId) recordings.record(selection.sessionId, "playlist-link", { ...selection });
    } : undefined, {
      allowReplayGeneration: true,
      maxQueuedLessons: DEMO_CONFIG.maxFollowups,
      savedLesson: recordings ? (topic, teacherId) => new SavedClassrooms(recordings.root, "/api/youth/saved-video", true).findLesson(topic, teacherId, DEMO_CONFIG.followupDurationSeconds) : undefined,
      recordReplay: recordings ? (sessionId, recorded) => {
        if (!recorded.recordingId) throw new Error("Saved recording source is missing.");
        recordings.record(sessionId, "replay-source", { recordingId: recorded.recordingId, topic: recorded.lesson.topic, teacherId: recorded.lesson.teacherId });
      } : undefined,
    });
    this.entries.set(owner, { credential: id, runtime });
    if (recordings && keyForRequest()) {
      const recovery = new YouthRecordingRecovery(recordings, keyForRequest, this.provider.video, this.provider.download);
      this.recovery.set(owner, recovery);
      for (const root of recordings.sessions()) {
        let events;
        try { events = recordings.events(root); } catch { continue; }
        const selections = events.filter(event => event.kind === "lesson-selection");
        if (!selections.some(event => event.data.position === 1 && event.data.sessionId === root)) continue;
        const entries: { sessionId: ReturnType<typeof toClassroomSessionId>; topic: string; commandId?: ReturnType<typeof toCommandId> }[] = [];
        for (const [index, { data }] of selections.entries()) {
          if (data.playlistId !== root || data.position !== index + 1 || typeof data.sessionId !== "string" || typeof data.topic !== "string" || (index === 0 && data.sessionId !== root) || data.previousSessionId !== (index === 0 ? null : entries.at(-1)?.sessionId)) break;
          const sessionId = toClassroomSessionId(data.sessionId);
          try {
            const log = recordings.events(sessionId);
            const reservation = log.findLast(event => event.kind === "budget-reserved");
            if (reservation && !log.some(event => event.kind === "budget-settled") && typeof reservation.data.keyHash === "string") {
              budgetTracked.add(sessionId);
              this.provider.budget?.restore(budgetId(sessionId), reservation.data.keyHash, {
                amountCny: Number(reservation.data.amountCny), durationSeconds: Number(reservation.data.durationSeconds),
                quotedAt: String(reservation.data.quotedAt), videoRateCny: Number(reservation.data.videoRateCny),
              });
            }
            const restored = recovery.jobs(sessionId);
            const adaptive = log.some(event => event.kind === "lesson-request" && event.data.adaptiveOpening === true);
            const durationMatches = restored.lesson.durationSeconds === data.durationSeconds || (adaptive && data.durationSeconds === 30 && [15, 20, 25].includes(restored.lesson.durationSeconds));
            if (restored.lesson.teacherId !== data.teacherId || restored.lesson.topic !== data.topic || !durationMatches) throw new Error("Recovery selection mismatch.");
            worker.restore(sessionId, restored.lesson, restored.jobs);
          } catch {
            if (!isRecord(data)) break;
            worker.restoreFailure(sessionId, data.topic, parseTeacherId(data.teacherId));
          }
          entries.push({ sessionId, topic: data.topic, ...(typeof data.commandId === "string" ? { commandId: toCommandId(data.commandId) } : {}) });
        }
        if (entries.length) runtime.restore(toClassroomSessionId(root), entries);
      }
    }
    return runtime;
  }

  async repair(owner: string, recordingId: string): Promise<{ recovered: number; pending: number }> {
    this.get(owner);
    const recovery = this.recovery.get(owner);
    if (!recovery) throw new Error("请连接原钱包以回收已提交任务。");
    const { jobs } = recovery.jobs(toClassroomSessionId(recordingId));
    const results = await Promise.all(jobs.map(job => job.collect()));
    return { recovered: results.filter(result => result.ok).length, pending: results.filter(result => !result.ok).length };
  }

  recoveryAction(owner: string, recordingId: string): string | null {
    this.get(owner);
    const recovery = this.recovery.get(owner);
    return recovery ? recovery.requiredAction(recordingId) : "请连接原钱包并开启录制，以回收已提交任务。没有重新生成。";
  }
}
