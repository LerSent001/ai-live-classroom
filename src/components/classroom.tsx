"use client";
import { TokenPayWallet } from "@/components/tokenpay-wallet";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LessonDeck, type SignoffState } from "@/components/lesson-deck";
import { ClassroomSet } from "@/components/classroom-set";
import { ClassroomEntrance } from "@/components/classroom-entrance";
import type { EntrancePhase } from "@/components/set/camera-motion";
import { TeacherPortrait } from "@/components/teacher-portrait";
import { CLASSROOM_CONFIG, DEMO_CONFIG, DEFAULT_TEACHER_ID, TEACHERS } from "@/lib/classroom-config";
import type { CourseSection, TeacherId } from "@/lib/classroom-types";
import { useClassroom } from "@/hooks/use-classroom";
import { useContinuousSoundtrack } from "@/hooks/use-continuous-soundtrack";
import { isLessonSubmitKey, isValidTopic } from "@/lib/lesson-language";

type PlaylistLesson = ReturnType<typeof useClassroom>["playlist"][number];

function lineupStatus(lesson: PlaylistLesson): string {
  switch (lesson.kind) {
    case "waiting": return "in the lineup";
    case "preparing": return "loading";
    case "generating": return `filming ${lesson.readyScenes}/${lesson.targetScenes}`;
    case "ready": return "ready to air";
    case "playing": return "on air";
    case "complete": return "aired";
    case "failed": return "could not air";
  }
}

export function Classroom() {
  const classroom = useClassroom();
  return <ClassroomView classroom={classroom} />;
}

export function ClassroomView({ classroom }: Readonly<{ classroom: ReturnType<typeof useClassroom> }>) {
  const { snapshot } = classroom;
  const [entrancePhase, setEntrancePhase] = useState<EntrancePhase>("loading");
  const [selectedTeacherId, setSelectedTeacherId] = useState<TeacherId>(DEFAULT_TEACHER_ID);
  const [topic, setTopic] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [queueingTopic, setQueueingTopic] = useState<string | null>(null);
  const phase = snapshot?.phase ?? "idle";
  const experienceActive = snapshot !== null && snapshot.production.kind !== "idle";
  const teacherId = experienceActive ? snapshot.teacherId : selectedTeacherId;
  const teacher = TEACHERS[teacherId];
  const nextTeacherId = teacherId === "monokuma" ? "monomi" : "monokuma";
  const music = useContinuousSoundtrack(
    Boolean(!classroom.sessionExpired && snapshot?.hasPlaybackBegun && phase !== "complete"),
  );
  const topicLocked = snapshot?.production.kind !== "idle";
  const queuedTopics = useMemo(
    () => new Set(classroom.playlist.slice(1).map((lesson) => lesson.topic.toLowerCase())),
    [classroom.playlist],
  );
  const current = classroom.playlist.find(
    (lesson) => lesson.sessionId === snapshot?.playbackContext.sessionId,
  )
    ?? classroom.playlist.find((lesson) => lesson.kind === "playing")
    ?? classroom.playlist.find((lesson) => lesson.kind !== "complete" && lesson.kind !== "failed")
    ?? classroom.playlist[classroom.playlist.length - 1]
    ?? null;
  const targetScenes = snapshot?.lesson?.targetSceneCount ?? 0;
  const playedScenes = snapshot?.scenes.filter((scene) => scene.kind === "played").length ?? 0;
  const clipSeconds = CLASSROOM_CONFIG.clipDurationSeconds;
  const playingScene = snapshot?.scenes.find((scene) => scene.kind === "playing") ?? null;
  const playingKey = playingScene && snapshot
    ? `${snapshot.playbackContext.sessionId}:${playingScene.id}`
    : null;

  // The server only reports whole scenes; assume each clip runs its nominal length and tick between updates.
  const [sceneElapsed, setSceneElapsed] = useState<{ key: string | null; seconds: number }>({ key: null, seconds: 0 });
  useEffect(() => {
    if (!playingKey) return;
    const startedAt = Date.now();
    const timer = window.setInterval(
      () => setSceneElapsed({ key: playingKey, seconds: (Date.now() - startedAt) / 1000 }),
      250,
    );
    return () => window.clearInterval(timer);
  }, [playingKey]);
  const elapsedInScene = playingKey && sceneElapsed.key === playingKey
    ? Math.min(clipSeconds, sceneElapsed.seconds)
    : 0;
  const totalSeconds = targetScenes * clipSeconds;
  const playedSeconds = Math.min(totalSeconds, playedScenes * clipSeconds + elapsedInScene);
  const secondsLeft = Math.max(0, Math.ceil(totalSeconds - playedSeconds));
  const progress = totalSeconds > 0 ? playedSeconds / totalSeconds : 0;
  const followupsUsed = Math.max(0, classroom.playlist.length - 1);
  const allFollowupsSelected = followupsUsed >= DEMO_CONFIG.maxBranches;
  const courseDocument = snapshot?.courseDocument ?? null;
  const courseSections = courseDocument
    ? [courseDocument.main, ...courseDocument.appendices].filter(
        (section): section is CourseSection => section !== null,
      )
    : [];
  const activeSection = courseSections.find(
    (section) => section.id === courseDocument?.activeSectionId,
  ) ?? courseSections[0] ?? null;
  const playingStepId = snapshot?.playing?.purpose.stepId ?? null;
  const activePage = activeSection?.pages.find((page) => page.stepId === playingStepId)
    ?? activeSection?.pages.find((page) => page.media.status === "ready")
    ?? activeSection?.pages[0]
    ?? null;

  const queueLesson = useCallback(async (nextTopic: string) => {
    music.arm();
    setQueueingTopic(nextTopic);
    await classroom.actions.queueLesson(nextTopic);
    setQueueingTopic(null);
  }, [classroom.actions, music]);

  const startLesson = () => {
    if (entrancePhase !== "ready" || !classroom.actions.canStart || !isValidTopic(topic)) return;
    music.arm();
    void classroom.actions.start({ topic, teacherId: selectedTeacherId });
  };

  const addCustomTopic = () => {
    const trimmed = customTopic.trim();
    if (!isValidTopic(trimmed) || !classroom.actions.canQueue || queueingTopic !== null) return;
    setCustomTopic("");
    void queueLesson(trimmed);
  };

  const signoff: SignoffState = phase !== "complete"
    ? null
    : classroom.actions.canQueue && classroom.suggestedTopics.length > 0
        ? {
            kind: "picks",
            picks: classroom.suggestedTopics,
            busyTopic: queueingTopic,
            onPick: (pick: string) => {
              void queueLesson(pick);
            },
          }
        : null;

  return (
    <main data-entrance-phase={entrancePhase} className={`classroom-experience ${experienceActive ? "classroom-experience-active" : "classroom-experience-lobby"}`}>
      <TokenPayWallet ready={Boolean(snapshot)} />
      <ClassroomSet active={experienceActive} phase={entrancePhase} onPhaseChange={setEntrancePhase}>
        <LessonDeck
          teacherId={teacherId}
          intent={classroom.playback}
          music={music}
          onEvent={classroom.actions.reportPlayback}
          phase={phase}
          signoff={signoff}
          warning={snapshot?.warning ?? null}
        />
      </ClassroomSet>
      <ClassroomEntrance phase={entrancePhase} teacherId={teacherId} />

      <div className="experience-notices">
        {snapshot?.fixture && (
          <div className="notice notice-fixture" role="status">
            Verification fixture: local media only. TokenPay cannot be called in this mode.
          </div>
        )}
        {classroom.connectionError && (
          <div className="notice notice-error" role="alert">
            {classroom.connectionError}
            {classroom.sessionExpired && (
              <button onClick={() => void classroom.actions.clear()} type="button">重新进入教室</button>
            )}
          </div>
        )}
      </div>

      {!experienceActive && entrancePhase === "ready" && (
        <section className="chat-overlay lobby-overlay">
          <div className="lobby-host">
            <div className="lobby-prompt">
              <span className="host-name" aria-live="polite">{teacher.name}</span>
              <h1>What do you want to learn about?</h1>
            </div>
            <div className="lobby-portrait">
              <button
                type="button"
                className="teacher-switch"
                aria-label={`切换为${TEACHERS[nextTeacherId].label}`}
                title={`当前：${teacher.label} · 切换为${TEACHERS[nextTeacherId].label}`}
                onClick={() => setSelectedTeacherId(nextTeacherId)}
              >
                <span aria-hidden="true">⇄</span> 切换形象
              </button>
              <span className="portrait-target" aria-hidden="true" />
              <TeacherPortrait className="teacher-portrait-host" expression="standing" teacherId={teacherId} />
            </div>
          </div>
          <div className="lobby-composer">
            <label className="sr-only" htmlFor="lesson-topic">Lesson topic</label>
            <textarea
              disabled={topicLocked}
              id="lesson-topic"
              maxLength={500}
              onChange={(event) => setTopic(event.target.value)}
              onKeyDown={(event) => {
                if (!isLessonSubmitKey(event)) return;
                event.preventDefault();
                startLesson();
              }}
              placeholder="想了解什么？例如：什么是臭氧层"
              rows={2}
              value={topic}
            />
            <button
              aria-label="Start lesson"
              className="composer-action"
              disabled={!classroom.actions.canStart || !isValidTopic(topic)}
              onClick={startLesson}
              type="button"
            >
              →
            </button>
          </div>
        </section>
      )}

      {experienceActive && entrancePhase === "ready" && (
        <aside className="chat-overlay guide">
          <header className="guide-header">
            <TeacherPortrait className="teacher-portrait-mini" expression="standing" teacherId={teacherId} />
            <div className="guide-heading">
              <span className="host-name">{teacher.name}</span>
              <strong>Program guide</strong>
            </div>
            <div className="guide-actions">
              <button disabled={!classroom.actions.canClear} onClick={() => void classroom.actions.clear()} type="button">
                New lesson
              </button>
            </div>
          </header>

          <div className="guide-body">
            <section className="guide-now">
              <div className="guide-now-head">
                <strong>
                  {phase === "preparing"
                    ? snapshot?.playbackContext.kind === "branch" ? "正在准备问题分支…" : "正在规划课程结构…"
                    : snapshot?.lesson?.title ?? current?.topic ?? snapshot?.topic ?? "Tuning in"}
                </strong>
              </div>
              {phase !== "preparing" && snapshot?.lesson?.title && <small>{current?.topic ?? snapshot?.topic}</small>}
              <div className="guide-progress" aria-label={`${Math.round(progress * 100)} percent played`}>
                <span style={{ width: `${progress * 100}%` }} />
              </div>
              <div className="guide-meta">
                <span>{current ? lineupStatus(current) : "loading"}</span>
                <span>
                  {targetScenes === 0
                    ? "AI 正在决定时长"
                    : `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")} left`}
                </span>
              </div>
            </section>

            {activePage && (
              <section className="guide-section courseware-current" aria-live="polite">
                <div className="courseware-current-head">
                  <h2 className="guide-title">
                    {activeSection?.kind === "branch" ? "问题分支" : "当前课件"}
                  </h2>
                  <span>{activePage.startSeconds}–{activePage.endSeconds}s</span>
                </div>
                <strong>{activePage.title}</strong>
                <p>{activePage.summary}</p>
              </section>
            )}

            {activeSection && (
              <section className="guide-section">
                <h2 className="guide-title">课程结构</h2>
                <ol className="courseware-pages">
                  {activeSection.pages.map((page) => (
                    <li
                      className={page.id === activePage?.id ? "courseware-page-active" : ""}
                      key={page.id}
                    >
                      <span>{String(page.position).padStart(2, "0")}</span>
                      <div>
                        <p>{page.title}</p>
                        <small>{page.media.status === "ready" ? "视频已生成" : page.media.status === "failed" ? "文字课件" : "生成中"}</small>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {courseDocument && courseDocument.appendices.length > 0 && (
              <section className="guide-section courseware-appendices">
                <h2 className="guide-title">问题附录</h2>
                <ol>
                  {courseDocument.appendices.map((section, index) => (
                    <li key={section.id}><span>A{index + 1}</span>{section.title}</li>
                  ))}
                </ol>
              </section>
            )}

            {courseDocument?.exportReady && (
              <section className="guide-section courseware-downloads">
                <h2 className="guide-title">下载课件</h2>
                <div>
                  <a download href={`/api/classroom/${snapshot?.id}/export?format=pptx`}>PPTX 可编辑版</a>
                  <a download href={`/api/classroom/${snapshot?.id}/export?format=pdf`}>PDF 阅读版</a>
                </div>
                <small>复用本次已生成的视频，不会再次调用模型。</small>
              </section>
            )}
          </div>

          <div className="guide-add">
            <p className="guide-add-note">
              {snapshot?.playbackContext.kind === "branch"
                ? "主课已暂停。回答完成后会回到刚才的位置。"
                : "随时提问。系统会保存当前播放位置，先回答问题，再继续主课。"}
            </p>
            <div className="guide-add-row">
            <label className="sr-only" htmlFor="custom-topic">提出课堂问题</label>
            <input
              disabled={!classroom.actions.canQueue || queueingTopic !== null}
              id="custom-topic"
              maxLength={500}
              onChange={(event) => setCustomTopic(event.target.value)}
              onKeyDown={(event) => {
                if (isLessonSubmitKey(event)) {
                  event.preventDefault();
                  addCustomTopic();
                }
              }}
              placeholder={classroom.actions.canQueue ? "对这里有什么问题？" : allFollowupsSelected ? "本次体验的问题分支已用完" : "正在回答当前问题"}
              value={customTopic}
            />
            <button
              aria-label="提出课堂问题"
              className="composer-action"
              disabled={!classroom.actions.canQueue || !isValidTopic(customTopic) || queueingTopic !== null}
              onClick={addCustomTopic}
              type="button"
            >
              ?
            </button>
            </div>
            {classroom.suggestedTopics.length > 0 && (
              <div className="guide-picks">
                {classroom.suggestedTopics.map((pick) => {
                  const queued = queuedTopics.has(pick.toLowerCase());
                  return (
                    <button
                      disabled={!classroom.actions.canQueue || queued || queueingTopic !== null}
                      key={pick}
                      onClick={() => void queueLesson(pick)}
                      type="button"
                    >
                      <span>{queued ? "✓" : queueingTopic === pick ? "…" : "+"}</span>
                      {pick}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      )}
    </main>
  );
}
