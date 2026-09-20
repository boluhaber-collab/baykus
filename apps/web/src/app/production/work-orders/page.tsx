"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ORDER_STATUSES, OrderListItem, apiFetch, downloadPdf, formatMoney, statusBadgeClass } from "@/lib/api";

const OPEN = ORDER_STATUSES.filter((s) => s !== "Teslim Edildi" && s !== "Sipariş İptali");

export default function WorkOrdersPage() {
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await apiFetch<OrderListItem[]>("/api/orders?limit=200");
      setItems(data.filter((o) => OPEN.includes(o.status as (typeof OPEN)[number])));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
          <h2 className="text-base font-bold">İş Emirleri</h2>
          <p className="text-xs text-baykus-muted">Açık siparişler · iş emri PDF indir</p>
        </div>
        <div className="flex gap-2">
          <Link href="/production" className="bk-btn bk-btn-ghost text-xs">
            Atölye
          </Link>
          <Link href="/orders/kanban" className="bk-btn bk-btn-primary text-xs">
            Kanban
          </Link>
        </div>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Sipariş</th>
              <th>Müşteri</th>
              <th>Durum</th>
              <th>Tasarım</th>
              <th className="text-right">Tutar</th>
              <th>Teslim</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((o) => (
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
                <td>{o.design_status || "—"}</td>
                <td className="text-right tabular-nums">{formatMoney(Number(o.total_amount))}</td>
                <td className="text-xs">
                  {(o.delivery_date || o.due_date)
                    ? new Date(o.delivery_date || o.due_date!).toLocaleDateString("tr-TR")
                    : "—"}
                </td>
                <td className="text-right space-x-2 text-xs whitespace-nowrap">
                  <Link href={`/orders/${o.id}/timeline`} className="text-baykus-primary hover:underline">
                    Çizgi
                  </Link>
                  <button
                    type="button"
                    className="text-baykus-primary hover:underline disabled:opacity-50"
                    disabled={busy === o.id}
                    onClick={() => pdf(o)}
                  >
                    {busy === o.id ? "…" : "PDF"}
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-baykus-muted py-8">
                  Açık iş emri yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
