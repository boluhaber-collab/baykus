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

/** Compact inline action (legacy) */
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
      className="inline-flex items-center justify-center rounded px-3 py-2.5 text-xs font-bold text-white shadow-sm hover:brightness-110 transition"
      style={{ backgroundColor: color }}
    >
      {label}
    </Link>
  );
}

/**
 * Masaüstü modern_button satırı — büyük renkli modül düğmeleri (İşlemler).
 */
export function HubActionsBar({
  title = "İşlemler",
  actions,
  columns = 4,
}: {
  title?: string;
  actions: { href: string; label: string; color: string }[];
  columns?: number;
}) {
  const colClass =
    columns <= 1
      ? "grid-cols-1 max-w-md"
      : columns >= 6
        ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
        : columns === 5
          ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
          : "grid-cols-2 sm:grid-cols-4";
  return (
    <fieldset className="rounded-lg border border-baykus-line bg-white px-3 py-3">
      <legend className="px-1 text-xs font-bold text-baykus-text">{title}</legend>
      <div className={`grid gap-2 ${colClass}`}>
        {actions.map((a) => (
          <Link
            key={a.href + a.label}
            href={a.href}
            className="flex min-h-[48px] items-center justify-center rounded-md px-3 py-3 text-center text-sm font-bold text-white shadow-sm hover:brightness-110 transition leading-tight"
            style={{ backgroundColor: a.color }}
          >
            {a.label}
          </Link>
        ))}
      </div>
    </fieldset>
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
  onRefresh,
}: {
  title?: string;
  children: ReactNode;
  onRefresh?: () => void;
}) {
  return (
    <div className="space-y-3">
      {(title || onRefresh) && (
        <div className="flex items-center justify-between gap-2">
          {title && <h1 className="text-lg font-bold text-baykus-text">{title}</h1>}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="rounded bg-slate-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-500"
            >
              Yenile
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
