"use client";

// The running clock in the focus graphic (spec 45): counts down one second at a time and starts
// again at the end. With "reduce motion" it stands still.
import { useEffect, useState } from "react";

export function Ticker({ from }: { from: number }) {
  const [left, setLeft] = useState(from);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setLeft((seconds) => (seconds > 1 ? seconds - 1 : from)), 1000);
    return () => window.clearInterval(id);
  }, [from]);

  return <>{`${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}</>;
}
