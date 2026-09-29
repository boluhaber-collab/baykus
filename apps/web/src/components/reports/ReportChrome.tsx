"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { DateSortDir } from "@/lib/dateSort";
import SortableDateHeader from "@/components/SortableDateHeader";

export function ReportHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="bk-sticky-header flex flex-wrap items-end justify-between gap-3 print:mb-3">
      <div>
        <div className="text-[11px] text-baykus-muted mb-0.5">
          <Link href="/reports" className="hover:underline text-baykus-primary">
            Raporlar
          </Link>
          <span className="mx-1">/</span>
          <span>{title}</span>
        </div>
        <h1 className="text-lg font-bold text-baykus-text leading-tight">{title}</h1>
        {subtitle && <p className="text-baykus-muted text-[11px] mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap gap-2 print:hidden">{actions}</div>
    </div>
  );
}

export function SummaryCards({
  items,
}: {
  items: { label: string; value: ReactNode; accent?: string; color?: string }[];
}) {
  const palette = ["#198754", "#0f766e", "#2563eb", "#7c3aed", "#be123c", "#f59e0b"];
  return (
    <div className="bk-kpi-strip mb-3" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(items.length, 2), 5)}, minmax(0, 1fr))` }}>
      {items.map((it, i) => (
        <div
          key={it.label}
          className="bk-kpi-card"
          style={{ backgroundColor: it.color || palette[i % palette.length] }}
        >
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">{it.label}</div>
            <div className="bk-kpi-value truncate">{it.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Assumptions({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return (
    <details className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600 print:hidden">
      <summary className="cursor-pointer font-medium text-slate-700">Varsayımlar / notlar</summary>
      <ul className="mt-2 list-disc pl-5 space-y-1">
        {items.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
    </details>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-600">
      <span>{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white min-w-[9rem]";

export function ReportTable({
  headers,
  children,
  empty,
  colSpan,
  dateSort,
  dateHeader = "Tarih",
}: {
  headers: string[];
  children: ReactNode;
  empty?: boolean;
  colSpan: number;
  /** When set, the matching date header becomes clickable newest↔oldest. */
  dateSort?: { dir: DateSortDir; onChange: (next: DateSortDir) => void };
  dateHeader?: string;
}) {
  return (
    <div className="bk-table-wrap">
      <table className="bk-table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} className={dateSort && h === dateHeader ? "bk-th-sortable" : undefined}>
                {dateSort && h === dateHeader ? (
                  <SortableDateHeader dir={dateSort.dir} onChange={dateSort.onChange} label={h} />
                ) : (
                  h
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {children}
          {empty && (
            <tr>
              <td colSpan={colSpan} className="text-center text-slate-400 py-8">
                Kayıt yok
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
