"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Assumptions,
  Field,
  FilterBar,
  ReportHeader,
  ReportTable,
  SummaryCards,
  inputCls,
} from "@/components/reports/ReportChrome";
import StatusFooter from "@/components/StatusFooter";
import StockDetailFilters from "@/components/StockDetailFilters";
import {
  ReportResponse,
  apiFetch,
  downloadReportCsv,
  formatMoney,
} from "@/lib/api";
import { displaySku } from "@/lib/productLabel";
import {
  EMPTY_STOCK_FILTERS,
  StockFilterFacets,
  StockFilterState,
  stockFiltersToProductQuery,
} from "@/lib/stockFilters";

type StockRow = {
  product_id: number;
  sku: string;
  name: string;
  variant_id?: number | null;
  variant_name?: string | null;
  category?: string | null;
  brand?: string | null;
  warehouse?: string | null;
  color?: string | null;
  size?: string | null;
  print_type?: string | null;
  qty: number;
  threshold: number;
  is_critical: boolean;
  unit_cost: number;
  unit_sale: number;
  value: number;
  value_basis: string;
};

/** BH Stok Değeri → ngninventorystatusreport: product stock/value list filters 1:1. */
export default function StockReportPage() {
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [valueBasis, setValueBasis] = useState<"cost" | "sale">("cost");
  const [activeFilter, setActiveFilter] = useState<"active" | "all">("active");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [productType, setProductType] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [stockFilters, setStockFilters] = useState<StockFilterState>({
    ...EMPTY_STOCK_FILTERS,
    inStockOnly: true,
  });
  const [facets, setFacets] = useState<StockFilterFacets>({
    colors: [],
    sizes: [],
    printTypes: [],
    warehouses: [],
  });
  const [data, setData] = useState<ReportResponse<StockRow> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("value_basis", valueBasis);
    if (criticalOnly) p.set("critical_only", "true");
    if (activeFilter === "active") p.set("active_only", "true");
    else p.set("active_only", "false");
    if (q.trim()) p.set("q", q.trim());
    if (category) p.set("category", category);
    if (brand) p.set("brand", brand);
    if (productType) p.set("type", productType);
    const sf = stockFiltersToProductQuery(stockFilters);
    for (const [k, v] of Object.entries(sf)) p.set(k, v);
    if (!stockFilters.inStockOnly) p.set("in_stock_only", "false");
    return p.toString();
  }, [criticalOnly, valueBasis, activeFilter, q, category, brand, productType, stockFilters]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [report, cats, brs, facetRaw] = await Promise.all([
        apiFetch<ReportResponse<StockRow>>(`/api/reports/stock?${qs}`),
        apiFetch<string[]>("/api/products/categories").catch(() => [] as string[]),
        apiFetch<string[]>("/api/products/brands").catch(() => [] as string[]),
        apiFetch<{
          colors: string[];
          sizes: string[];
          print_types: string[];
          warehouses: string[];
        }>("/api/products/variant-facets").catch(() => ({
          colors: [],
          sizes: [],
          print_types: [],
          warehouses: [],
        })),
      ]);
      setData(report);
      setCategories(cats);
      setBrands(brs);
      setFacets({
        colors: facetRaw.colors || [],
        sizes: facetRaw.sizes || [],
        printTypes: facetRaw.print_types || [],
        warehouses: facetRaw.warehouses || [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    load();
  }, [load]);

  const s = data?.summary || {};
  const assumptions = (s.assumptions as string[]) || [];

  function clearFilters() {
    setQ("");
    setCategory("");
    setBrand("");
    setProductType("");
    setCriticalOnly(false);
    setActiveFilter("active");
    setStockFilters({ ...EMPTY_STOCK_FILTERS, inStockOnly: true });
  }

  return (
    <div>
      <ReportHeader
        title="Stok Değeri"
        subtitle="Depo Durumu · Güncel Stoklar — BH ürün stok/değer listesi filtreleri"
        actions={
          <>
            <button onClick={load} className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm" disabled={loading}>
              {loading ? "Yükleniyor…" : "Yenile"}
            </button>
            <button
              onClick={async () => {
                try {
                  await downloadReportCsv(`/api/reports/stock?${qs}`, "stok_degeri.csv");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "CSV hatası");
                }
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
            >
              CSV indir
            </button>
            <button onClick={() => window.print()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
              Yazdır
            </button>
          </>
        }
      />

      {/* BH ürün listesi üst filtre şeridi */}
      <div className="bk-filter-bar mb-2">
        <div className="flex rounded border border-baykus-line overflow-hidden text-xs font-semibold">
          <button
            type="button"
            className={`px-3 py-1.5 ${activeFilter === "active" ? "bg-[#0ea5e9] text-white" : "bg-white text-slate-600"}`}
            onClick={() => setActiveFilter("active")}
          >
            Aktif Ürünler
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 ${activeFilter === "all" ? "bg-[#0ea5e9] text-white" : "bg-white text-slate-600"}`}
            onClick={() => setActiveFilter("all")}
          >
            Tüm Ürünler
          </button>
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="bk-input max-w-[160px]">
          <option value="">Tüm kategoriler</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={brand} onChange={(e) => setBrand(e.target.value)} className="bk-input max-w-[160px]">
          <option value="">Tüm markalar</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select value={productType} onChange={(e) => setProductType(e.target.value)} className="bk-input max-w-[140px]">
          <option value="">Tüm türler</option>
          <option value="stoklu">Stoklu</option>
          <option value="hizmet">Hizmet</option>
        </select>
        <div className="flex-1" />
        <label className="text-xs text-slate-500 flex items-center gap-1">
          Ara:
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ad / SKU / marka…"
            className="bk-input max-w-[200px]"
          />
        </label>
        <button type="button" onClick={clearFilters} className="bk-btn bk-btn-ghost">
          Temizle
        </button>
      </div>

      {/* BH detaylı stok filtreleri: renk / beden / baskı / depo / SKU / stokta */}
      <StockDetailFilters
        value={stockFilters}
        onChange={setStockFilters}
        facets={facets}
        defaults={{ inStockOnly: true }}
        className="mb-2"
      />

      <FilterBar>
        <Field label="Değer baz">
          <select className={inputCls} value={valueBasis} onChange={(e) => setValueBasis(e.target.value as "cost" | "sale")}>
            <option value="cost">Maliyet / alış</option>
            <option value="sale">Satış fiyatı</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700 h-[38px] mt-4">
          <input type="checkbox" checked={criticalOnly} onChange={(e) => setCriticalOnly(e.target.checked)} />
          Sadece kritik
        </label>
        <button onClick={load} className="rounded-lg bg-baykus-600 text-white px-4 py-2 text-sm h-[38px]">
          Uygula
        </button>
      </FilterBar>

      <Assumptions items={assumptions} />
      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}

      <SummaryCards
        items={[
          { label: "Satır", value: Number(s.row_count ?? 0) },
          { label: "Toplam miktar", value: Number(s.total_qty ?? 0) },
          {
            label: valueBasis === "cost" ? "Stok Değeri (maliyet)" : "Stok Değeri (satış)",
            value: formatMoney(Number(s.total_value ?? 0)),
          },
          { label: "Kritik kalem", value: Number(s.critical_count ?? 0), accent: "border-red-200" },
        ]}
      />

      <ReportTable
        headers={[
          "SKU",
          "Ürün",
          "Varyant",
          "Kategori",
          "Renk",
          "Beden",
          "Depo",
          "Miktar",
          "Kritik",
          "Birim",
          "Değer",
        ]}
        colSpan={11}
        empty={!loading && (data?.rows.length ?? 0) === 0}
      >
        {(data?.rows || []).map((r) => (
          <tr key={`${r.product_id}-${r.variant_id ?? 0}-${r.sku}`} className="border-t border-slate-100 hover:bg-slate-50">
            <td className="px-4 py-3 font-mono text-xs">{displaySku(r.sku) || "—"}</td>
            <td className="px-4 py-3 font-medium">{r.name}</td>
            <td className="px-4 py-3 text-slate-600">{r.variant_name || "—"}</td>
            <td className="px-4 py-3">{r.category || "—"}</td>
            <td className="px-4 py-3">{r.color || "—"}</td>
            <td className="px-4 py-3">{r.size || "—"}</td>
            <td className="px-4 py-3">{r.warehouse || "—"}</td>
            <td className={`px-4 py-3 text-right tabular-nums ${r.is_critical ? "text-red-700 font-semibold" : ""}`}>
              {r.qty}
            </td>
            <td className="px-4 py-3">
              {r.is_critical ? (
                <span className="rounded-full bg-red-100 text-red-800 px-2 py-0.5 text-xs">Kritik</span>
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </td>
            <td className="px-4 py-3 text-right tabular-nums text-slate-600">
              {formatMoney(valueBasis === "cost" ? r.unit_cost : r.unit_sale)}
            </td>
            <td className="px-4 py-3 text-right tabular-nums font-medium">{formatMoney(r.value)}</td>
          </tr>
        ))}
      </ReportTable>

      <StatusFooter onRefresh={load} />
    </div>
  );
}
