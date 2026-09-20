"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  DESIGN_STATUSES,
  ORDER_CHANNELS,
  ORDER_STATUSES,
  OrderListItem,
  apiFetch,
  designStatusBadgeClass,
  formatMoney,
  statusBadgeClass,
} from "@/lib/api";

export default function OrdersListPage() {
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [designStatus, setDesignStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      if (channel) params.set("channel", channel);
      if (designStatus) params.set("design_status", designStatus);
      const qs = params.toString();
      const data = await apiFetch<OrderListItem[]>(`/api/orders${qs ? `?${qs}` : ""}`);
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }, [q, status, channel, designStatus]);

  useEffect(() => {
    load();
  }, [load]);

  async function softCancel(id: number) {
    if (!confirm("Bu siparişi iptal etmek istiyor musunuz?")) return;
    try {
      await apiFetch(`/api/orders/${id}?soft=true`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "İptal hatası");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-baykus-text">Siparişler</h1>
          <p className="text-baykus-muted text-sm">Liste · kanal / tasarım filtresi · detay</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/orders/kanban"
            className="rounded-lg border border-baykus-line px-4 py-2 text-sm hover:bg-baykus-bg"
          >
            Kanban
          </Link>
          <Link
            href="/orders/new"
            className="rounded-lg bg-baykus-primary text-white px-4 py-2 text-sm font-medium"
          >
            + Yeni Sipariş
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="No / müşteri / not ara…"
          className="rounded-lg border border-baykus-line px-3 py-2 text-sm min-w-[200px]"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-baykus-line px-3 py-2 text-sm"
        >
          <option value="">Tüm durumlar</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className="rounded-lg border border-baykus-line px-3 py-2 text-sm"
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
          className="rounded-lg border border-baykus-line px-3 py-2 text-sm"
        >
          <option value="">Tüm tasarım</option>
          {DESIGN_STATUSES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <button onClick={load} className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm">
          Ara
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}

      <div className="rounded-xl border border-baykus-line bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-baykus-bg text-left text-baykus-muted">
            <tr>
              <th className="px-3 py-2">Sipariş No</th>
              <th className="px-3 py-2">Müşteri</th>
              <th className="px-3 py-2">Durum</th>
              <th className="px-3 py-2">Kanal</th>
              <th className="px-3 py-2">Tasarım</th>
              <th className="px-3 py-2">Toplam</th>
              <th className="px-3 py-2">Kalan</th>
              <th className="px-3 py-2">Teslim</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  Yükleniyor…
                </td>
              </tr>
            )}
            {!loading &&
              items.map((o) => (
                <tr key={o.id} className="border-t border-baykus-line hover:bg-baykus-bg">
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/orders/${o.id}`} className="text-baykus-primary hover:underline">
                      {o.order_number}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-baykus-muted">{o.customer_name || "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(o.status)}`}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-baykus-muted">{o.channel || "—"}</td>
                  <td className="px-3 py-2">
                    {o.design_status ? (
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${designStatusBadgeClass(o.design_status)}`}
                      >
                        {o.design_status}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">{formatMoney(Number(o.total_amount))}</td>
                  <td className="px-3 py-2">{formatMoney(Number(o.remaining_amount))}</td>
                  <td className="px-3 py-2 text-baykus-muted">
                    {o.due_date ? String(o.due_date).slice(0, 10) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap space-x-2">
                    <Link href={`/orders/${o.id}`} className="text-baykus-primary hover:underline">
                      Aç
                    </Link>
                    {o.status !== "Sipariş İptali" && (
                      <button
                        onClick={() => softCancel(o.id)}
                        className="text-red-600 hover:underline"
                      >
                        İptal
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  Sipariş yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
