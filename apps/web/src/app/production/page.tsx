"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ORDER_STATUSES,
  OrderListItem,
  apiFetch,
  formatMoney,
  statusBadgeClass,
} from "@/lib/api";

const OPEN = ORDER_STATUSES.filter((s) => s !== "Teslim Edildi" && s !== "Sipariş İptali");

export default function ProductionHubPage() {
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await apiFetch<OrderListItem[]>("/api/orders");
      setItems(data.filter((o) => OPEN.includes(o.status as (typeof OPEN)[number])));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byStatus = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of OPEN) map[s] = 0;
    for (const o of items) map[o.status] = (map[o.status] || 0) + 1;
    return map;
  }, [items]);

  const filtered = status ? items.filter((o) => o.status === status) : items;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Üretim / Atölye</h2>
          <p className="text-xs text-baykus-muted">Kanban + açık siparişler durumuna göre</p>
        </div>
        <div className="flex gap-2">
          <Link href="/orders/kanban" className="bk-btn bk-btn-primary text-xs">
            Kanban paneli
          </Link>
          <button type="button" onClick={load} className="bk-btn bk-btn-ghost text-xs">
            Yenile
          </button>
        </div>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="flex flex-wrap gap-2">
        {OPEN.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(status === s ? "" : s)}
            className={`rounded px-2.5 py-1.5 text-xs font-medium border ${
              status === s ? "border-baykus-primary ring-1 ring-baykus-primary" : "border-transparent"
            } ${statusBadgeClass(s)}`}
          >
            {s}: {byStatus[s] || 0}
          </button>
        ))}
      </div>

      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Sipariş No</th>
              <th>Müşteri</th>
              <th>Durum</th>
              <th>Kanal</th>
              <th>Tasarım</th>
              <th className="text-right">Tutar</th>
              <th>Teslim</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link href={`/orders/${o.id}`} className="text-baykus-primary hover:underline font-medium">
                    {o.order_number}
                  </Link>
                </td>
                <td>{o.customer_name || "—"}</td>
                <td>
                  <span className={`inline-block rounded px-2 py-0.5 text-[11px] ${statusBadgeClass(o.status)}`}>
                    {o.status}
                  </span>
                </td>
                <td>{o.channel || "—"}</td>
                <td>{o.design_status || "—"}</td>
                <td className="text-right tabular-nums">{formatMoney(Number(o.total_amount))}</td>
                <td className="text-xs">
                  {o.due_date ? new Date(o.due_date).toLocaleDateString("tr-TR") : "—"}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-baykus-muted py-8">
                  Açık sipariş yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
