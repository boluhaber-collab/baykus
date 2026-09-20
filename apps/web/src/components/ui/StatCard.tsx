"use client";

import Link from "next/link";
import { ReactNode } from "react";

export default function StatCard({
  label,
  value,
  hint,
  href,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  tone?: "default" | "primary" | "success" | "warn" | "danger" | "info";
}) {
  const tones: Record<string, string> = {
    default: "border-baykus-line bg-white",
    primary: "border-blue-200 bg-blue-50",
    success: "border-emerald-200 bg-emerald-50",
    warn: "border-amber-200 bg-amber-50",
    danger: "border-red-200 bg-red-50",
    info: "border-sky-200 bg-sky-50",
  };
  const body = (
    <div className={`rounded-xl border px-4 py-3 shadow-sm transition hover:shadow-md ${tones[tone]}`}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-baykus-muted">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-baykus-text leading-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-baykus-muted">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
