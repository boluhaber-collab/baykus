"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  OrderListItem,
  apiFetch,
  downloadPdf,
  formatMoney,
  orderRowTag,
  orderRowTagClass,
  statusBadgeClass,
} from "@/lib/api";

export default function OverdueOrdersPage() {
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      setItems(await apiFetch<OrderListItem[]>("/api/orders?delivery=overdue"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((o) =>
      [o.order_number, o.customer_name, o.status].join(" ").toLowerCase().includes(needle),
    );
  }, [items, q]);

  const remainingTotal = filtered.reduce((s, o) => s + Number(o.remaining_amount || 0), 0);

  function daysLate(o: OrderListItem): number | null {
    const d = o.due_date || o.delivery_date;
    if (!d) return null;
    const due = new Date(d);
    const diff = Math.floor((Date.now() - due.getTime()) / 86400000);
    return diff > 0 ? diff : 0;
  }

  async function pdf(o: OrderListItem) {
    setBusy(o.id);
    try {
      await downloadPdf(`/api/orders/${o.id}/work-order-pdf`, `${o.order_number}-is-emri.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF hatası");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-red-700">Geciken İşler</h2>
          <p className="text-xs text-baykus-muted">Üretim › Geciken İşler · teslim tarihi geçmiş açık siparişler</p>
        </div>
        <div className="flex gap-2">
          <Link href="/orders/delivery-alarm" className="bk-btn bk-btn-ghost text-xs">
            Teslim alarmı
          </Link>
          <Link href="/production" className="bk-btn bk-btn-ghost text-xs">
            Atölye
          </Link>
          <button type="button" className="bk-btn bk-btn-primary text-xs" onClick={load}>
            Yenile
          </button>
        </div>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="grid sm:grid-cols-3 gap-2">
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2">
          <div className="text-[11px] text-red-800">Geciken sipariş</div>
          <div className="text-2xl font-bold text-red-900">{filtered.length}</div>
        </div>
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2">
          <div className="text-[11px] text-amber-800">Kalan tahsilat</div>
          <div className="text-xl font-bold text-amber-900 tabular-nums">{formatMoney(remainingTotal)}</div>
        </div>
        <div className="rounded border bg-white px-3 py-2 flex items-end">
          <input className="bk-input" placeholder="Ara…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Sipariş</th>
              <th>Müşteri</th>
              <th>Teslim tarihi</th>
              <th>Gecikme</th>
              <th>Durum</th>
              <th className="text-right">Tutar</th>
              <th className="text-right">Kalan</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => {
              const late = daysLate(o);
              return (
                <tr key={o.id} className={orderRowTagClass(orderRowTag(o)) || "bg-red-50"}>
                  <td>
                    <Link href={`/orders/${o.id}`} className="text-baykus-primary hover:underline font-medium">
                      {o.order_number}
                    </Link>
                  </td>
                  <td>{o.customer_name || "—"}</td>
                  <td className="text-xs font-semibold text-red-800">{o.due_date || o.delivery_date || "—"}</td>
                  <td>
                    {late != null ? (
                      <span className="rounded bg-red-100 text-red-800 px-1.5 py-0.5 text-[11px] font-bold">
                        {late} gün
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <span className={`inline-block rounded px-2 py-0.5 text-[11px] ${statusBadgeClass(o.status)}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="text-right tabular-nums">{formatMoney(Number(o.total_amount))}</td>
                  <td className="text-right tabular-nums text-amber-700">
                    {formatMoney(Number(o.remaining_amount))}
                  </td>
                  <td className="text-right text-xs space-x-2 whitespace-nowrap">
                    <Link href={`/orders/${o.id}`} className="text-baykus-primary hover:underline">
                      Aç
                    </Link>
                    <button
                      type="button"
                      className="text-violet-700 hover:underline disabled:opacity-50"
                      disabled={busy === o.id}
                      onClick={() => pdf(o)}
                    >
                      PDF
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-baykus-muted py-8">
                  Geciken iş yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
