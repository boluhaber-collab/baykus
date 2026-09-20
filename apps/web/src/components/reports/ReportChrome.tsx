"use client";

import Link from "next/link";
import { ReactNode } from "react";

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
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6 print:mb-3">
      <div>
        <div className="text-xs text-slate-500 mb-1">
          <Link href="/reports" className="hover:underline text-baykus-600">
            Raporlar
          </Link>
          <span className="mx-1">/</span>
          <span>{title}</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-slate-500 text-sm mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap gap-2 print:hidden">{actions}</div>
    </div>
  );
}

export function SummaryCards({
  items,
}: {
  items: { label: string; value: ReactNode; accent?: string }[];
}) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {items.map((it) => (
        <div
          key={it.label}
          className={`rounded-xl border bg-white p-4 shadow-sm ${it.accent || "border-slate-200"}`}
        >
          <div className="text-xs text-slate-500">{it.label}</div>
          <div className="text-xl font-bold tabular-nums mt-1 text-slate-900">{it.value}</div>
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
}: {
  headers: string[];
  children: ReactNode;
  empty?: boolean;
  colSpan: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-slate-600">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {children}
          {empty && (
            <tr>
              <td colSpan={colSpan} className="px-4 py-8 text-center text-slate-400">
                Kayıt yok
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
