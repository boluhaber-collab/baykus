"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ORDER_CHANNELS,
  OrderListItem,
  apiFetch,
  formatMoney,
  statusBadgeClass,
} from "@/lib/api";

const NET = ["internet", "Trendyol", "Hepsiburada", "N11"] as const;

export default function EcommerceHubPage() {
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [channel, setChannel] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (channel) params.set("channel", channel);
      const qs = params.toString();
      const data = await apiFetch<OrderListItem[]>(`/api/orders${qs ? `?${qs}` : ""}`);
      const filtered = channel
        ? data
        : data.filter((o) => NET.includes((o.channel || "") as (typeof NET)[number]));
      setItems(filtered);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }, [channel]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">E-Ticaret</h2>
          <p className="text-xs text-baykus-muted">İnternet / pazaryeri kanalı siparişleri</p>
        </div>
        <Link href="/sales/create?type=internet" className="bk-btn bk-btn-primary text-xs">
          + İnternet siparişi
        </Link>
      </div>

      <div className="bk-filter-bar">
        <select className="bk-input max-w-[180px]" value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="">Tüm internet kanalları</option>
          {NET.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          {ORDER_CHANNELS.filter((c) => !(NET as readonly string[]).includes(c)).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button type="button" className="bk-btn bk-btn-ghost" onClick={() => setChannel("")}>
          Temizle
        </button>
        <button type="button" className="bk-btn bk-btn-primary" onClick={load}>
          Ara
        </button>
        {loading && <span className="text-xs text-baykus-muted">Yükleniyor…</span>}
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Sipariş No</th>
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
                <td>{o.customer_name || "—"}</td>
                <td>{o.channel || "—"}</td>
                <td>
                  <span className={`inline-block rounded px-2 py-0.5 text-[11px] ${statusBadgeClass(o.status)}`}>
                    {o.status}
                  </span>
                </td>
                <td className="text-right tabular-nums">{formatMoney(Number(o.total_amount))}</td>
                <td className="text-xs">
                  {o.created_at ? new Date(o.created_at).toLocaleDateString("tr-TR") : "—"}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-baykus-muted py-8">
                  İnternet siparişi yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
