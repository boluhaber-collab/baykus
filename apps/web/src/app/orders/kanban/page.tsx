"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DESIGN_STATUSES,
  ORDER_CHANNELS,
  ORDER_STATUSES,
  KanbanBoard,
  apiFetch,
  designStatusBadgeClass,
  formatMoney,
  statusBadgeClass,
} from "@/lib/api";
import StatusFooter from "@/components/StatusFooter";
import { formatTrDate } from "@/lib/dates";

const COL_ACCENT: Record<string, string> = {
  "Sipariş Alındı": "#2563eb",
  Hazırlanıyor: "#f59e0b",
  Baskıda: "#7c3aed",
  Hazır: "#198754",
  "Teslim Edildi": "#0f766e",
  "Sipariş İptali": "#dc2626",
};

export default function OrdersKanbanPage() {
  const [board, setBoard] = useState<KanbanBoard | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [channel, setChannel] = useState("");
  const [designStatus, setDesignStatus] = useState("");

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

  const columns = useMemo(() => {
    const raw =
      board?.columns ??
      ORDER_STATUSES.map((s) => ({
        key: s,
        label: s,
        items: [] as KanbanBoard["columns"][0]["items"],
      }));
    return raw.map((col) => ({
      ...col,
      items: col.items.filter((item) => {
        if (channel && item.channel !== channel) return false;
        if (designStatus && item.design_status !== designStatus) return false;
        return true;
      }),
    }));
  }, [board, channel, designStatus]);

  const totalCards = columns.reduce((s, c) => s + c.items.length, 0);

  return (
    <div className="space-y-2 pb-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-baykus-text leading-tight">Sipariş Yaşam Çizgisi</h1>
          <p className="text-[11px] text-baykus-muted">
            Üretim panosu · {totalCards} kart · durum sürükle/seçerek ilerlet
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="bk-input w-auto text-xs"
          >
            <option value="">Tüm kanallar</option>
            {ORDER_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={designStatus}
            onChange={(e) => setDesignStatus(e.target.value)}
            className="bk-input w-auto text-xs"
          >
            <option value="">Tüm tasarım</option>
            {DESIGN_STATUSES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <button type="button" onClick={load} className="bk-btn bk-btn-ghost text-xs">
            ↻ Yenile
          </button>
          <Link href="/orders" className="bk-btn bk-btn-ghost text-xs">
            Liste
          </Link>
          <Link href="/production" className="bk-btn text-xs font-bold text-white" style={{ backgroundColor: "#f59e0b" }}>
            Üretim Akış
          </Link>
          <Link href="/orders/new" className="bk-btn bk-btn-primary text-xs font-bold">
            + Yeni
          </Link>
        </div>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="flex gap-2 overflow-x-auto pb-2 items-stretch">
        {columns.map((col) => {
          const accent = COL_ACCENT[col.key] || "#334155";
          return (
            <div key={col.key} className="bk-kanban-col">
              <div className="bk-kanban-col-head" style={{ borderBottom: `3px solid ${accent}` }}>
                <span className="leading-tight truncate">{col.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusBadgeClass(col.key)}`}
                >
                  {col.items.length}
                </span>
              </div>
              <div className="p-1.5 space-y-1.5 max-h-[70vh] overflow-y-auto">
                {col.items.map((item) => (
                  <div key={item.id} className="bk-kanban-card space-y-1.5">
                    <div className="flex items-start justify-between gap-1">
                      <Link
                        href={`/orders/${item.id}`}
                        className="font-bold text-baykus-primary hover:underline text-[12px]"
                      >
                        {item.order_number}
                      </Link>
                      {item.remaining_amount > 0 && (
                        <span className="text-[9px] font-bold text-amber-700 whitespace-nowrap">borç</span>
                      )}
                    </div>
                    <div className="text-[11px] text-baykus-text truncate">
                      {item.customer_name || "Müşteri yok"}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {item.channel && (
                        <span className="rounded bg-slate-100 text-slate-600 px-1.5 py-0.5 text-[9px] font-medium">
                          {item.channel}
                        </span>
                      )}
                      {item.design_status && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${designStatusBadgeClass(item.design_status)}`}
                        >
                          {item.design_status}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-semibold tabular-nums">
                      {formatMoney(item.total_amount)}
                      {item.remaining_amount > 0 && (
                        <span className="text-amber-700 font-medium">
                          {" "}
                          · kalan {formatMoney(item.remaining_amount)}
                        </span>
                      )}
                    </div>
                    {item.due_date && (
                      <div className="text-[10px] text-baykus-muted">
                        Teslim: {formatTrDate(item.due_date)}
                      </div>
                    )}
                    <select
                      disabled={busyId === item.id}
                      value={item.status}
                      onChange={(e) => moveCard(item.id, e.target.value)}
                      className="w-full rounded border border-baykus-line px-1.5 py-1 text-[11px] bg-slate-50"
                    >
                      {ORDER_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          → {s}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                {col.items.length === 0 && (
                  <div className="text-[11px] text-baykus-muted px-1 py-6 text-center border border-dashed border-baykus-line rounded">
                    Boş kolon
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <StatusFooter onRefresh={load} />
    </div>
  );
}
