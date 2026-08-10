"use client";

import { useEffect, useState } from "react";

export function useCountUp(end: number, duration = 800, start = 0) {
  const [value, setValue] = useState(start);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    if (hasAnimated) return;
    setHasAnimated(true);

    const startTime = performance.now();
    const diff = end - start;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(start + diff * eased));
      if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }, [end, duration, start, hasAnimated]);

  return value;
}
