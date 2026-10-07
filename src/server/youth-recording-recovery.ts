import { createHash } from "node:crypto";
import { isRecord, parseLessonPlan, parsePlan, parseSegment, parseTeacherId, toClassroomSessionId, toSceneId } from "@/lib/classroom-boundaries";
import type { LessonPlan, RenderResult, ValidatedScenePlan } from "@/lib/classroom-types";
import { compileLessonScene, parseInitialLesson } from "./lesson-plan";
import { type RecordingStore, type RecordingEvent, type RecordedScene } from "./recording-store";
import { SavedClassrooms } from "./saved-classrooms";
import { collectTokenDanceVideo, generateTokenDanceVideo } from "./youth-tokenpay-video";

export class YouthRecordingRecovery {
  private running = new Map<string, Promise<RenderResult>>();
  constructor(private store: RecordingStore, private key: () => string | null,
    private video = generateTokenDanceVideo, private download: typeof fetch = fetch) {}

  requiredAction(id: string): string | null {
    try { new SavedClassrooms(this.store.root, "/api/youth/saved-video", true).loadLesson(toClassroomSessionId(id)); return null; }
    catch { /* Check whether the incomplete media is query-recoverable below. */ }
    let events: RecordingEvent[], lesson: LessonPlan;
    try { events = this.store.events(id); lesson = this.jobs(id).lesson; }
    catch { return "原课程脚本没有完整保存，无法自动接续。请核对原记录；没有重新提交付费请求。"; }
    for (let number = 1; number <= lesson.targetSceneCount; number++) {
      const atScene = (kind: string) => events.findLast(event => event.kind === kind && event.data.sceneNumber === number);
      const complete = atScene("video-completed");
      const receipt = atScene("video-submitted")?.data.requestId ?? (complete && isRecord(complete.data.timings) ? complete.data.timings.requestId : null);
      if (typeof receipt !== "string" || !/^[a-zA-Z0-9_-]{1,180}$/.test(receipt)) return atScene("video-request")
        ? `第${number}段的提交编号未知，请先在平台核对。其余已受理任务仍在回收，没有重新购买。`
        : `第${number}段尚未提交，无法仅靠查询补齐。已受理任务仍在回收，没有自动补买。`;
      const failure = atScene("video-failed");
      if (typeof failure?.data.message === "string" && /已结束：/.test(failure.data.message)) return "原视频任务已被平台终止，无法继续查询成片；没有重新提交付费请求。";
      const binding = atScene("video-request")?.data.keyHash, key = this.key();
      if (binding && (!key || binding !== createHash("sha256").update(key).digest("hex"))) return "请连接生成这节课程时的原钱包，以继续回收已提交任务。没有使用新钱包重新生成。";
    }
    return null;
  }

  jobs(id: string): { lesson: LessonPlan; jobs: { plan: ValidatedScenePlan; collect(): Promise<RenderResult> }[] } {
    const events = this.store.events(id);
    const saved = new SavedClassrooms(this.store.root, "/api/youth/saved-video", true);
    // Already-valid saved media is the fastest path and needs no provider query.
    try {
      const recorded = saved.loadLesson(toClassroomSessionId(id));
      return { lesson: recorded.lesson, jobs: recorded.scenes.map(({ plan, segment }) => ({ plan, collect: async () => ({
        ok: true, videoUrl: segment.videoUrl, providerUrl: segment.providerUrl, expandedPrompt: segment.expandedPrompt, timings: segment.timings,
      }) })) };
    } catch { /* Incomplete media: recover known receipts below, never POST. */ }
    const prepared = events.findLast(event => event.kind === "lesson-prepared");
    let lesson: LessonPlan;
    if (prepared && isRecord(prepared.data.result) && prepared.data.result.ok === true) lesson = parseLessonPlan(prepared.data.result.lesson);
    else {
      // A crash can occur after receiving/storing the planner response but
      // before writing lesson-prepared. Re-parse the exact stored response;
      // never call the planner a second time to fill this bookkeeping gap.
      const response = events.findLast(event => event.kind === "planner-response");
      const requested = events.findLast(event => event.kind === "lesson-request");
      const data = requested?.data;
      if (typeof response?.data.output !== "string" || typeof data?.topic !== "string" || (data.durationSeconds !== 10 && data.durationSeconds !== 30)) throw new Error("课程脚本尚未保存完成。");
      lesson = parseInitialLesson({ topic: data.topic, teacherId: parseTeacherId(data.teacherId), durationSeconds: data.durationSeconds,
        adaptiveOpening: data.adaptiveOpening === true, output: response.data.output, latencyMs: 0, preparedBy: "TokenDance / recovered stored response" });
      this.store.afterRequest(() => this.store.record(id, "lesson-prepared", { result: { ok: true, lesson }, recoveredFrom: "planner-response" }));
    }
    let ledger = { nextStepIndex: 0, conceptsPlanned: [] as readonly string[], recentNarrations: [] as readonly string[], recentVisuals: [] as readonly string[] };
    const jobs = lesson.steps.map((step, index) => {
      const number = index + 1;
      const intent = events.find(event => event.kind === "video-request" && event.data.sceneNumber === number);
      const plan = intent ? parsePlan(intent.data.plan) : compileLessonScene({ lesson, ledger, sceneNumber: number, purpose: { kind: "lesson", stepId: step.id } });
      if (plan.teacherId !== lesson.teacherId || plan.sceneNumber !== number || plan.purpose.stepId !== step.id) throw new Error("恢复记录与课程不匹配。");
      ledger = plan.ledgerAfter;
      return { plan, collect: () => this.collect(id, plan, events) };
    });
    return { lesson, jobs };
  }

  private collect(id: string, plan: ValidatedScenePlan, events: RecordingEvent[]): Promise<RenderResult> {
    const token = `${id}:${plan.sceneNumber}`;
    const pending = this.running.get(token);
    if (pending) return pending;
    const work = this.recover(id, plan, events).catch((): RenderResult => ({ ok: false, reason: "render-failed", message: "原任务回收暂未完成，请稍后重新检查；没有重新提交。" }));
    this.running.set(token, work);
    void work.finally(() => this.running.delete(token));
    return work;
  }

  private async recover(id: string, plan: ValidatedScenePlan, events: RecordingEvent[]): Promise<RenderResult> {
    const atScene = (kind: string) => events.findLast(event => event.kind === kind && event.data.sceneNumber === plan.sceneNumber);
    const submitted = atScene("video-submitted");
    const completed = atScene("video-completed");
    const requestId = submitted?.data.requestId ?? (completed && isRecord(completed.data.timings) ? completed.data.timings.requestId : null);
    if (typeof requestId !== "string" || !/^[a-zA-Z0-9_-]{1,180}$/.test(requestId)) return { ok: false, reason: "render-failed",
      message: atScene("video-request") ? "原提交没有可核实的任务 ID，请在平台核对；没有重新生成。" : "此片段在服务重启前尚未提交，没有自动补买。" };
    try {
      const metadata = this.store.sceneMetadata(id, plan.sceneNumber);
      if (completed && isRecord(metadata) && this.store.hasVideo(id, plan.sceneNumber) && metadata.sessionId === id && metadata.sceneNumber === plan.sceneNumber && metadata.teacherId === plan.teacherId && metadata.prompt === plan.prompt) {
        const segment = parseSegment({ kind: "generated", id: toSceneId(`recovery-${plan.sceneNumber}`), number: plan.sceneNumber, durationSeconds: 5,
          purpose: plan.purpose, prompt: plan.prompt, summary: plan.summary, captions: plan.captions,
          videoUrl: `/api/youth/saved-video/${encodeURIComponent(id)}/${plan.sceneNumber}`, providerUrl: metadata.sourceUrl, expandedPrompt: metadata.expandedPrompt, timings: metadata.timings });
        if (segment.kind === "generated" && segment.timings.requestId === requestId && segment.providerUrl === completed.data.providerUrl) return {
          ok: true, videoUrl: segment.videoUrl, providerUrl: segment.providerUrl, expandedPrompt: segment.expandedPrompt, timings: segment.timings,
        };
      }
    } catch { /* Repair metadata/media only by querying the original receipt. */ }
    const failure = atScene("video-failed");
    if (typeof failure?.data.message === "string" && /已结束：/.test(failure.data.message)) return { ok: false, reason: "render-failed", message: failure.data.message };
    const key = this.key();
    if (!key) return { ok: false, reason: "render-failed", message: "请连接原钱包以查询已受理任务，没有重新生成。" };
    const binding = atScene("video-request")?.data.keyHash;
    if (binding && binding !== createHash("sha256").update(key).digest("hex")) return { ok: false, reason: "render-failed", message: "该任务属于此前的钱包，请连接原钱包回收结果。没有使用新钱包提交或查询。" };
    this.store.afterRequest(() => this.store.record(id, "video-recovery-started", { sceneNumber: plan.sceneNumber, requestId }));
    try {
      const result = await collectTokenDanceVideo({ prompt: plan.prompt, apiKey: key, resumeRequestId: requestId,
        onQueryRetry: event => this.store.afterRequest(() => this.store.record(id, "video-query-retry", { ...event, sceneNumber: plan.sceneNumber })),
      }, this.video, { onPending: pendingId => this.store.afterRequest(() => this.store.record(id, "video-collection-pending", { sceneNumber: plan.sceneNumber, requestId: pendingId })) });
      const scene: RecordedScene = { sessionId: id, sceneNumber: plan.sceneNumber, teacherId: plan.teacherId, videoUrl: result.providerUrl,
        narration: plan.narration, summary: plan.summary, prompt: plan.prompt, expandedPrompt: result.expandedPrompt, timings: result.timings };
      // Validate a provider result before trusting or writing its fields.
      parseSegment({ kind: "generated", id: toSceneId(`recovery-${plan.sceneNumber}`), number: plan.sceneNumber, durationSeconds: 5,
        purpose: plan.purpose, prompt: plan.prompt, summary: plan.summary, captions: plan.captions,
        videoUrl: result.providerUrl, providerUrl: result.providerUrl, expandedPrompt: result.expandedPrompt, timings: result.timings });
      this.store.record(id, "video-completed", { sceneNumber: plan.sceneNumber, ...result, actualBilledCost: null });
      this.store.saveSceneMetadata(scene);
      const downloaded = await this.store.saveVideo(scene, this.download);
      return { ok: true, videoUrl: downloaded ? `/api/youth/saved-video/${encodeURIComponent(id)}/${plan.sceneNumber}` : result.providerUrl,
        providerUrl: result.providerUrl, expandedPrompt: result.expandedPrompt, timings: result.timings };
    } catch (error) {
      const message = error instanceof Error ? error.message : "原任务回收失败，没有重新提交。";
      this.store.afterRequest(() => this.store.record(id, "video-recovery-pending", { sceneNumber: plan.sceneNumber, requestId, message }));
      return { ok: false, reason: "render-failed", message };
    }
  }
}
