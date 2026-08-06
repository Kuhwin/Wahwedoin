"use client";

import { useEffect, useState } from "react";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function formatCountdown(targetMs: number, nowMs: number): string {
  const diff = targetMs - nowMs;
  if (diff <= 0) return "Now";
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${pad(hours)}h ${pad(minutes)}m`;
  if (hours > 0) return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
  if (minutes > 0) return `${minutes}m ${pad(seconds)}s`;
  return `${seconds}s`;
}

export default function CountdownTimer({
  target,
  end,
  className,
  onComplete,
}: {
  target: string | number;
  end?: string | number | null;
  className?: string;
  onComplete?: () => void;
}) {
  const targetMs = new Date(target).getTime();
  const endMs = end ? new Date(end).getTime() : null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      const next = Date.now();
      setNow(next);
      if (endMs ? next >= endMs : next >= targetMs) {
        clearInterval(interval);
        onComplete?.();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [targetMs, endMs, onComplete]);

  if (now < targetMs) {
    return <span className={className}>{formatCountdown(targetMs, now)}</span>;
  }
  if (endMs && now < endMs) return <span className={className}>Now</span>;
  return null;
}
