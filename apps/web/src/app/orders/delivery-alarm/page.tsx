"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OrderListItem, apiFetch, formatMoney, statusBadgeClass } from "@/lib/api";

export default function DeliveryAlarmPage() {
  const [today, setToday] = useState<OrderListItem[]>([]);
  const [upcoming, setUpcoming] = useState<OrderListItem[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [t, u] = await Promise.all([
        apiFetch<OrderListItem[]>("/api/orders?delivery=today"),
        apiFetch<OrderListItem[]>("/api/orders?delivery=upcoming"),
      ]);
      setToday(t);
      setUpcoming(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const widgets = useMemo(() => [
    { label: "Bugün Teslim", count: today.length, color: "#be123c" },
    { label: "Yaklaşan (7 gün)", count: upcoming.length, color: "#f59e0b" },
  ], [today, upcoming]);

  function Table({ items }: { items: OrderListItem[] }) {
    return (
      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Sipariş</th><th>Müşteri</th><th>Teslim</th><th>Durum</th><th className="text-right">Tutar</th>
            </tr>
          </thead>
          <tbody>
            {items.map((o) => (
              <tr key={o.id}>
                <td><Link href={`/orders/${o.id}`} className="text-baykus-primary hover:underline font-medium">{o.order_number}</Link></td>
                <td>{o.customer_name || "—"}</td>
                <td className="text-xs">{o.delivery_date || o.due_date || "—"}</td>
                <td><span className={`inline-block rounded px-2 py-0.5 text-[11px] ${statusBadgeClass(o.status)}`}>{o.status}</span></td>
                <td className="text-right tabular-nums">{formatMoney(Number(o.total_amount))}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={5} className="text-center text-baykus-muted py-6">Kayıt yok</td></tr>}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Teslim Alarmı</h2>
          <p className="text-xs text-baykus-muted">Bugün ve yaklaşan teslimatlar · masaüstü uyarı paneli</p>
        </div>
        <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={load}>Yenile</button>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      <div className="grid sm:grid-cols-2 gap-3">
        {widgets.map((w) => (
          <div key={w.label} className="rounded-lg border bg-white p-4" style={{ borderColor: w.color }}>
            <div className="text-xs font-semibold" style={{ color: w.color }}>{w.label}</div>
            <div className="text-3xl font-bold tabular-nums mt-1">{w.count}</div>
          </div>
        ))}
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-2">Bugün teslim edilecekler</h3>
        <Table items={today} />
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-2">Yaklaşan teslimatlar (7 gün)</h3>
        <Table items={upcoming} />
      </div>
    </div>
  );
}
