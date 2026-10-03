"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Product, apiFetch, formatMoney, stockBadgeClass } from "@/lib/api";
import { displaySku } from "@/lib/productLabel";
import { HubActionsBar, HubSection, HubTabs } from "@/components/hub/HubChrome";
import StatusFooter from "@/components/StatusFooter";
import StockDetailFilters from "@/components/StockDetailFilters";
import {
  EMPTY_STOCK_FILTERS,
  StockFilterFacets,
  StockFilterState,
  sortSizes,
  stockFiltersToProductQuery,
} from "@/lib/stockFilters";

type Tab = "urunler" | "kritik" | "rapor";

const TABS: { id: Tab; label: string }[] = [
  { id: "urunler", label: "Ürünler" },
  { id: "kritik", label: "Kritik Stok" },
  { id: "rapor", label: "Rapor / Araçlar" },
];

function ProductsHubPageInner() {
  const sp = useSearchParams();
  const initial = sp.get("tab");
  const [tab, setTab] = useState<Tab>(
    initial === "kritik" || initial === "critical"
      ? "kritik"
      : initial === "rapor" || initial === "variants"
        ? initial === "variants"
          ? "urunler"
          : "rapor"
        : "urunler",
  );

  const PAGE_SIZE = 50;
  type ListCounts = {
    total: number;
    products: number;
    variants: number;
    qty: number;
    critical: number;
    value: number;
  };

  const [items, setItems] = useState<Product[]>([]);
  const [counts, setCounts] = useState<ListCounts | null>(null);
  const [page, setPage] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [productType, setProductType] = useState("");
  const [activeFilter, setActiveFilter] = useState<"active" | "all">("active");
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [showBulkImageStub, setShowBulkImageStub] = useState(false);
  const [stockFilters, setStockFilters] = useState<StockFilterState>({
    ...EMPTY_STOCK_FILTERS,
    inStockOnly: false,
  });
  const [facets, setFacets] = useState<StockFilterFacets>({
    colors: [],
    sizes: [],
    printTypes: [],
    warehouses: [],
  });

  const criticalOnly = tab === "kritik";

  useEffect(() => {
    const timer = setTimeout(() => setQ(qInput), 250);
    return () => clearTimeout(timer);
  }, [qInput]);

  const filterSig = useMemo(
    () =>
      JSON.stringify({
        q,
        category,
        brand,
        productType,
        criticalOnly,
        activeFilter,
        colors: stockFilters.colors,
        sizes: stockFilters.sizes,
        printType: stockFilters.printType,
        sku: stockFilters.sku,
        warehouse: stockFilters.warehouse,
        inStockOnly: stockFilters.inStockOnly,
      }),
    [q, category, brand, productType, criticalOnly, activeFilter, stockFilters],
  );
  const filterSigRef = useRef(filterSig);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const [cats, brs, facetRaw] = await Promise.all([
          apiFetch<string[]>("/api/products/categories"),
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
        if (cancel) return;
        setCategories(cats);
        setBrands(brs);
        setFacets({
          colors: facetRaw.colors || [],
          sizes: sortSizes(facetRaw.sizes || []),
          printTypes: facetRaw.print_types || [],
          warehouses: facetRaw.warehouses || [],
        });
      } catch {
        /* facets are optional; list still loads */
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    let usePage = page;
    if (filterSigRef.current !== filterSig) {
      filterSigRef.current = filterSig;
      usePage = 0;
      if (page !== 0) setPage(0);
    }
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (category) params.set("category", category);
      if (brand) params.set("brand", brand);
      if (productType) params.set("type", productType);
      if (criticalOnly) params.set("critical_only", "true");
      if (activeFilter === "active") params.set("active_only", "true");
      const sf = stockFiltersToProductQuery({ ...stockFilters, color: "", size: "" });
      for (const [k, v] of Object.entries(sf)) params.set(k, v);
      for (const c of stockFilters.colors || []) params.append("colors", c);
      for (const s of stockFilters.sizes || []) params.append("sizes", s);
      params.set("limit", String(PAGE_SIZE));
      params.set("skip", String(usePage * PAGE_SIZE));
      const qs = params.toString();
      const [data, tally] = await Promise.all([
        apiFetch<Product[]>(`/api/products?${qs}`),
        apiFetch<ListCounts>(`/api/products/list-counts?${qs}`).catch(() => null),
      ]);
      setItems(data);
      setCounts(tally);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }, [q, category, brand, productType, criticalOnly, activeFilter, stockFilters, page, filterSig]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => Number(k)),
    [selected],
  );

  const visibleItems = useMemo(() => {
    if (selectedIds.length === 0) return items;
    const picked = new Set(selectedIds);
    return items.filter((p) => picked.has(p.id));
  }, [items, selectedIds]);

  const hiddenItems = useMemo(() => {
    if (selectedIds.length === 0) return [] as Product[];
    const picked = new Set(selectedIds);
    return items.filter((p) => !picked.has(p.id));
  }, [items, selectedIds]);

  const stats = useMemo(() => {
    if (selectedIds.length > 0) {
      const source = visibleItems;
      let variants = 0;
      let qty = 0;
      let critical = 0;
      let value = 0;
      for (const p of source) {
        variants += p.variants_count ?? 0;
        const total = p.total_stock ?? p.stock_qty ?? 0;
        if (p.product_type !== "hizmet") {
          qty += total;
          const unit = Number(p.cost || 0) > 0 ? Number(p.cost) : Number(p.purchase_price || 0);
          value += unit * total;
        }
        const thr = p.critical_stock_threshold ?? 10;
        if (p.is_critical || (p.product_type !== "hizmet" && total < thr)) critical += 1;
      }
      return { products: source.length, variants, qty, critical, value };
    }
    return {
      products: counts?.products ?? 0,
      variants: counts?.variants ?? 0,
      qty: counts?.qty ?? 0,
      critical: counts?.critical ?? 0,
      value: counts?.value ?? 0,
    };
  }, [visibleItems, selectedIds.length, counts]);

  useEffect(() => {
    const valid = new Set(items.map((p) => p.id));
    setSelected((prev) => {
      let changed = false;
      const next: Record<number, boolean> = {};
      for (const [k, on] of Object.entries(prev)) {
        if (!on) continue;
        const id = Number(k);
        if (!valid.has(id)) {
          changed = true;
          continue;
        }
        next[id] = true;
      }
      return changed ? next : prev;
    });
  }, [items]);

  async function onDelete(id: number) {
    if (!confirm("Bu ürünü silmek istediğinize emin misiniz?")) return;
    try {
      await apiFetch(`/api/products/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Silme hatası");
    }
  }

  async function bulkSoftDisable() {
    if (selectedIds.length === 0) {
      setError("Toplu silme için ürün seçin (satır kutuları)");
      return;
    }
    if (
      !confirm(
        `${selectedIds.length} ürün pasife alınacak (soft-disable). Devam?`,
      )
    ) {
      return;
    }
    setBulkBusy(true);
    setError("");
    setMsg("");
    try {
      let ok = 0;
      for (const id of selectedIds) {
        await apiFetch(`/api/products/${id}`, {
          method: "PUT",
          body: JSON.stringify({ is_active: false }),
        });
        ok += 1;
      }
      setMsg(`${ok} ürün pasife alındı`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Toplu pasifleştirme hatası");
    } finally {
      setBulkBusy(false);
    }
  }

  const allSelected = items.length > 0 && selectedIds.length === items.length;
  const someSelected = selectedIds.length > 0 && !allSelected;
  const headRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headRef.current) headRef.current.indeterminate = someSelected;
  }, [someSelected]);

  function toggleAll(on: boolean) {
    const next: Record<number, boolean> = {};
    if (on) for (const p of items) next[p.id] = true;
    setSelected(next);
  }

  return (
    <HubSection title="Ürün & Stok Merkezi" onRefresh={load}>
      <div className="bk-kpi-strip" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
        <div className="bk-kpi-card" style={{ backgroundColor: "#2563eb" }}>
          <span className="bk-kpi-icon">▣</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Ürün</div>
            <div className="bk-kpi-value">{stats.products}</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#0f766e" }}>
          <span className="bk-kpi-icon">⧉</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Varyant</div>
            <div className="bk-kpi-value">{stats.variants}</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#16a34a" }}>
          <span className="bk-kpi-icon">☰</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Stok Adedi</div>
            <div className="bk-kpi-value">{stats.qty}</div>
          </div>
        </div>
        <Link href="/stock/critical" className="bk-kpi-card" style={{ backgroundColor: "#dc2626" }}>
          <span className="bk-kpi-icon">⚠</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Kritik</div>
            <div className="bk-kpi-value">{stats.critical}</div>
          </div>
        </Link>
        <Link href="/reports/stock" className="bk-kpi-card" style={{ backgroundColor: "#7c3aed" }}>
          <span className="bk-kpi-icon">₺</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Stok Değeri</div>
            <div className="bk-kpi-value truncate">{formatMoney(Number(stats.value))}</div>
          </div>
        </Link>
      </div>

      {/* BizimHesap-style colorful CTA strip */}
      <div className="bk-product-cta-bar">
        <Link href="/products/new" className="bk-product-cta" style={{ backgroundColor: "#22a447" }}>
          + Yeni Ürün/Hizmet
        </Link>
        <Link href="/tools/import" className="bk-product-cta" style={{ backgroundColor: "#e2b44d" }}>
          Excel&apos;den yükle
        </Link>
        <Link
          href="/tools/import?type=bulk-price"
          className="bk-product-cta"
          style={{ backgroundColor: "#22d3ee", color: "#0f172a" }}
        >
          Toplu güncelle
        </Link>
        <button
          type="button"
          onClick={() => setShowBulkImageStub(true)}
          className="bk-product-cta"
          style={{ backgroundColor: "#7c3aed" }}
        >
          Toplu resim
        </button>
        <button
          type="button"
          onClick={() => void bulkSoftDisable()}
          disabled={bulkBusy}
          className="bk-product-cta"
          style={{ backgroundColor: "#facc15", color: "#0f172a" }}
        >
          Toplu sil {selectedIds.length ? `(${selectedIds.length})` : ""}
        </button>
        <Link href="/stock/entry" className="bk-product-cta" style={{ backgroundColor: "#0369a1" }}>
          Stok Girişi
        </Link>
      </div>
      <div className="flex flex-wrap gap-3 text-xs mb-2 text-baykus-muted">
        <span>Mevcut üründen kopyala: listeden <strong>Aç → Düzenle</strong> (SKU değiştirerek kaydet).</span>
      </div>

      {showBulkImageStub && (
        <div className="mb-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          <div className="font-semibold mb-1">Toplu resim yükleme</div>
          <p className="text-xs mb-2">
            Çoklu dosya yükleme API&apos;si henüz yok — ürün kartında Fotoğraf URL alanını kullanın
            veya Excel ile <code>photo_url</code> güncelleyin.
          </p>
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => setShowBulkImageStub(false)}>
            Kapat
          </button>
        </div>
      )}

      {/* Secondary links — CTA bar already covers Yeni/Excel/Toplu/Stok Girişi */}
      <div className="flex flex-wrap gap-2 mb-2 text-xs">
        <Link href="/stock/critical" className="rounded-md px-2.5 py-1.5 font-semibold text-white" style={{ background: "#be123c" }}>
          Kritik Stok
        </Link>
        <Link href="/stock/warehouses" className="rounded-md px-2.5 py-1.5 font-semibold text-white" style={{ background: "#14b8a6" }}>
          Depolar
        </Link>
        <Link href="/stock/count" className="rounded-md px-2.5 py-1.5 font-semibold text-white" style={{ background: "#22a447" }}>
          Stok Sayımı
        </Link>
        <Link href="/products/labels" className="rounded-md px-2.5 py-1.5 font-semibold text-white" style={{ background: "#334155" }}>
          Barkod / Etiket
        </Link>
        <Link href="/stock" className="rounded-md px-2.5 py-1.5 font-semibold text-white" style={{ background: "#0369a1" }}>
          Stok Yönetimi
        </Link>
        <Link href="/reports/stock" className="rounded-md px-2.5 py-1.5 font-semibold text-white" style={{ background: "#2563eb" }}>
          Stok Raporu
        </Link>
      </div>

      <HubTabs tabs={TABS} active={tab} onChange={(id) => setTab(id as Tab)} />

      {error && <div className="mb-3 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}
      {msg && <div className="mb-3 rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm">{msg}</div>}

      {(tab === "urunler" || tab === "kritik") && (
        <>
          <div className="bk-filter-bar">
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
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bk-input max-w-[160px]"
            >
              <option value="">Tüm kategoriler</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="bk-input max-w-[160px]"
            >
              <option value="">Tüm markalar</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <select
              value={productType}
              onChange={(e) => setProductType(e.target.value)}
              className="bk-input max-w-[140px]"
            >
              <option value="">Tüm türler</option>
              <option value="stoklu">Stoklu</option>
              <option value="hizmet">Hizmet</option>
            </select>
            <div className="flex-1" />
            <label className="text-xs text-slate-500 flex items-center gap-1">
              Ara:
              <input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Ad / SKU / marka…"
                className="bk-input max-w-[200px]"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setQInput("");
                setQ("");
                setCategory("");
                setBrand("");
                setProductType("");
                setStockFilters({ ...EMPTY_STOCK_FILTERS, inStockOnly: false });
                setSelected({});
              }}
              className="bk-btn bk-btn-ghost"
            >
              Temizle
            </button>
            <button onClick={load} className="bk-btn bk-btn-primary">
              Ara
            </button>
          </div>

          <StockDetailFilters
            value={stockFilters}
            onChange={setStockFilters}
            facets={facets}
            defaults={{ inStockOnly: false }}
            multiColorSize
          />

          {selectedIds.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
              <span>
                {selectedIds.length} ürün seçili — liste ve üst toplamlar yalnız seçilen ürünler.
              </span>
              {hiddenItems.length > 0 && (
                <details className="relative">
                  <summary className="cursor-pointer font-semibold text-sky-700">
                    Seçime ekle ({hiddenItems.length})
                  </summary>
                  <div className="absolute z-30 mt-1 max-h-64 w-80 overflow-auto rounded border border-slate-200 bg-white shadow-lg">
                    {hiddenItems.map((p) => (
                      <label
                        key={p.id}
                        className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          className="rounded border-slate-300"
                          checked={false}
                          onChange={() => setSelected((s) => ({ ...s, [p.id]: true }))}
                        />
                        <span className="truncate">{p.name}</span>
                      </label>
                    ))}
                  </div>
                </details>
              )}
              <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => setSelected({})}>
                Seçimi temizle
              </button>
            </div>
          )}

          <div className="bk-table-wrap">
            <table className="bk-table bk-product-list-table">
              <thead>
                <tr>
                  <th className="w-8">
                    <input
                      ref={headRef}
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => toggleAll(e.target.checked)}
                      aria-label="Tümünü seç"
                    />
                  </th>
                  <th>Ürün Hizmet Adı</th>
                  <th className="text-right">Satış Fiyatı</th>
                  <th className="text-right">Stok Miktarı</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((p) => {
                  const total = p.total_stock ?? p.stock_qty;
                  const thr = p.critical_stock_threshold ?? 10;
                  const critical = p.is_critical || (p.product_type !== "hizmet" && total < thr);
                  const isService = p.product_type === "hizmet";
                  return (
                    <tr key={p.id} className={critical ? "bg-red-50/40" : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          checked={!!selected[p.id]}
                          onChange={(e) =>
                            setSelected((s) => ({ ...s, [p.id]: e.target.checked }))
                          }
                          aria-label={`Seç ${p.name}`}
                        />
                      </td>
                      <td className="font-medium">
                        <Link
                          href={`/products/${p.id}`}
                          className="text-baykus-text hover:text-baykus-primary uppercase tracking-tight"
                        >
                          {p.name}
                        </Link>
                        <div className="bk-product-chips mt-1">
                          {p.category && <span className="bk-product-chip bk-product-chip--cat">{p.category}</span>}
                          {isService && <span className="bk-product-chip bk-product-chip--svc">HİZMET</span>}
                          {p.brand && <span className="bk-product-chip bk-product-chip--brand">{p.brand}</span>}
                          {!p.is_active && <span className="bk-product-chip bk-product-chip--off">PASİF</span>}
                          {displaySku(p.sku) && (
                            <span className="bk-product-chip bk-product-chip--sku font-mono">{displaySku(p.sku)}</span>
                          )}
                        </div>
                      </td>
                      <td className="text-right tabular-nums whitespace-nowrap">
                        {formatMoney(Number(p.base_price))}
                      </td>
                      <td className="text-right">
                        {isService ? (
                          <span className="text-slate-500 font-medium">Hizmet</span>
                        ) : (
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${stockBadgeClass(total, thr, critical)}`}
                          >
                            {total} ad
                            {critical ? " kritik" : ""}
                          </span>
                        )}
                      </td>
                      <td className="text-right whitespace-nowrap space-x-2">
                        <Link
                          href={`/products/${p.id}/edit`}
                          className="text-baykus-primary hover:underline text-xs"
                        >
                          Düzenle
                        </Link>
                        <Link href={`/products/${p.id}`} className="text-slate-600 hover:underline text-xs">
                          Aç
                        </Link>
                        <button
                          onClick={() => onDelete(p.id)}
                          className="text-red-600 hover:underline text-xs"
                        >
                          Sil
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!loading && visibleItems.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-baykus-muted py-8">
                      Ürün yok
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {(() => {
            const total = counts?.total ?? items.length;
            const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
            const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
            const to = Math.min(total, page * PAGE_SIZE + items.length);
            return (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <span>
                  {loading ? "Yükleniyor…" : `${from}–${to} / ${total} ürün`}
                  {selectedIds.length > 0 ? " · toplamlar seçili satırlar" : " · toplamlar filtreye göre"}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="bk-btn bk-btn-ghost text-xs"
                    disabled={page <= 0 || loading}
                    onClick={() => setPage((n) => Math.max(0, n - 1))}
                  >
                    Önceki
                  </button>
                  <span className="px-2 tabular-nums">
                    {page + 1} / {pages}
                  </span>
                  <button
                    type="button"
                    className="bk-btn bk-btn-ghost text-xs"
                    disabled={page + 1 >= pages || loading}
                    onClick={() => setPage((n) => n + 1)}
                  >
                    Sonraki
                  </button>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {tab === "rapor" && (
        <div className="bk-card p-4 space-y-2">
          <p className="text-sm text-baykus-muted mb-2">
            Stok ve ürün işlemlerini tek merkezden yönetin.
          </p>
          <HubActionsBar
            title="Rapor / Araçlar"
            columns={1}
            actions={[
              { href: "/reports/stock", label: "Stok Durumu Raporu", color: "#2563eb" },
              { href: "/stock/critical", label: "Kritik Stok Listesini Göster", color: "#be123c" },
              { href: "/stock", label: "Stok Yönetimi", color: "#0369a1" },
              { href: "/stock/warehouses", label: "Depolar", color: "#14b8a6" },
              { href: "/stock/count", label: "Stok Sayımı", color: "#22a447" },
              { href: "/products/labels", label: "Barkod / Etiket", color: "#334155" },
            ]}
          />
        </div>
      )}
      <StatusFooter onRefresh={load} />
    </HubSection>
  );
}

export default function ProductsHubPage() {
  return (
    <Suspense fallback={<p className="text-sm text-baykus-muted">Yükleniyor…</p>}>
      <ProductsHubPageInner />
    </Suspense>
  );
}
