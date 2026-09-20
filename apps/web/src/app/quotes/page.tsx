"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  QUOTE_STATUSES,
  QuoteListItem,
  apiFetch,
  formatMoney,
  quoteStatusBadgeClass,
} from "@/lib/api";

export default function QuotesPage() {
  const [items, setItems] = useState<QuoteListItem[]>([]);
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
      const data = await apiFetch<QuoteListItem[]>(`/api/quotes${qs ? `?${qs}` : ""}`);
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
    if (!confirm("Bu teklifi iptal (Reddedildi) etmek istiyor musunuz?")) return;
    try {
      await apiFetch(`/api/quotes/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "İptal hatası");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Teklifler</h1>
          <p className="text-slate-500 text-sm">Liste · oluştur · siparişe dönüştür</p>
        </div>
        <Link
          href="/quotes/new"
          className="rounded-lg bg-baykus-600 text-white px-4 py-2 text-sm font-medium"
        >
          + Yeni Teklif
        </Link>
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
          {QUOTE_STATUSES.map((s) => (
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
      {loading && <p className="text-slate-500 text-sm mb-2">Yükleniyor…</p>}

      {!loading && items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          Henüz teklif yok. Yeni teklif oluşturun.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3">No</th>
                <th className="px-4 py-3">Müşteri</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">Tutar</th>
                <th className="px-4 py-3">Geçerlilik</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/quotes/${item.id}`} className="text-baykus-700 font-medium hover:underline">
                      {item.quote_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{item.customer_name || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${quoteStatusBadgeClass(item.status)}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatMoney(Number(item.total_amount))}</td>
                  <td className="px-4 py-3">{item.valid_until || "—"}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <Link href={`/quotes/${item.id}`} className="text-baykus-600 hover:underline">
                      Aç
                    </Link>
                    {item.status !== "Siparişe Dönüştü" && item.status !== "Reddedildi" && (
                      <button
                        type="button"
                        onClick={() => softCancel(item.id)}
                        className="text-red-600 hover:underline"
                      >
                        İptal
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
