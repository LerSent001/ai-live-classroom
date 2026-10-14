"use client";

import { useEffect, useState } from 'react';

export const MENTOR_GREETINGS = [
  '今天想问些什么呢？',
  '有什么好奇的事吗？',
  '今天想了解点什么？',
  '想聊点什么？',
  '刚刚想到什么问题了吗？',
  '小小的疑问，也可以问我。',
] as const;

export function MentorBubble() {
  const [message, setMessage] = useState<{index:number; visible:boolean}>({index:0,visible:false});
  useEffect(() => {
    let timer: number | undefined;
    let index = 0;
    let visible = false;
    let presented = false;
    const tick = () => {
      if (document.hidden) return;
      visible = !visible;
      setMessage({index,visible});
      if (!visible) index = (index + 1) % MENTOR_GREETINGS.length;
      timer = window.setTimeout(tick, visible ? 3800 : 4800);
    };
    const resume = () => {
      window.clearTimeout(timer); visible = false;
      setMessage({index,visible:false});
      if (presented && !document.hidden) timer = window.setTimeout(tick, 3000);
    };
    const onPresented = () => {
      if (presented) return;
      presented = true;
      resume();
    };
    window.addEventListener('mentor-presented', onPresented);
    if (document.querySelector('.youth-vroid-portrait canvas[data-mentor-presented="true"]')) presented = true;
    resume(); document.addEventListener('visibilitychange', resume);
    return () => {window.clearTimeout(timer); document.removeEventListener('visibilitychange', resume); window.removeEventListener('mentor-presented', onPresented);};
  }, []);
  return <div className="youth-mentor-bubble" data-visible={message.visible} aria-hidden={!message.visible}>
    <svg className="youth-mentor-cloud" viewBox="0 0 280 110" preserveAspectRatio="none" aria-hidden="true">
      <path d="M29 78C7 78 2 48 20 38C14 17 39 5 58 17C68-1 97 0 109 13C129-2 158 2 168 15C191 1 214 8 221 25C247 12 272 30 264 50C284 65 266 87 246 83C231 99 207 98 195 87C171 100 146 97 135 87C111 102 87 94 78 83C57 97 35 91 29 78Z" />
      <ellipse cx="250" cy="98" rx="7" ry="5" /><ellipse cx="267" cy="107" rx="3.5" ry="3" />
    </svg>
    <span key={message.index}>{MENTOR_GREETINGS[message.index]}</span>
  </div>;
}
