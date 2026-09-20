"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { OrderListItem, apiFetch, formatMoney, statusBadgeClass } from "@/lib/api";

export default function OverdueOrdersPage() {
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setItems(await apiFetch<OrderListItem[]>("/api/orders?delivery=overdue"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-red-700">Geciken İşler</h2>
          <p className="text-xs text-baykus-muted">Teslim tarihi geçmiş açık siparişler</p>
        </div>
        <div className="rounded bg-red-50 text-red-800 px-3 py-1.5 text-sm font-bold tabular-nums">
          {items.length} geciken
        </div>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Sipariş</th><th>Müşteri</th><th>Teslim tarihi</th><th>Durum</th><th className="text-right">Kalan</th>
            </tr>
          </thead>
          <tbody>
            {items.map((o) => (
              <tr key={o.id} className="bg-red-50/40">
                <td><Link href={`/orders/${o.id}`} className="text-baykus-primary hover:underline font-medium">{o.order_number}</Link></td>
                <td>{o.customer_name || "—"}</td>
                <td className="text-xs font-semibold text-red-700">{o.delivery_date || o.due_date || "—"}</td>
                <td><span className={`inline-block rounded px-2 py-0.5 text-[11px] ${statusBadgeClass(o.status)}`}>{o.status}</span></td>
                <td className="text-right tabular-nums">{formatMoney(Number(o.remaining_amount ?? 0))}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={5} className="text-center text-baykus-muted py-8">Geciken iş yok 🎉</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
