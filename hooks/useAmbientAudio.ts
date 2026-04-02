"use client";

import { useCallback, useRef, useEffect } from "react";
import { getZoneIdForCoordinate, getZoneAudioFile } from "@/lib/ambient-audio";

const TARGET_VOLUME = 0.3;
const FADE_DURATION = 1500;
const FADE_STEP = 50;

export function useAmbientAudio(enabled: boolean) {
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentZoneRef = useRef<string | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearFadeTimer = useCallback(() => {
    if (fadeTimerRef.current) {
      clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
  }, []);

  const fadeOut = useCallback(
    (audio: HTMLAudioElement, onDone?: () => void) => {
      const steps = FADE_DURATION / FADE_STEP;
      const decrement = audio.volume / steps;

      let remaining = steps;
      const timer = setInterval(() => {
        remaining--;
        audio.volume = Math.max(0, audio.volume - decrement);
        if (remaining <= 0) {
          clearInterval(timer);
          audio.pause();
          audio.volume = 0;
          onDone?.();
        }
      }, FADE_STEP);

      return timer;
    },
    []
  );

  const fadeIn = useCallback((audio: HTMLAudioElement) => {
    audio.volume = 0;
    audio.play().catch(() => {});

    const steps = FADE_DURATION / FADE_STEP;
    const increment = TARGET_VOLUME / steps;

    let remaining = steps;
    fadeTimerRef.current = setInterval(() => {
      remaining--;
      audio.volume = Math.min(TARGET_VOLUME, audio.volume + increment);
      if (remaining <= 0) {
        clearInterval(fadeTimerRef.current!);
        fadeTimerRef.current = null;
      }
    }, FADE_STEP);
  }, []);

  const triggerForCoordinate = useCallback(
    (lat: number, lng: number, stateId: string | null) => {
      if (!enabled) return;

      const zoneId = getZoneIdForCoordinate(lat, lng, stateId);
      if (zoneId === currentZoneRef.current) return;

      const audioFile = getZoneAudioFile(zoneId);
      if (!audioFile) return;

      clearFadeTimer();

      const oldAudio = currentAudioRef.current;
      if (oldAudio) {
        fadeOut(oldAudio);
      }

      const newAudio = new Audio(audioFile);
      newAudio.loop = true;
      newAudio.volume = 0;
      newAudio.preload = "auto";

      newAudio.addEventListener("canplaythrough", () => {
        fadeIn(newAudio);
      }, { once: true });

      newAudio.addEventListener("error", () => {
        // Graceful degradation: no audio file, no playback
      }, { once: true });

      currentAudioRef.current = newAudio;
      currentZoneRef.current = zoneId;
    },
    [enabled, clearFadeTimer, fadeOut, fadeIn]
  );

  const stopAmbient = useCallback(() => {
    clearFadeTimer();
    if (currentAudioRef.current) {
      fadeOut(currentAudioRef.current, () => {
        currentAudioRef.current = null;
        currentZoneRef.current = null;
      });
    }
  }, [clearFadeTimer, fadeOut]);

  useEffect(() => {
    if (!enabled) {
      stopAmbient();
    }
  }, [enabled, stopAmbient]);

  useEffect(() => {
    return () => {
      clearFadeTimer();
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
    };
  }, [clearFadeTimer]);

  return {
    triggerForCoordinate,
    stopAmbient,
    currentZoneId: currentZoneRef.current,
  };
}
