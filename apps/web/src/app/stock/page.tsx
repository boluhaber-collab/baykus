"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, downloadAuthFile } from "@/lib/api";

type StockSummary = {
  total_skus: number;
  active_skus: number;
  critical_count: number;
  low_stock: {
    product_id: number;
    sku: string;
    name: string;
    qty: number;
    threshold: number;
  }[];
};

export default function StockPage() {
  const [summary, setSummary] = useState<StockSummary | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    apiFetch<StockSummary>("/api/products/stock-summary")
      .then(setSummary)
      .catch((e) => setError(e instanceof Error ? e.message : "Yükleme hatası"));
  }, []);

  async function onImport(file: File | null) {
    if (!file) return;
    setError("");
    setMsg("");
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetch<{ created: number; updated: number; skipped: number; errors: string[] }>(
        "/api/products/stock/import",
        { method: "POST", body: fd },
      );
      setMsg(`İçe aktarma: ${res.created} yeni, ${res.updated} güncellendi, ${res.skipped} atlandı`);
      if (res.errors?.length) setError(res.errors.slice(0, 5).join(" · "));
      setSummary(await apiFetch<StockSummary>("/api/products/stock-summary"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "İçe aktarma hatası");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Stok</h1>
          <p className="text-slate-500 text-sm">Özet, kritik kalemler, Excel/CSV içe-dışa aktarma</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/stock/warehouses" className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
            Depolar
          </Link>
          <Link href="/stock/critical" className="rounded-lg border border-red-200 text-red-700 px-4 py-2 text-sm hover:bg-red-50">
            Kritik liste
          </Link>
          <Link href="/products" className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
            Ürünler
          </Link>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}
      {msg && <div className="mb-4 rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm">{msg}</div>}

      <div className="mb-6 rounded-xl border bg-white p-4 shadow-sm flex flex-wrap gap-3 items-center text-sm">
        <span className="font-medium text-slate-700">Stok dosyası</span>
        <button
          type="button"
          className="rounded border px-3 py-1.5 hover:bg-slate-50 text-xs"
          onClick={() => downloadAuthFile("/api/products/stock/export?fmt=csv", "stok-export.csv")}
        >
          CSV dışa aktar
        </button>
        <button
          type="button"
          className="rounded border px-3 py-1.5 hover:bg-slate-50 text-xs"
          onClick={() => downloadAuthFile("/api/products/stock/export?fmt=xlsx", "stok-export.xlsx")}
        >
          Excel dışa aktar
        </button>
        <button
          type="button"
          className="rounded border px-3 py-1.5 hover:bg-slate-50 text-xs"
          onClick={() => downloadAuthFile("/api/products/stock/import-template?fmt=csv", "stok-sablon.csv")}
        >
          Şablon CSV
        </button>
        <label className="rounded border px-3 py-1.5 hover:bg-slate-50 text-xs cursor-pointer">
          {importing ? "Aktarılıyor…" : "CSV/XLSX içe aktar"}
          <input
            type="file"
            accept=".csv,.xlsx,.xlsm,text/csv"
            className="hidden"
            disabled={importing}
            onChange={(e) => {
              void onImport(e.target.files?.[0] || null);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {summary && (
        <>
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-500">Toplam SKU</div>
              <div className="text-2xl font-bold">{summary.total_skus}</div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-500">Aktif</div>
              <div className="text-2xl font-bold">{summary.active_skus}</div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-500">Kritik</div>
              <div className="text-2xl font-bold text-red-600">{summary.critical_count}</div>
            </div>
          </div>

          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-slate-50 font-medium text-sm">Düşük / kritik stok</div>
            <table className="min-w-full text-sm">
              <thead className="text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Ad</th>
                  <th className="px-4 py-3 text-right">Adet</th>
                  <th className="px-4 py-3 text-right">Eşik</th>
                </tr>
              </thead>
              <tbody>
                {summary.low_stock.map((r) => (
                  <tr key={r.product_id} className="border-t">
                    <td className="px-4 py-2 font-mono text-xs">
                      <Link href={`/products/${r.product_id}`} className="text-teal-700 hover:underline">
                        {r.sku}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{r.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-red-600">{r.qty}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.threshold}</td>
                  </tr>
                ))}
                {summary.low_stock.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                      Kritik stok yok
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
