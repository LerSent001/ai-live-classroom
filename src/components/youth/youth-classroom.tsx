"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { LessonDeck, type LessonPlaybackIssue, type SignoffState } from "@/components/lesson-deck";
import { useClassroom } from "@/hooks/use-classroom";
import { YouthTokenPayWallet } from "./tokenpay-wallet";
import { nextYouthMentor, YOUTH_MENTORS, YouthMentorPortrait, type YouthMentorId } from "./mentor-portrait";
import { YouthEntrance } from "./entrance";
import type { EntrancePhase } from "@/components/set/camera-motion";
import { CLASSROOM_CONFIG, DEMO_CONFIG } from "@/lib/classroom-config";
import type { PlaybackReport } from "@/lib/classroom-types";
import { isLessonSubmitKey, isValidTopic } from "@/lib/lesson-language";
import { lessonHasFailed } from "@/lib/classroom-status";
import { isYouthTeacher, YOUTH_MENTOR_TEACHER_IDS, YOUTH_SESSION_KEY, youthNotice } from "@/lib/youth-classroom";

const YouthScene = dynamic(() => import("./youth-scene"), { ssr: false });
const silentSoundtrack = { enabled: false, toggle() {} };
type PlaylistLesson = ReturnType<typeof useClassroom>["playlist"][number];

function lessonStatus(lesson: PlaylistLesson): string {
  switch (lesson.kind) {
    case "waiting": return "排队中";
    case "preparing": return "准备中";
    case "generating": return `生成中 ${lesson.readyScenes}/${lesson.targetScenes}`;
    case "ready": return "待播放";
    case "playing": return "播放中";
    case "complete": return "已播放";
    case "failed": return "未能播放";
  }
}

function YouthGuideProgress({ sceneKey, playedScenes, targetScenes, clipSeconds, complete, status, durationKnown }: Readonly<{
  sceneKey: string | null; playedScenes: number; targetScenes: number; clipSeconds: number; complete: boolean; status: string; durationKnown: boolean;
}>) {
  const [elapsed, setElapsed] = useState<{ key: string | null; seconds: number }>({ key: null, seconds: 0 });
  useEffect(() => {
    if (!sceneKey) return;
    const startedAt = performance.now();
    const timer = window.setInterval(() => setElapsed({ key: sceneKey, seconds: (performance.now() - startedAt) / 1000 }), 250);
    return () => window.clearInterval(timer);
  }, [sceneKey]);
  const totalSeconds = targetScenes * clipSeconds;
  const elapsedSeconds = sceneKey && elapsed.key === sceneKey ? Math.min(clipSeconds, elapsed.seconds) : 0;
  const playedSeconds = complete ? totalSeconds : Math.min(totalSeconds, playedScenes * clipSeconds + elapsedSeconds);
  const progress = totalSeconds > 0 ? Math.round(playedSeconds / totalSeconds * 100) : 0;
  const secondsLeft = Math.max(0, Math.ceil(totalSeconds - playedSeconds));
  return <>
    <div className="guide-progress" role="progressbar" aria-label="课程播放进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={durationKnown ? progress : undefined}>
      <span style={{ width: `${progress}%` }} />
    </div>
    <div className="guide-meta"><span>{status}</span><span>{durationKnown ? `剩余 ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}` : "时长待规划"}</span></div>
  </>;
}

export function YouthClassroom() {
  const [walletReady, setWalletReady] = useState(false);
  const [walletOpenRequest, setWalletOpenRequest] = useState(0);
  const onWalletReady = useCallback(() => setWalletReady(true), []);
  const classroom = useClassroom(YOUTH_SESSION_KEY, { apiBase: "/api/youth/classroom", enabled: walletReady });
  const { snapshot } = classroom;
  const [entrancePhase, setEntrancePhase] = useState<EntrancePhase>("loading");
  const ready = entrancePhase === "ready";
  const [topic, setTopic] = useState("");
  const [selectedMentor, setSelectedMentor] = useState<YouthMentorId>("male");
  const [nextTopic, setNextTopic] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [queueing, setQueueing] = useState<string | null>(null);
  const [roomView, setRoomView] = useState(false);
  const [cameraAtScreen, setCameraAtScreen] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [playbackIssue, setPlaybackIssue] = useState<LessonPlaybackIssue | null>(null);
  const active = snapshot !== null && snapshot.production.kind !== "idle";
  const phase = snapshot?.phase ?? "idle";
  const teacherId = active && isYouthTeacher(snapshot?.teacherId) ? snapshot.teacherId : YOUTH_MENTOR_TEACHER_IDS[selectedMentor];
  const focusReady = mediaReady || Boolean(snapshot?.hasPlaybackBegun) || classroom.playback.ready[0]?.kind === "skipped";
  const screenView = active && !roomView && focusReady;
  const onEntrancePhase = useCallback((phase: EntrancePhase) => setEntrancePhase((current) => current === "failed" ? current : phase), []);
  const onFailure = useCallback(() => setEntrancePhase("failed"), []);
  const onSettled = useCallback((screen: boolean) => setCameraAtScreen(screen), []);
  const sendPlaybackReport = classroom.actions.reportPlayback;
  const reportPlayback = useCallback((report: PlaybackReport) => {
    if (report.kind === "media-ready") setMediaReady(true);
    sendPlaybackReport(report);
  }, [sendPlaybackReport]);

  async function start(event?: FormEvent) {
    event?.preventDefault();
    if (!ready || !isValidTopic(topic) || submitting) return;
    if (!classroom.actions.canStart) {
      if (snapshot?.configured === false) { setLocalError(null); setWalletOpenRequest((value) => value + 1); }
      else setLocalError("正在连接课堂，请稍后重试。");
      return;
    }
    setLocalError(null); setSubmitting(true); setRoomView(false); setCameraAtScreen(false); setMediaReady(false);
    try { await classroom.actions.start({ topic: topic.trim(), teacherId, durationSeconds: DEMO_CONFIG.initialDurationSeconds }); }
    finally { setSubmitting(false); }
  }
  const queue = useCallback(async (value: string) => {
    if (!classroom.actions.canQueue || queueing || !isValidTopic(value)) return;
    setQueueing(value);
    try { if (await classroom.actions.queueLesson(value.trim())) setNextTopic(""); }
    finally { setQueueing(null); }
  }, [classroom.actions, queueing]);
  const current = classroom.playlist.find((lesson) => lesson.kind === "playing")
    ?? (phase === "complete" ? [...classroom.playlist].reverse().find((lesson) => lesson.kind === "complete") : undefined)
    ?? classroom.playlist.find((lesson) => lesson.kind !== "complete" && lesson.kind !== "failed")
    ?? classroom.playlist.at(-1);
  const upcoming = classroom.playlist.filter((lesson) => lesson !== current && lesson.kind !== "complete" && lesson.kind !== "failed");
  const signoff: SignoffState = phase !== "complete" ? null : upcoming[0]
    ? { kind: "queued", topic: upcoming[0].topic }
    : classroom.actions.canQueue ? { kind: "picks", picks: classroom.suggestedTopics, busyTopic: queueing, onPick: (pick) => void queue(pick) } : null;
  const notice = youthNotice(localError ?? classroom.connectionError ?? snapshot?.warning);
  const complete = phase === "complete";
  const failed = snapshot !== null && lessonHasFailed(snapshot);
  const hasLesson = snapshot?.lesson != null;
  const queuedTopics = new Set(classroom.playlist.map((lesson) => lesson.topic.trim().toLowerCase()));
  const suggestedTopics = classroom.suggestedTopics.filter((pick) => !queuedTopics.has(pick.trim().toLowerCase()));
  const targetScenes = snapshot?.lesson?.targetSceneCount ?? 0;
  const clipSeconds = snapshot?.playing?.durationSeconds ?? snapshot?.ready[0]?.durationSeconds ?? CLASSROOM_CONFIG.clipDurationSeconds;
  const sceneNumber = snapshot?.playback.kind === "playing" ? snapshot.playback.sceneNumber : null;
  const sceneKey = sceneNumber && snapshot ? `${current?.sessionId ?? snapshot.id}:${sceneNumber}` : null;
  const playedScenes = Math.max(snapshot?.scenes.filter((scene) => scene.kind === "played").length ?? 0, sceneNumber ? sceneNumber - 1 : 0);
  const playbackStatus = failed ? "课程未完成" : complete ? "已结束" : snapshot?.playback.kind === "playing" ? "播放中"
    : snapshot?.playback.kind === "buffering" ? "缓冲中" : phase === "preparing" ? "准备中" : "待播放";
  const nextMentor = nextYouthMentor(selectedMentor);

  return <main lang="zh-CN" className={`youth-classroom ${active ? "youth-active" : "youth-lobby"}`}
    data-theme="zh-youth" data-scene-ready={ready} data-entrance-phase={entrancePhase} data-desk-count="6" data-lesson-mode="question">
    <YouthScene screenView={screenView} onEntrancePhase={onEntrancePhase} onSettled={onSettled} onFailure={onFailure}>
      <LessonDeck phase={phase} teacherId={teacherId} intent={classroom.playback}
        playbackEnabled={cameraAtScreen || Boolean(snapshot?.hasPlaybackBegun)}
        onEvent={reportPlayback} warning={active ? notice ?? null : null}
        signoff={signoff} music={silentSoundtrack} onPlaybackIssue={setPlaybackIssue}
        onExit={() => void classroom.actions.clear(true)} />
    </YouthScene>

    <YouthEntrance phase={entrancePhase} mentor={selectedMentor} />

    <YouthTokenPayWallet ready={ready} openRequest={walletOpenRequest} active={active}
      onReady={onWalletReady} onChanged={classroom.actions.resetConnection} />

    {ready && !active && <section className="youth-composer" aria-label="开始新课程">
      <div className="youth-mentor" data-youth-mentor={selectedMentor}>
        <button type="button" className="youth-mentor-switch" disabled={submitting}
          aria-label={`切换为${YOUTH_MENTORS[nextMentor].label}`}
          title={`当前：${YOUTH_MENTORS[selectedMentor].label} · 切换为${YOUTH_MENTORS[nextMentor].label}`}
          onClick={() => setSelectedMentor(nextYouthMentor)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="m15 4 4 4-4 4M5 8h14M9 12l-4 4 4 4m10-4H5" />
          </svg>
        </button>
        <YouthMentorPortrait mentor={selectedMentor} />
      </div>
      <h1>从一个好问题开始</h1>
      <form onSubmit={(event) => void start(event)}>
        <label className="sr-only" htmlFor="youth-topic">想学习的问题</label>
        <input id="youth-topic" placeholder="例如：彩虹是怎么形成的？" value={topic} maxLength={500} autoComplete="off"
          disabled={submitting} onChange={(event) => { setTopic(event.target.value); setLocalError(null); }}
          onKeyDown={(event) => { if (event.key === "Enter" && !isLessonSubmitKey(event)) event.preventDefault(); }} />
        <button type="submit" disabled={!isValidTopic(topic) || submitting}>{submitting ? "正在准备" : "开始探索"}</button>
      </form>
      <p className="youth-generation-note">生成按 TokenDance 用量计费 · 请由家长或老师授权</p>
    </section>}

    {ready && active && <>
      <button type="button" className="youth-view-toggle" disabled={!focusReady} onClick={() => setRoomView((value) => !value)}>
        {roomView ? "回到屏幕" : "看看教室"}
      </button>
      <aside className="chat-overlay guide youth-guide" aria-label="课程导览">
        <header className="guide-header youth-guide-header">
          <div className="guide-heading">
            <strong>{!hasLesson && phase === "preparing" ? "正在准备课堂…" : snapshot?.lesson?.title ?? current?.topic ?? snapshot?.topic}</strong>
            {hasLesson && snapshot?.lesson?.title !== (current?.topic ?? snapshot?.topic) && <small>{current?.topic ?? snapshot?.topic}</small>}
          </div>
          {complete && <button type="button" className="youth-guide-new-question" disabled={!classroom.actions.canClear}
            onClick={async () => { await classroom.actions.clear(); setRoomView(false); setCameraAtScreen(false); setMediaReady(false); setLocalError(null); }}>提新问题</button>}
          {!complete && <button type="button" className="youth-guide-new-question"
            title="退出会停止新片段提交；已受理任务仍可能计费，并继续保存结果。"
            onClick={() => void classroom.actions.clear(true)}>退出课程</button>}
        </header>
        <div className="guide-body">
          <section className="guide-now" aria-label="当前课程">
            <YouthGuideProgress sceneKey={sceneKey} playedScenes={playedScenes} targetScenes={targetScenes}
              clipSeconds={clipSeconds} complete={complete && !failed} status={playbackStatus} durationKnown={hasLesson} />
          </section>
          <section className="guide-section">
            <h2 className="guide-title">接下来</h2>
            {upcoming.length === 0 ? <p className="guide-empty">{failed ? "当前课程尚未完成，请先处理课程提示。" : !hasLesson ? "课程准备好后可以选择续讲。" : classroom.actions.canQueue ? "选一个问题，接着学习。" : "续讲已全部选好。"}</p>
              : <ol className="guide-queue">{upcoming.map((lesson, index) => <li key={lesson.sessionId}>
                <span>{String(index + 1).padStart(2, "0")}</span><div><p>{lesson.topic}</p><small>{lessonStatus(lesson)}</small></div>
              </li>)}</ol>}
          </section>
        </div>
        <div className="guide-add">
          <div className="guide-add-row">
            <label className="sr-only" htmlFor="youth-next-topic">继续学习的问题</label>
            <input id="youth-next-topic" value={nextTopic} disabled={!classroom.actions.canQueue || queueing !== null}
              onChange={(event) => setNextTopic(event.target.value)} placeholder={classroom.actions.canQueue ? "接下来想了解什么？" : "等待下一节课程"} maxLength={500}
              onKeyDown={(event) => { if (event.key === "Enter" && isLessonSubmitKey(event)) { event.preventDefault(); void queue(nextTopic); } }} />
            <button type="button" className="composer-action" aria-label="加入续讲" disabled={!classroom.actions.canQueue || queueing !== null || !isValidTopic(nextTopic)}
              onClick={() => void queue(nextTopic)}>+</button>
          </div>
          {suggestedTopics.length > 0 && <div className="guide-picks">
            {suggestedTopics.map((pick) => <button key={pick} type="button" disabled={!classroom.actions.canQueue || queueing !== null}
              onClick={() => void queue(pick)}><span>{queueing === pick ? "…" : "+"}</span>{pick}</button>)}
          </div>}
        </div>
      </aside>
    </>}
    {(notice || (active && playbackIssue)) && <div className="youth-notice" role="alert"><span>{active && playbackIssue ? playbackIssue.message : notice}</span>
      {active && playbackIssue && <button type="button" onClick={playbackIssue.retry}>{playbackIssue.kind === "gesture" ? "播放课程并开启声音" : "重新加载视频（不重新生成）"}</button>}
      {active && <button type="button" onClick={() => void classroom.actions.clear(true)}>退出课程</button>}
      {classroom.sessionExpired && <button type="button" onClick={() => void classroom.actions.clear()}>重新连接</button>}
      {localError && <button type="button" onClick={() => setLocalError(null)}>知道了</button>}
    </div>}
  </main>;
}
