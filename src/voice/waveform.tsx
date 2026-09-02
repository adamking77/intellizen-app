import { useEffect, useRef, useState } from "react";

/** Bars, at rest and while sound is arriving.
 *
 *  The one thing in the app allowed to move on its own: a waveform is not
 *  progress, it is the sound itself, and a still one would read as a dropped
 *  connection. The caller passes the colour — the accent for the person, an
 *  agent's identity colour for an agent — this component never decides. */
export function Waveform({
  color,
  height = 22,
  bars = 16,
  /** Amplitudes 0..1, newest last, when a real engine is feeding it. Absent,
   *  the bars idle on their own so the surface is honest about listening
   *  without claiming to have heard anything. */
  levels,
}: {
  color: string;
  height?: number;
  bars?: number;
  levels?: number[];
}) {
  const [tick, setTick] = useState(0);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (levels) return;
    let last = 0;
    const loop = (t: number) => {
      // ~14fps: a texture rather than an animation.
      if (t - last > 70) {
        last = t;
        setTick((n) => n + 1);
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      if (raf.current !== undefined) cancelAnimationFrame(raf.current);
    };
  }, [levels]);

  const amp = (i: number) => {
    if (levels) return levels[i] ?? 0;
    const n = Math.sin(i * 1.7 + tick * 0.55) * Math.cos(i * 0.6 - tick * 0.31);
    return Math.abs(n) * 0.8 + 0.15;
  };

  const min = 3;
  return (
    <div aria-hidden className="flex min-w-0 items-center gap-[3px] overflow-hidden" style={{ height }}>
      {Array.from({ length: bars }, (_, i) => (
        <div
          key={i}
          className="w-[2px] shrink-0 rounded-full transition-[height] duration-[70ms] ease-linear"
          style={{ height: Math.round(min + amp(i) * (height - min)), background: color }}
        />
      ))}
    </div>
  );
}
