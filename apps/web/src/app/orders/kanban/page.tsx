"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ORDER_STATUSES,
  KanbanBoard,
  apiFetch,
  formatMoney,
  statusBadgeClass,
} from "@/lib/api";

export default function OrdersKanbanPage() {
  const [board, setBoard] = useState<KanbanBoard | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await apiFetch<KanbanBoard>("/api/orders/kanban");
      setBoard(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function moveCard(orderId: number, status: string) {
    setBusyId(orderId);
    setError("");
    try {
      await apiFetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, note: "Kanban taşıma" }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Durum güncellenemedi");
    } finally {
      setBusyId(null);
    }
  }

  const columns =
    board?.columns ??
    ORDER_STATUSES.map((s) => ({ key: s, label: s, items: [] as KanbanBoard["columns"][0]["items"] }));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Kanban</h1>
          <p className="text-slate-500 text-sm">
            Masaüstü Baykuş durumları — karttan durum değiştirerek taşıyın
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Yenile
          </button>
          <Link
            href="/orders"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Liste
          </Link>
          <Link
            href="/orders/new"
            className="rounded-lg bg-baykus-600 text-white px-4 py-2 text-sm font-medium"
          >
            + Yeni
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-4 items-start">
        {columns.map((col) => (
          <div key={col.key} className="w-64 shrink-0 rounded-xl bg-slate-100 p-3 min-h-[280px]">
            <div className="font-semibold text-sm mb-3 text-slate-700 flex items-center justify-between gap-2">
              <span className="leading-tight">{col.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadgeClass(col.key)}`}
              >
                {col.items.length}
              </span>
            </div>
            <div className="space-y-2">
              {col.items.map((item) => (
                <div key={item.id} className="rounded-lg bg-white p-3 shadow-sm text-sm space-y-2">
                  <Link
                    href={`/orders/${item.id}`}
                    className="font-medium text-baykus-700 hover:underline"
                  >
                    {item.order_number}
                  </Link>
                  <div className="text-xs text-slate-500">{item.customer_name || "Müşteri yok"}</div>
                  <div className="text-xs text-slate-600">
                    {formatMoney(item.total_amount)}
                    {item.remaining_amount > 0 && (
                      <span className="text-amber-700">
                        {" "}
                        · kalan {formatMoney(item.remaining_amount)}
                      </span>
                    )}
                  </div>
                  {item.due_date && (
                    <div className="text-[10px] text-slate-400">
                      Teslim: {String(item.due_date).slice(0, 10)}
                    </div>
                  )}
                  <select
                    disabled={busyId === item.id}
                    value={item.status}
                    onChange={(e) => moveCard(item.id, e.target.value)}
                    className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs bg-slate-50"
                  >
                    {ORDER_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              {col.items.length === 0 && (
                <div className="text-xs text-slate-400 px-1 py-4 text-center border border-dashed border-slate-200 rounded-lg">
                  Boş
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
