"use client";

import Link from "next/link";
import { ReactNode } from "react";

export function HubSummaryCard({
  label,
  value,
  color,
  href,
}: {
  label: string;
  value: ReactNode;
  color: string;
  href?: string;
}) {
  const body = (
    <div
      className="rounded-lg px-3 py-3 text-white shadow-sm min-h-[76px] flex flex-col justify-center"
      style={{ backgroundColor: color }}
    >
      <div className="text-[11px] font-semibold opacity-90 uppercase tracking-wide">{label}</div>
      <div className="text-xl font-bold tabular-nums mt-0.5 leading-tight">{value}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function HubActionButton({
  href,
  label,
  color = "#1e293b",
}: {
  href: string;
  label: string;
  color?: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded px-3 py-2 text-xs font-bold text-white shadow-sm hover:opacity-95"
      style={{ backgroundColor: color }}
    >
      {label}
    </Link>
  );
}

export function HubTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-baykus-line mb-3">
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition ${
              on
                ? "border-baykus-primary text-baykus-primary"
                : "border-transparent text-baykus-muted hover:text-baykus-text"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function HubSection({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      {title && <h1 className="text-lg font-bold text-baykus-text">{title}</h1>}
      {children}
    </div>
  );
}
