"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * True only for components mounted after hydration (client navigations, streamed-in content
 * swapped by React). Server-rendered HTML that is merely hydrating returns false, so numbers
 * already on screen never jump back to zero.
 */
function useMountedAfterHydration() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Counts the leading number of a display string up from zero ("73,410", "74%", "141.3", "12-8"
 * counts only the 12). Formatting (separators, decimals, suffix) is preserved.
 */
export function CountUp({ value, duration = 900 }: { value: string; duration?: number }) {
  const animate = useMountedAfterHydration();
  const m = /^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/.exec(value);
  const target = m ? Number(m[2].replace(/,/g, "")) : NaN;
  const decimals = m && m[2].includes(".") ? m[2].split(".")[1].length : 0;
  const grouped = !!m && m[2].includes(",");
  const [shown, setShown] = useState<number | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!animate || started.current || !Number.isFinite(target) || reducedMotion()) return;
    started.current = true;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - (1 - p) ** 4;
      setShown(p >= 1 ? null : target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate, target, duration]);

  if (!m || shown == null) return <>{value}</>;
  const num = shown.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouped });
  return (
    <>
      {m[1]}
      {num}
      {m[3]}
    </>
  );
}
