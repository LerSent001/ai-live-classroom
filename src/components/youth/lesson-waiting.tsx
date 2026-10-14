"use client";

import Image from 'next/image';
import {useEffect, useRef} from 'react';

/** Existing illustrated character + compositor motion; no generation or WebGL loop. */
export function YouthLessonWaiting({preparing}:{preparing:boolean}) {
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const update=()=>root.current?.setAttribute('data-paused',String(document.hidden));
    update();document.addEventListener('visibilitychange',update);
    return ()=>document.removeEventListener('visibilitychange',update);
  },[]);
  return <div ref={root} className="youth-lesson-waiting" data-waiting-kind={preparing?'preparing':'buffering'}>
    <div className="youth-waiting-art" aria-hidden="true">
      <i className="youth-waiting-star star-one">✦</i><i className="youth-waiting-star star-two">✧</i>
      <div className="youth-waiting-character">
        {/* Frame the front view without changing or destroying the original sheet. */}
        <Image src="/youth/characters/vroid-chibi-turnaround.png" width={1619} height={971}
          sizes="600px" alt="" loading="eager" draggable={false} />
      </div>
      <div className="youth-waiting-shadow" />
    </div>
    <strong>{preparing?'课程画面准备中':'正在衔接下一段'}</strong>
    <span>视频就绪后自动播放<span className="youth-waiting-dots" aria-hidden="true"><i/><i/><i/></span></span>
  </div>;
}
