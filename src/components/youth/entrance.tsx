import type { EntrancePhase } from "@/components/set/camera-motion";
import type { YouthMentorId } from "./mentor-portrait";

// Minimal loading signal; the actual 3D room supplies the one-shot arrival.
// The scene announces entering only after its assets and first frames are ready.
export function YouthEntrance({ phase }: { phase: EntrancePhase; mentor: YouthMentorId; showPortrait?: boolean }) {
  if (phase === "ready") return null;
  const failed = phase === "failed";
  return <div className={`youth-entrance youth-entrance-${phase}`} aria-hidden={phase === "entering"}>
    <div className="youth-arrival-loader" role={failed ? "alert" : "status"} aria-live="polite">
        <div className="youth-arrival-symbol" aria-hidden="true"><i /><span /></div>
        <p>{failed ? "教室暂时未能打开" : "正在准备教室"}</p>
        {failed && <small>请检查网络后重试</small>}
        {failed && <button type="button" onClick={() => window.location.reload()}>重新加载</button>}
    </div>
  </div>;
}
