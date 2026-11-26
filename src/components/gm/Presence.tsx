"use client";
import { useEffect, useState, type ReactNode } from "react";

/** true while `open`, and for `ms` after it closes, so things can animate OUT before unmounting */
export function useMounted(open: boolean, ms: number) {
  const [m, setM] = useState(open);
  useEffect(() => { if (open) { setM(true); return; } const t = setTimeout(() => setM(false), ms); return () => clearTimeout(t); }, [open, ms]);
  return m || open;
}

export function Presence({ open, ms = 200, children }: { open: boolean; ms?: number; children: (closing: boolean) => ReactNode }) {
  const mounted = useMounted(open, ms);
  return mounted ? <>{children(!open)}</> : null;
}
