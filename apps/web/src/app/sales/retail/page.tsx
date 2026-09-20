"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { OrderListItem, apiFetch, formatMoney, statusBadgeClass } from "@/lib/api";

export default function RetailSalesPage() {
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setItems(
        await apiFetch<OrderListItem[]>("/api/orders?channels=mağaza,perakende&limit=200"),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Perakende Satışlar</h2>
          <p className="text-xs text-baykus-muted">Kanal: mağaza / perakende</p>
        </div>
        <Link href="/sales/create?type=perakende" className="bk-btn bk-btn-primary text-xs">
          Hızlı perakende satış
        </Link>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Sipariş</th>
              <th>Müşteri</th>
              <th>Kanal</th>
              <th>Durum</th>
              <th className="text-right">Tutar</th>
              <th>Tarih</th>
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
                <td>{o.customer_name || "Perakende"}</td>
                <td>{o.channel || "—"}</td>
                <td>
                  <span className={`inline-block rounded px-2 py-0.5 text-[11px] ${statusBadgeClass(o.status)}`}>
                    {o.status}
                  </span>
                </td>
                <td className="text-right tabular-nums">{formatMoney(Number(o.total_amount))}</td>
                <td className="text-xs">{new Date(o.created_at).toLocaleDateString("tr-TR")}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-baykus-muted py-8">
                  Perakende satış yok —{" "}
                  <Link href="/sales/create?type=perakende" className="text-baykus-primary hover:underline">
                    oluştur
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
