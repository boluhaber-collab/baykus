"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, downloadAuthFile } from "@/lib/api";
import { displaySku } from "@/lib/productLabel";
import StatusFooter from "@/components/StatusFooter";

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

  const load = useCallback(async () => {
    setError("");
    try {
      setSummary(await apiFetch<StockSummary>("/api/products/stock-summary"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "İçe aktarma hatası");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-2 pb-2">
      <div className="bk-sticky-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-baykus-text leading-tight">Stok</h1>
          <p className="text-baykus-muted text-[11px]">Özet, kritik kalemler, Excel/CSV içe-dışa aktarma</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/stock/entry" className="bk-btn text-xs font-semibold text-white" style={{ backgroundColor: "#0369a1" }}>
            Stok Girişi
          </Link>
          <Link href="/stock/count" className="bk-btn text-xs font-semibold text-white" style={{ backgroundColor: "#22a447" }}>
            Stok Sayımı
          </Link>
          <Link href="/tools/import" className="bk-btn text-xs font-semibold text-white" style={{ backgroundColor: "#e2b44d" }}>
            Excel Aktar
          </Link>
          <Link href="/stock/warehouses" className="bk-btn bk-btn-ghost text-xs">Depolar</Link>
          <Link href="/stock/critical" className="bk-btn bk-btn-ghost text-xs text-red-700">Kritik liste</Link>
          <Link href="/products" className="bk-btn bk-btn-ghost text-xs">Ürünler</Link>
        </div>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{msg}</div>}

      <fieldset className="rounded border border-baykus-line bg-white px-3 py-2">
        <legend className="px-1 text-xs font-bold text-baykus-text">Stok dosyası</legend>
        <div className="flex flex-wrap gap-2 items-center text-xs">
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => downloadAuthFile("/api/products/stock/export?fmt=csv", "stok-export.csv")}>
            CSV dışa aktar
          </button>
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => downloadAuthFile("/api/products/stock/export?fmt=xlsx", "stok-export.xlsx")}>
            Excel dışa aktar
          </button>
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => downloadAuthFile("/api/products/stock/import-template?fmt=csv", "stok-sablon.csv")}>
            Şablon CSV
          </button>
          <label className="bk-btn bk-btn-ghost text-xs cursor-pointer">
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
      </fieldset>

      {summary && (
        <>
          <div className="bk-kpi-strip" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            <div className="bk-kpi-card" style={{ backgroundColor: "#2563eb" }}>
              <span className="bk-kpi-icon">▣</span>
              <div className="min-w-0 flex-1 text-right">
                <div className="bk-kpi-label">Toplam SKU</div>
                <div className="bk-kpi-value">{summary.total_skus}</div>
              </div>
            </div>
            <div className="bk-kpi-card" style={{ backgroundColor: "#198754" }}>
              <span className="bk-kpi-icon">✓</span>
              <div className="min-w-0 flex-1 text-right">
                <div className="bk-kpi-label">Aktif</div>
                <div className="bk-kpi-value">{summary.active_skus}</div>
              </div>
            </div>
            <div className="bk-kpi-card" style={{ backgroundColor: "#dc2626" }}>
              <span className="bk-kpi-icon">⚠</span>
              <div className="min-w-0 flex-1 text-right">
                <div className="bk-kpi-label">Kritik</div>
                <div className="bk-kpi-value">{summary.critical_count}</div>
              </div>
            </div>
          </div>

          <div className="bk-table-wrap">
            <div className="px-3 py-2 border-b border-baykus-line bg-[#151b26] text-white text-xs font-bold">
              Düşük / kritik stok
            </div>
            <table className="bk-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Ad</th>
                  <th className="text-right">Adet</th>
                  <th className="text-right">Eşik</th>
                </tr>
              </thead>
              <tbody>
                {summary.low_stock.map((r) => (
                  <tr key={r.product_id}>
                    <td className="font-mono text-xs">
                      {displaySku(r.sku) ? (
                        <Link href={`/products/${r.product_id}`} className="text-baykus-primary hover:underline">
                          {displaySku(r.sku)}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td>
                      <Link href={`/products/${r.product_id}`} className="text-baykus-primary hover:underline">
                        {r.name}
                      </Link>
                    </td>
                    <td className="text-right tabular-nums text-red-600">{r.qty}</td>
                    <td className="text-right tabular-nums">{r.threshold}</td>
                  </tr>
                ))}
                {summary.low_stock.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center text-slate-400 py-8">
                      Kritik stok yok
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <StatusFooter onRefresh={load} />
    </div>
  );
}
