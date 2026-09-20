"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ORDER_STATUSES,
  OrderListItem,
  apiFetch,
  formatMoney,
  statusBadgeClass,
} from "@/lib/api";

export default function OrdersListPage() {
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      const qs = params.toString();
      const data = await apiFetch<OrderListItem[]>(`/api/orders${qs ? `?${qs}` : ""}`);
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }, [q, status]);

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
          <h1 className="text-2xl font-bold text-slate-900">Siparişler</h1>
          <p className="text-slate-500 text-sm">Liste · detay · oluşturma — API bağlı</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/orders/kanban"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Kanban
          </Link>
          <Link
            href="/orders/new"
            className="rounded-lg bg-baykus-600 text-white px-4 py-2 text-sm font-medium"
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
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm min-w-[200px]"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Tüm durumlar</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
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

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3">Sipariş No</th>
              <th className="px-4 py-3">Müşteri</th>
              <th className="px-4 py-3">Durum</th>
              <th className="px-4 py-3">Toplam</th>
              <th className="px-4 py-3">Kalan</th>
              <th className="px-4 py-3">Teslim</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Yükleniyor…
                </td>
              </tr>
            )}
            {!loading &&
              items.map((o) => (
                <tr key={o.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/orders/${o.id}`} className="text-baykus-700 hover:underline">
                      {o.order_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{o.customer_name || "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(o.status)}`}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{formatMoney(Number(o.total_amount))}</td>
                  <td className="px-4 py-3">{formatMoney(Number(o.remaining_amount))}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {o.due_date ? String(o.due_date).slice(0, 10) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                    <Link href={`/orders/${o.id}`} className="text-baykus-600 hover:underline">
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
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
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
