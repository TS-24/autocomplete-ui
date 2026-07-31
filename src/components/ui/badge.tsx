import type { ReactNode } from "react";

type Tone = "default" | "ok" | "warn" | "danger" | "accent";

const TONES: Record<Tone, string> = {
  default: "bg-zinc-800 text-zinc-300",
  ok: "bg-emerald-500/10 text-emerald-400",
  warn: "bg-amber-500/10 text-amber-400",
  danger: "bg-rose-500/10 text-rose-400",
  accent: "bg-indigo-500/10 text-indigo-300",
};

export function Badge({
  tone = "default",
  children,
  className = "",
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
