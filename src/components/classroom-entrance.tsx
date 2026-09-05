"use client";

import { Component, type ReactNode } from "react";
import { TeacherPortrait } from "./teacher-portrait";
import type { EntrancePhase } from "./set/camera-motion";
import { TEACHERS } from "@/lib/classroom-config";
import type { TeacherId } from "@/lib/classroom-types";

export function ClassroomEntrance({ phase, teacherId }: Readonly<{ phase: EntrancePhase; teacherId: TeacherId }>) {
  if (phase === "ready") return null;
  const failed = phase === "failed";
  return (
    <div className={`classroom-entrance classroom-entrance-${phase}`} aria-hidden={phase === "entering"}>
      <div className="entrance-checkers entrance-checkers-top" aria-hidden="true" />
      <span className="entrance-cross entrance-cross-one" aria-hidden="true">+</span>
      <span className="entrance-cross entrance-cross-two" aria-hidden="true">+</span>
      <div className="entrance-center" role={failed ? "alert" : "status"} aria-live="polite">
        <div className="entrance-mascot" aria-hidden="true">
          <i className="entrance-target" />
          <TeacherPortrait className="entrance-bear" expression="standing" teacherId={teacherId} />
        </div>
        <span className="entrance-kicker">{TEACHERS[teacherId].name.toUpperCase()} CLASSROOM</span>
        <strong className="entrance-title">{failed ? "HOLD ON!" : <>NOW<span>LOADING</span></>}</strong>
        <div className="entrance-track" aria-hidden="true"><span /></div>
        <p>{failed ? "教室暂时未能加载，请重新进入。" : "正在进入教室"}</p>
        {failed && <button onClick={() => window.location.reload()} type="button">重新进入 →</button>}
      </div>
      <div className="entrance-checkers entrance-checkers-bottom" aria-hidden="true" />
    </div>
  );
}

// Asset/WebGL failures should offer a retry instead of leaving the loading screen forever.
export class ClassroomSceneBoundary extends Component<{
  children: ReactNode;
  onFailure: () => void;
}, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) {
    console.error("Classroom scene failed to load:", error);
    this.props.onFailure();
  }
  render() { return this.state.failed ? null : this.props.children; }
}
