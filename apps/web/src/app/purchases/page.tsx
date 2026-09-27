"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PURCHASE_STATUS_LABELS, PurchaseListItem, apiFetch, formatMoney } from "@/lib/api";
import StatusFooter from "@/components/StatusFooter";

export default function PurchasesPage() {
  const [items, setItems] = useState<PurchaseListItem[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (status !== "all") params.set("status", status);
      const qs = params.toString();
      const data = await apiFetch<PurchaseListItem[]>(`/api/purchases${qs ? `?${qs}` : ""}`);
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

  return (
    <div className="space-y-2 pb-2">
      <div className="bk-sticky-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-baykus-text leading-tight">Satın Alma</h1>
          <p className="text-[11px] text-baykus-muted">Tedarikçi alımları · stok girişi · borç</p>
        </div>
        <Link
          href="/purchases/new"
          className="rounded-lg bg-baykus-600 text-white px-4 py-2 text-sm font-medium"
        >
          + Yeni Satın Alma
        </Link>
      </div>

      <div className="bk-kpi-strip" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <div className="bk-kpi-card" style={{ backgroundColor: "#334155" }}>
          <span className="bk-kpi-icon">☰</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Kayıt</div>
            <div className="bk-kpi-value">{items.length}</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#198754" }}>
          <span className="bk-kpi-icon">✓</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Onaylı</div>
            <div className="bk-kpi-value">{items.filter((p) => p.status === "confirmed").length}</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#be123c" }}>
          <span className="bk-kpi-icon">₺</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Toplam</div>
            <div className="bk-kpi-value truncate">{formatMoney(items.reduce((s, p) => s + Number(p.total_amount || 0), 0))}</div>
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Ara</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Numara, tedarikçi…"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-56"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Durum</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">Tümü</option>
            <option value="draft">Taslak</option>
            <option value="confirmed">Onaylı</option>
            <option value="cancelled">İptal</option>
          </select>
        </div>
        <button onClick={load} className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm">
          Filtrele
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}

      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>No</th>
              <th>Tedarikçi</th>
              <th>Tarih</th>
              <th>Durum</th>
              <th className="text-right">Toplam</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs">
                  <Link href={`/purchases/${p.id}`} className="text-baykus-700 hover:underline">
                    {p.purchase_number}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/suppliers/${p.supplier_id}`} className="hover:underline">
                    {p.supplier_name}
                  </Link>
                </td>
                <td className="px-4 py-3">{p.purchase_date}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                      p.status === "confirmed"
                        ? "bg-emerald-100 text-emerald-800"
                        : p.status === "cancelled"
                          ? "bg-slate-200 text-slate-600"
                          : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {PURCHASE_STATUS_LABELS[p.status] || p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">
                  {formatMoney(Number(p.total_amount))}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/purchases/${p.id}`} className="text-baykus-600 hover:underline">
                    Detay
                  </Link>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Satın alma yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <StatusFooter onRefresh={load} />
    </div>
  );
}
