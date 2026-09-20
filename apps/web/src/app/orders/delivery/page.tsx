"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { OrderListItem, apiFetch, formatMoney, statusBadgeClass } from "@/lib/api";

type Filter = "today" | "overdue" | "due" | "upcoming";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "today", label: "Bugün" },
  { id: "overdue", label: "Geciken" },
  { id: "due", label: "Bekleyen" },
  { id: "upcoming", label: "7 gün" },
];

export default function DeliveryTrackingPage() {
  const [filter, setFilter] = useState<Filter>("today");
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setItems(await apiFetch<OrderListItem[]>(`/api/orders?delivery=${filter}&limit=200`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-bold">Teslim Takibi</h2>
        <p className="text-xs text-baykus-muted">delivery_date / due_date filtreleri</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded px-2.5 py-1.5 text-xs font-medium border ${
              filter === f.id ? "border-baykus-primary bg-baykus-primary/10" : "border-slate-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Sipariş</th>
              <th>Müşteri</th>
              <th>Durum</th>
              <th className="text-right">Tutar</th>
              <th>Teslim</th>
            </tr>
          </thead>
          <tbody>
            {items.map((o) => {
              const d = o.delivery_date || o.due_date;
              return (
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
                  <td className="text-right tabular-nums">{formatMoney(Number(o.total_amount))}</td>
                  <td className="text-xs">{d ? new Date(d).toLocaleDateString("tr-TR") : "—"}</td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-baykus-muted py-8">
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
