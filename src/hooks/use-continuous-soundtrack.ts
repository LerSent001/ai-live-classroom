"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SOUNDTRACK_URL = "/audio/retro-classroom-loop.wav";
const MUSIC_VOLUME = 0.22;

export function useContinuousSoundtrack(shouldPlay: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [armed, setArmed] = useState(false);

  const audio = useCallback(() => {
    if (!audioRef.current) {
      const next = new Audio(SOUNDTRACK_URL);
      next.loop = true;
      next.preload = "auto";
      next.volume = 0;
      audioRef.current = next;
    }
    return audioRef.current;
  }, []);

  // Called from user gestures so autoplay policy lets the loop start. A player that is already
  // running must be left alone: zeroing its volume here silenced the music when queueing a lesson.
  const arm = useCallback(() => {
    const player = audio();
    if (!player.paused) return;
    player.volume = 0;
    void player.play().then(
      () => setArmed(true),
      () => setArmed(false),
    );
  }, [audio]);

  const toggle = useCallback(() => {
    setEnabled((current) => {
      const next = !current;
      if (next) {
        const player = audio();
        void player.play().then(
          () => setArmed(true),
          () => setArmed(false),
        );
      }
      return next;
    });
  }, [audio]);

  useEffect(() => {
    const player = audioRef.current;
    if (!player || !armed) return;
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    const target = shouldPlay && enabled ? MUSIC_VOLUME : 0;
    const fade = () => {
      const difference = target - player.volume;
      if (Math.abs(difference) < 0.004) {
        player.volume = target;
        animationRef.current = null;
        return;
      }
      player.volume = Math.max(0, Math.min(1, player.volume + difference * 0.12));
      animationRef.current = requestAnimationFrame(fade);
    };
    if (target > 0 && player.paused) void player.play();
    animationRef.current = requestAnimationFrame(fade);
    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    };
  }, [armed, enabled, shouldPlay]);

  useEffect(() => () => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  return { enabled, arm, toggle } as const;
}
