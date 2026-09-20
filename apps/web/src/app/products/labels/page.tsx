"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Product, apiFetch } from "@/lib/api";
import { code128Svg } from "@/lib/code128";

type Row = { id: number; name: string; sku: string; barcode: string; selected: boolean };

export default function ProductLabelsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "300" });
      if (q.trim()) params.set("q", q.trim());
      const products = await apiFetch<Product[]>(`/api/products?${params}`);
      setRows(
        products.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          barcode: (p as { barcode?: string | null }).barcode || p.sku,
          selected: false,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(() => rows.filter((r) => r.selected), [rows]);

  function toggle(id: number) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)));
  }

  function selectAll(v: boolean) {
    setRows((prev) => prev.map((r) => ({ ...r, selected: v })));
  }

  function printLabels() {
    const list = selected.length ? selected : rows.slice(0, 12);
    if (!list.length) {
      setError("Ürün yok");
      return;
    }
    const cards = list
      .map((r) => {
        const svg = code128Svg(r.barcode || r.sku, { height: 48, moduleWidth: 1.4 });
        return `<div class="label"><div class="name">${escape(r.name)}</div><div class="sku">${escape(r.sku)}</div>${svg}</div>`;
      })
      .join("");
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/><title>Barkod Etiketleri</title>
<style>
body{font-family:Segoe UI,system-ui,sans-serif;margin:12px;color:#0f172a}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.label{border:1px dashed #94a3b8;border-radius:6px;padding:10px;text-align:center;page-break-inside:avoid}
.name{font-size:12px;font-weight:700;margin-bottom:2px}
.sku{font-size:10px;color:#64748b;margin-bottom:6px;font-family:ui-monospace,monospace}
@media print{button{display:none} body{margin:0} .label{border-color:#cbd5e1}}
</style></head><body>
<button onclick="window.print()" style="margin-bottom:12px">Yazdır</button>
<div class="grid">${cards}</div>
<script>setTimeout(function(){window.print()},250)</script>
</body></html>`);
    w.document.close();
  }

  function escape(s: string) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Barkod / Etiket</h2>
          <p className="text-xs text-baykus-muted">
            Ürün &amp; Stok › Barkod etiket yazdır · Code128 SVG
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/products" className="bk-btn bk-btn-ghost text-xs">
            Ürünler
          </Link>
          <button type="button" className="bk-btn bk-btn-primary text-xs" onClick={printLabels}>
            Seçilenleri Yazdır ({selected.length || "önizleme"})
          </button>
        </div>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="bk-filter-bar">
        <input
          className="bk-input max-w-[240px]"
          placeholder="Ad / SKU / barkod ara…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={load}>
          Ara
        </button>
        <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => selectAll(true)}>
          Tümünü seç
        </button>
        <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => selectAll(false)}>
          Temizle
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 print:grid-cols-3">
        {rows.map((r) => (
          <label
            key={r.id}
            className={`rounded-lg border bg-white p-3 cursor-pointer hover:border-baykus-primary ${
              r.selected ? "ring-2 ring-baykus-primary border-baykus-primary" : "border-slate-200"
            }`}
          >
            <div className="flex items-start gap-2 mb-2">
              <input type="checkbox" checked={r.selected} onChange={() => toggle(r.id)} className="mt-1" />
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{r.name}</div>
                <div className="text-[11px] font-mono text-slate-500">{r.sku}</div>
              </div>
            </div>
            <div
              className="overflow-x-auto"
              dangerouslySetInnerHTML={{
                __html: code128Svg(r.barcode || r.sku, { height: 40, moduleWidth: 1.3 }),
              }}
            />
          </label>
        ))}
        {!loading && rows.length === 0 && (
          <div className="col-span-full text-center text-baykus-muted py-10">Ürün bulunamadı</div>
        )}
      </div>
    </div>
  );
}
