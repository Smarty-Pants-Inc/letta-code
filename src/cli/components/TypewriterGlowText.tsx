import { useEffect, useMemo, useRef, useState } from "react";
import { useAnimation } from "../contexts/AnimationContext.js";
import { useTokenStreamingConfig } from "../contexts/StreamingTextContext";
import { colors } from "./colors.js";
import { Text } from "./Text";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Streaming-only renderer.
 * - Reveals text at a controlled speed (typewriter).
 * - Highlights the newest trailing characters and fades them back to normal.
 *
 * Notes:
 * - This intentionally does NOT run markdown rendering while streaming.
 *   Markdown parsing + per-letter highlighting is expensive and brittle for
 *   incomplete markdown sequences.
 */
export function TypewriterGlowText({
  text,
  dimColor,
}: {
  text: string;
  dimColor?: boolean;
}) {
  const { shouldAnimate } = useAnimation();
  const cfg = useTokenStreamingConfig();

  // If animations are disabled (overflow/flicker guard), render immediately.
  const target = text ?? "";
  const immediate =
    !cfg.enabled || cfg.style !== "typewriter-glow" || !shouldAnimate;

  const [visibleLen, setVisibleLen] = useState(() => target.length);
  const [fadePhase, setFadePhase] = useState<0 | 1 | 2>(2);
  const fadeTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const revealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickAtRef = useRef<number>(performance.now());

  // Keep visibleLen in bounds when target changes (e.g. normalization changes).
  useEffect(() => {
    if (immediate) {
      setVisibleLen(target.length);
      return;
    }
    setVisibleLen((prev) => clamp(prev, 0, target.length));
  }, [target.length, immediate]);

  // Reveal loop.
  useEffect(() => {
    if (immediate) {
      if (revealTimerRef.current) {
        clearInterval(revealTimerRef.current);
        revealTimerRef.current = null;
      }
      return;
    }

    if (visibleLen >= target.length) {
      if (revealTimerRef.current) {
        clearInterval(revealTimerRef.current);
        revealTimerRef.current = null;
      }
      return;
    }

    const intervalMs = clamp(cfg.refreshIntervalMs, 16, 250);
    const cps = clamp(cfg.typewriterCharsPerSecond, 60, 2000);
    lastTickAtRef.current = performance.now();

    if (revealTimerRef.current) {
      clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    }

    revealTimerRef.current = setInterval(() => {
      const now = performance.now();
      const dtMs = Math.max(0, now - lastTickAtRef.current);
      lastTickAtRef.current = now;

      // Convert elapsed time into chars to reveal.
      const add = Math.max(1, Math.floor((cps * dtMs) / 1000));
      setVisibleLen((prev) => {
        const next = clamp(prev + add, 0, target.length);
        return next;
      });
    }, intervalMs);

    return () => {
      if (revealTimerRef.current) {
        clearInterval(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };
  }, [
    cfg.refreshIntervalMs,
    cfg.typewriterCharsPerSecond,
    immediate,
    target.length,
    visibleLen,
  ]);

  // Glow fade: when new characters appear, briefly highlight the tail.
  useEffect(() => {
    if (immediate) return;

    // Clear old timers.
    for (const t of fadeTimersRef.current) clearTimeout(t);
    fadeTimersRef.current = [];

    // If nothing is visible yet, skip.
    if (visibleLen === 0) {
      setFadePhase(2);
      return;
    }

    // Reset to bright and fade down.
    setFadePhase(0);
    const total = clamp(cfg.glowFadeMs, 80, 2000);
    const t1 = setTimeout(() => setFadePhase(1), Math.floor(total * 0.35));
    const t2 = setTimeout(() => setFadePhase(2), total);
    fadeTimersRef.current = [t1, t2];

    return () => {
      for (const t of fadeTimersRef.current) clearTimeout(t);
      fadeTimersRef.current = [];
    };
  }, [cfg.glowFadeMs, immediate, visibleLen]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (revealTimerRef.current) clearInterval(revealTimerRef.current);
      for (const t of fadeTimersRef.current) clearTimeout(t);
      fadeTimersRef.current = [];
    };
  }, []);

  const displayText = useMemo(() => {
    if (immediate) return target;
    return target.slice(0, clamp(visibleLen, 0, target.length));
  }, [immediate, target, visibleLen]);

  const glowColor = useMemo(() => {
    if (fadePhase === 0) return colors.status.processingShimmer;
    if (fadePhase === 1) return colors.status.processing;
    return undefined;
  }, [fadePhase]);

  const glowChars = clamp(cfg.glowChars, 0, 200);
  const glowStart = Math.max(0, displayText.length - glowChars);
  const prefix = displayText.slice(0, glowStart);
  const tail = displayText.slice(glowStart);

  return (
    <Text dimColor={dimColor} wrap="wrap">
      {prefix}
      {tail ? (
        <Text dimColor={dimColor} color={glowColor}>
          {tail}
        </Text>
      ) : null}
    </Text>
  );
}
