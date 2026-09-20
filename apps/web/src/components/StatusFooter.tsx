"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardSummary, apiFetch } from "@/lib/api";

/** Masaüstü alt durum çubuğu — Teslim Tarihi Alarmı + Yenile + Haftalık Plan */
export default function StatusFooter({
  onRefresh,
}: {
  onRefresh?: () => void;
}) {
  const [ok, setOk] = useState(true);

  const load = useCallback(async () => {
    try {
      const s = await apiFetch<DashboardSummary>("/api/dashboard/summary");
      setOk(
        (s.due_today_count ?? 0) === 0 &&
          (s.due_soon_count ?? 0) === 0 &&
          (s.overdue_deliveries_count ?? 0) === 0,
      );
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded border border-baykus-line bg-white px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2 text-baykus-muted">
        <span className="font-semibold text-red-600">⚠ Teslim Tarihi Alarmı</span>
        <span className={ok ? "text-emerald-600" : "text-amber-600"}>
          {ok ? "✔ Bugün teslim edilecek veya geciken iş yok." : "Teslim takibi gereken açık işler var."}
        </span>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            void load();
            onRefresh?.();
          }}
          className="bk-btn bk-btn-ghost text-xs"
        >
          ↻ Yenile
        </button>
        <Link
          href="/orders/weekly-plan"
          className="bk-btn text-xs font-semibold text-white"
          style={{ backgroundColor: "#f59e0b" }}
        >
          📅 Haftalık Plan
        </Link>
      </div>
    </div>
  );
}
