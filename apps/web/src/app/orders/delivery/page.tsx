"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OrderListItem, apiFetch, formatMoney, statusBadgeClass } from "@/lib/api";

type Filter = "today" | "overdue" | "due" | "upcoming";

const FILTERS: { id: Filter; label: string; color: string }[] = [
  { id: "today", label: "Bugün", color: "#198754" },
  { id: "overdue", label: "Geciken", color: "#dc2626" },
  { id: "due", label: "Bekleyen", color: "#f59e0b" },
  { id: "upcoming", label: "7 gün", color: "#0f766e" },
];

export default function DeliveryTrackingPage() {
  const [filter, setFilter] = useState<Filter>("today");
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [counts, setCounts] = useState<Record<Filter, number>>({
    today: 0,
    overdue: 0,
    due: 0,
    upcoming: 0,
  });
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [cur, today, overdue, due, upcoming] = await Promise.all([
        apiFetch<OrderListItem[]>(`/api/orders?delivery=${filter}&limit=200`),
        apiFetch<OrderListItem[]>(`/api/orders?delivery=today&limit=200`).catch(() => []),
        apiFetch<OrderListItem[]>(`/api/orders?delivery=overdue&limit=200`).catch(() => []),
        apiFetch<OrderListItem[]>(`/api/orders?delivery=due&limit=200`).catch(() => []),
        apiFetch<OrderListItem[]>(`/api/orders?delivery=upcoming&limit=200`).catch(() => []),
      ]);
      setItems(cur);
      setCounts({
        today: today.length,
        overdue: overdue.length,
        due: due.length,
        upcoming: upcoming.length,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr");
    if (!needle) return items;
    return items.filter((o) =>
      [o.order_number, o.customer_name, o.status, o.customer_phone]
        .join(" ")
        .toLocaleLowerCase("tr")
        .includes(needle),
    );
  }, [items, q]);

  const total = filtered.reduce((s, o) => s + Number(o.total_amount || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Teslim Takibi</h2>
          <p className="text-xs text-baykus-muted">
            Satış / Sipariş › Sipariş Merkezi › Teslim Takibi · delivery_date / due_date
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/orders/weekly-plan" className="bk-btn text-xs text-white" style={{ background: "#f59e0b" }}>
            📅 Haftalık Plan
          </Link>
          <Link href="/orders/delivery-alarm" className="bk-btn text-xs text-white" style={{ background: "#be123c" }}>
            Teslim Alarmı
          </Link>
          <Link href="/orders/kanban" className="bk-btn text-xs text-white" style={{ background: "#334155" }}>
            Yaşam Çizgisi
          </Link>
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={load}>
            Yenile
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-4 gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded border px-3 py-2 text-left ${filter === f.id ? "ring-2 ring-offset-1" : ""}`}
            style={{ borderColor: f.color, background: filter === f.id ? `${f.color}18` : "#fff" }}
          >
            <div className="text-[11px] font-semibold" style={{ color: f.color }}>
              {f.label}
            </div>
            <div className="text-xl font-bold tabular-nums">{counts[f.id]}</div>
          </button>
        ))}
      </div>

      <div className="bk-filter-bar">
        <input
          className="bk-input min-w-[200px]"
          placeholder="Ara (sipariş, müşteri…)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="text-xs text-baykus-muted ml-auto">
          Listelenen: {filtered.length} · Toplam: <strong className="tabular-nums">{formatMoney(total)}</strong>
        </span>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Sipariş</th>
              <th>Müşteri</th>
              <th>Telefon</th>
              <th>Durum</th>
              <th className="text-right">Tutar</th>
              <th>Teslim</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => {
              const d = o.delivery_date || o.due_date;
              return (
                <tr key={o.id} className={filter === "overdue" ? "bg-red-50/60" : undefined}>
                  <td>
                    <Link href={`/orders/${o.id}`} className="text-baykus-primary hover:underline font-medium">
                      {o.order_number}
                    </Link>
                  </td>
                  <td>{o.customer_name || "—"}</td>
                  <td className="text-xs">{o.customer_phone || "—"}</td>
                  <td>
                    <span className={`inline-block rounded px-2 py-0.5 text-[11px] ${statusBadgeClass(o.status)}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="text-right tabular-nums">{formatMoney(Number(o.total_amount))}</td>
                  <td className="text-xs">{d ? new Date(d).toLocaleDateString("tr-TR") : "—"}</td>
                  <td className="text-xs whitespace-nowrap">
                    <Link href={`/orders/${o.id}/timeline`} className="text-baykus-primary hover:underline mr-2">
                      Yaşam
                    </Link>
                    <Link href="/whatsapp/track" className="text-emerald-700 hover:underline">
                      WA
                    </Link>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-baykus-muted py-8">
                  Bu filtrede sipariş yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
