import Image from "next/image";
import type { EntrancePhase } from "@/components/set/camera-motion";
import { YOUTH_MENTORS, type YouthMentorId } from "./mentor-portrait";

// An anime title-card reveal using the existing portrait, not another 3D scene.
// The scene announces entering only after its assets and first frames are ready.
export function YouthEntrance({ phase, mentor }: { phase: EntrancePhase; mentor: YouthMentorId }) {
  if (phase === "ready") return null;
  const failed = phase === "failed";
  return <div className={`youth-entrance youth-entrance-${phase}`} aria-hidden={phase === "entering"}>
    <div className="youth-entrance-rule youth-entrance-rule-top" aria-hidden="true" />
    <div className="youth-entrance-layout">
      <div className="youth-entrance-copy" role={failed ? "alert" : "status"} aria-live="polite">
        <span className="youth-entrance-eyebrow">{failed ? "连接中断" : "正在进入教室"}</span>
        <strong className="youth-entrance-title">{failed ? <>稍等<span>一下</span></> : <>课堂<span>即将开始</span></>}</strong>
        <div className="youth-entrance-track" aria-hidden="true"><span /></div>
        <p>{failed ? "场景未能加载，请检查网络或浏览器的 WebGL 支持。" : "正在载入场景与材质"}</p>
        {failed && <button type="button" onClick={() => window.location.reload()}>重新加载</button>}
      </div>
      <div className="youth-entrance-art" aria-hidden="true">
        <div className="youth-entrance-panel" />
        <div className="youth-entrance-portrait">
          <Image src={`/youth/characters/${YOUTH_MENTORS[mentor].asset}`} alt="" width={1024} height={1536}
            sizes="(max-width: 700px) 200px, (max-height: 650px) 220px, 320px" draggable={false} loading="eager" />
        </div>
        <span className="youth-entrance-marker" />
      </div>
    </div>
    <div className="youth-entrance-rule youth-entrance-rule-bottom" aria-hidden="true" />
  </div>;
}
