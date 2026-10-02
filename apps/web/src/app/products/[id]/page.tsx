"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import ProductForm, { ProductFormPayload } from "@/components/ProductForm";
import {
  ProductDetail,
  StockMovement,
  apiFetch,
  formatMoney,
  stockBadgeClass,
  ProductPriceListRef,
} from "@/lib/api";
import StatusFooter from "@/components/StatusFooter";
import { parseProductDescription } from "@/lib/productMeta";
import { displaySku } from "@/lib/productLabel";
import { sanitizeDisplayNote } from "@/lib/bhNote";
import StockDetailFilters from "@/components/StockDetailFilters";
import {
  EMPTY_STOCK_FILTERS,
  StockFilterState,
  collectFacetOptions,
  filterStockRows,
} from "@/lib/stockFilters";

type WarehouseStockRow = {
  warehouse: string;
  variant_id?: number | null;
  variant_name?: string | null;
  variant_sku?: string | null;
  quantity: number;
  color?: string | null;
  size?: string | null;
  print_type?: string | null;
};

type PriceRow = {
  tarih?: string | null;
  cari?: string;
  varyant?: string;
  miktar?: number;
  birim_fiyat?: number;
  belge_no?: string;
  durum?: string;
  href?: string;
};

type ProductHistoryLite = {
  satislar: PriceRow[];
  alislar: PriceRow[];
};

function variantLabel(name?: string | null, sku?: string | null): string {
  const human = displaySku(sku);
  if (name && human) return `${name} (${human})`;
  if (name) return name;
  if (human) return human;
  return "Ana ürün";
}

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [priceLists, setPriceLists] = useState<ProductPriceListRef[]>([]);
  const [warehouseStocks, setWarehouseStocks] = useState<WarehouseStockRow[]>([]);
  const [stockFilters, setStockFilters] = useState<StockFilterState>({ ...EMPTY_STOCK_FILTERS });
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [historyLite, setHistoryLite] = useState<ProductHistoryLite | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await apiFetch<ProductDetail>(`/api/products/${id}`);
      setProduct(data);
      try {
        const pls = await apiFetch<ProductPriceListRef[]>(`/api/products/${id}/price-lists`);
        setPriceLists(pls);
      } catch {
        setPriceLists([]);
      }
      try {
        const wh = await apiFetch<WarehouseStockRow[]>(`/api/products/${id}/warehouse-stocks`);
        setWarehouseStocks(wh);
      } catch {
        setWarehouseStocks([]);
      }
      try {
        const hist = await apiFetch<ProductHistoryLite>(`/api/products/${id}/history`);
        setHistoryLite({
          satislar: hist.satislar || [],
          alislar: hist.alislar || [],
        });
      } catch {
        setHistoryLite(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [id]);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleUpdate(payload: ProductFormPayload) {
    const updated = await apiFetch<ProductDetail>(`/api/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    setProduct(updated);
    setEditing(false);
  }

  async function onDelete() {
    if (!confirm("Ürünü silmek istiyor musunuz?")) return;
    await apiFetch(`/api/products/${id}`, { method: "DELETE" });
    router.push("/products");
  }

  const thr = product?.critical_stock_threshold ?? 10;
  const total = product ? product.total_stock ?? product.stock_qty : 0;
  const unitCost = product
    ? Number(product.purchase_price || product.cost || 0)
    : 0;
  const stockValue = unitCost * Number(total || 0);
  const humanSku = product ? displaySku(product.sku) : null;
  const movements: StockMovement[] = product?.recent_movements || [];

  const variantFacets = useMemo(() => {
    const fromVariants = collectFacetOptions(product?.variants || []);
    const fromWh = collectFacetOptions(warehouseStocks);
    return {
      colors: Array.from(new Set([...fromVariants.colors, ...fromWh.colors])).sort((a, b) =>
        a.localeCompare(b, "tr"),
      ),
      sizes: Array.from(new Set([...fromVariants.sizes, ...fromWh.sizes])).sort((a, b) =>
        a.localeCompare(b, "tr"),
      ),
      printTypes: Array.from(new Set([...fromVariants.printTypes, ...fromWh.printTypes])).sort(
        (a, b) => a.localeCompare(b, "tr"),
      ),
      warehouses: fromWh.warehouses.length
        ? fromWh.warehouses
        : collectFacetOptions(
            (product?.variants || []).map((v) => ({
              ...v,
              warehouse: product?.warehouse || "Ana Depo",
            })),
          ).warehouses,
    };
  }, [product?.variants, product?.warehouse, warehouseStocks]);

  const visibleVariants = useMemo(() => {
    const all = product?.variants || [];
    return filterStockRows(all, stockFilters);
  }, [product?.variants, stockFilters]);

  const visibleWarehouseStocks = useMemo(() => {
    return filterStockRows(
      warehouseStocks.map((w) => ({
        ...w,
        sku: w.variant_sku || undefined,
        stock_qty: w.quantity,
      })),
      stockFilters,
    );
  }, [warehouseStocks, stockFilters]);

  /** BizimHesap "Tüm Stoklar" — only warehouses+variants with qty>0 */
  const inStockRows = useMemo(
    () => warehouseStocks.filter((w) => Number(w.quantity) > 0),
    [warehouseStocks],
  );

  const zeroVariantCount = useMemo(() => {
    const all = product?.variants || [];
    return all.filter((v) => Number(v.stock_qty) <= 0).length;
  }, [product?.variants]);

  if (!product && !error) {
    return <div className="text-slate-500">Yükleniyor…</div>;
  }

  if (!product) {
    return (
      <div>
        <p className="text-red-600 mb-4">{error}</p>
        <Link href="/products" className="text-baykus-600 hover:underline">
          ← Listeye dön
        </Link>
      </div>
    );
  }

  function recentPriceTable(rows: PriceRow[], empty: string) {
    const slice = rows.slice(0, 8);
    if (!slice.length) {
      return <p className="px-4 py-4 text-sm text-baykus-muted">{empty}</p>;
    }
    return (
      <div className="bk-table-wrap">
        <table className="bk-table text-xs">
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Cari</th>
              <th>Varyant</th>
              <th className="text-right">Miktar</th>
              <th className="text-right">Birim</th>
              <th>Belge</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((r, i) => (
              <tr key={`${r.belge_no}-${i}`}>
                <td className="whitespace-nowrap">{r.tarih || "—"}</td>
                <td>{r.cari || "—"}</td>
                <td className="text-slate-500">{r.varyant || "—"}</td>
                <td className="text-right tabular-nums">{r.miktar ?? "—"}</td>
                <td className="text-right tabular-nums font-medium">
                  {formatMoney(Number(r.birim_fiyat || 0))}
                </td>
                <td>
                  {r.href ? (
                    <Link href={r.href} className="text-baykus-primary hover:underline">
                      {r.belge_no || "→"}
                    </Link>
                  ) : (
                    r.belge_no || "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-2 pb-2">
      <div className="bk-sticky-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] text-baykus-muted mb-0.5">
            <Link href="/products" className="text-baykus-primary hover:underline">
              Ürün & Stok
            </Link>
            <span className="mx-1">/</span>
            <span className="font-medium text-baykus-text">{product.name}</span>
          </div>
          <h1 className="text-lg font-bold text-baykus-text leading-tight">{product.name}</h1>
          <p className="text-baykus-muted text-[11px]">
            {humanSku ? <span className="font-mono">{humanSku}</span> : null}
            {humanSku && (product.brand || product.category) ? " · " : null}
            {product.brand ? product.brand : null}
            {product.brand && product.category ? " · " : null}
            {product.category ? product.category : null}
            {!humanSku && !product.brand && !product.category ? (
              <span className="text-slate-400">SKU gizli (BH import)</span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/products/${id}/edit`}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ background: "#22a447" }}
          >
            Düzenle
          </Link>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
          >
            {editing ? "Hızlı formu kapat" : "Hızlı düzenle"}
          </button>
          <Link
            href={`/stock/entry?product_id=${id}`}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ background: "#0369a1" }}
          >
            Stok Girişi
          </Link>
          <Link
            href={`/products/labels?product_id=${id}`}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ background: "#0ea5e9" }}
          >
            Barkod / Etiket Yazdır
          </Link>
          <Link
            href={`/products/${id}/history`}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ background: "#61cda5" }}
          >
            Stok Ekstresi / Önceki Fiyatlar
          </Link>
          <Link
            href="/products?tab=variants"
            className="rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ background: "#334155" }}
          >
            Hızlı Varyant / Stok
          </Link>
          <Link
            href="/stock/warehouses"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
          >
            Depolar
          </Link>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg border border-red-200 text-red-700 px-4 py-2 text-sm"
          >
            Sil
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}

      {!editing && (
        <div className="space-y-3">
          {/* BH-style summary: Alış / Satış / Toplam stok / Stok değeri */}
          <div className="bk-kpi-strip" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
            <div className="bk-kpi-card" style={{ backgroundColor: "#0f766e" }}>
              <span className="bk-kpi-icon">↓</span>
              <div className="min-w-0 flex-1 text-right">
                <div className="bk-kpi-label">Alış</div>
                <div className="bk-kpi-value truncate">
                  {formatMoney(Number(product.purchase_price || 0))}
                </div>
              </div>
            </div>
            <div className="bk-kpi-card" style={{ backgroundColor: "#198754" }}>
              <span className="bk-kpi-icon">₺</span>
              <div className="min-w-0 flex-1 text-right">
                <div className="bk-kpi-label">Satış</div>
                <div className="bk-kpi-value truncate">{formatMoney(Number(product.base_price))}</div>
              </div>
            </div>
            <button
              type="button"
              className="bk-kpi-card text-left"
              style={{
                backgroundColor:
                  product.is_critical ||
                  (product.product_type !== "hizmet" && total < thr)
                    ? "#be123c"
                    : "#334155",
                cursor: product.product_type === "hizmet" ? "default" : "pointer",
              }}
              onClick={() => {
                if (product.product_type !== "hizmet") setStockModalOpen(true);
              }}
              title={
                product.product_type === "hizmet"
                  ? undefined
                  : "Tüm stokları göster (sadece stoğu olanlar)"
              }
            >
              <span className="bk-kpi-icon">📦</span>
              <div className="min-w-0 flex-1 text-right">
                <div className="bk-kpi-label">Toplam stok</div>
                <div className="bk-kpi-value">
                  {product.product_type === "hizmet" ? (
                    "—"
                  ) : (
                    <>
                      {total}
                      {product.is_critical ? " !" : ""}
                      <span className="ml-1 text-[10px] font-normal opacity-80">▾</span>
                    </>
                  )}
                </div>
              </div>
            </button>
            <button
              type="button"
              className="bk-kpi-card text-left"
              style={{ backgroundColor: "#7c3aed", cursor: "pointer" }}
              onClick={() => {
                if (product.product_type !== "hizmet") setStockModalOpen(true);
              }}
              title="Tüm stokları göster (sadece stoğu olanlar)"
            >
              <span className="bk-kpi-icon">🏷</span>
              <div className="min-w-0 flex-1 text-right">
                <div className="bk-kpi-label">Stok değeri</div>
                <div className="bk-kpi-value truncate text-sm">
                  {product.product_type === "hizmet" ? "—" : formatMoney(stockValue)}
                </div>
              </div>
            </button>
          </div>

          {(product.is_critical ||
            (product.product_type !== "hizmet" && total < thr)) && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
              Kritik stok uyarısı: mevcut {total} / eşik {thr}. Sipariş ve teklif formlarında
              stok kontrolü yapılır.
            </div>
          )}

          <div className="rounded-xl border border-baykus-line bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-baykus-line flex items-center justify-between">
              <h2 className="font-semibold text-sm text-baykus-text">Bağlı fiyat listeleri</h2>
              <Link href="/price-lists" className="text-xs text-baykus-primary hover:underline">
                Fiyat listeleri
              </Link>
            </div>
            {priceLists.length === 0 ? (
              <p className="px-4 py-4 text-sm text-baykus-muted">
                Bu ürün henüz bir fiyat listesinde değil.
              </p>
            ) : (
              <ul className="divide-y divide-baykus-line text-sm">
                {priceLists.map((pl) => (
                  <li key={pl.price_list_id} className="px-4 py-2.5 flex justify-between gap-3">
                    <Link
                      href={`/price-lists/${pl.price_list_id}`}
                      className="font-medium text-baykus-primary hover:underline"
                    >
                      {pl.price_list_name}
                      {!pl.is_active ? " (pasif)" : ""}
                    </Link>
                    <span className="tabular-nums text-baykus-text">
                      {formatMoney(Number(pl.unit_price))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {(() => {
            const { text: descText } = parseProductDescription(product.description);
            if (!descText.trim()) return null;
            return (
              <div className="rounded-xl border bg-white p-4 shadow-sm text-sm text-slate-700 whitespace-pre-wrap">
                {descText}
              </div>
            );
          })()}

          {/* Varyant stokları — default in-stock only (BH parity) */}
          <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
            <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <h2 className="font-semibold text-sm text-slate-800">Varyant Stokları</h2>
                {stockFilters.inStockOnly && zeroVariantCount > 0 ? (
                  <span className="text-xs text-slate-400">({zeroVariantCount} sıfır gizli)</span>
                ) : null}
              </div>
              <div className="text-xs text-slate-500 flex gap-3">
                <span>Satış: {formatMoney(Number(product.base_price))}</span>
                <span>Alış: {formatMoney(Number(product.purchase_price || 0))}</span>
                <span>Maliyet: {formatMoney(Number(product.cost || 0))}</span>
                <button
                  type="button"
                  className="text-baykus-primary hover:underline font-medium"
                  onClick={() => setStockModalOpen(true)}
                >
                  Tüm Stoklar
                </button>
              </div>
            </div>
            <div className="px-3 pt-2">
              <StockDetailFilters
                value={stockFilters}
                onChange={setStockFilters}
                facets={variantFacets}
              />
            </div>
            {product.variants?.length > 0 ? (
              visibleVariants.length > 0 ? (
                <div className="bk-table-wrap">
                  <table className="bk-table">
                    <thead>
                      <tr>
                        <th>BEDEN</th>
                        <th>RENK</th>
                        <th>Baskı</th>
                        <th>Varyant / SKU</th>
                        <th>Barkod</th>
                        <th className="text-right">Satış Fiyatı</th>
                        <th className="text-right">Alış Fiyatı</th>
                        <th className="text-right">Stok</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleVariants.map((v) => {
                        const vSku = displaySku(v.sku);
                        return (
                          <tr
                            key={v.id}
                            className={`border-t border-slate-100 ${v.is_critical ? "bg-red-50/50" : ""}`}
                          >
                            <td className="px-4 py-3">{v.size || "—"}</td>
                            <td className="px-4 py-3">{v.color || "—"}</td>
                            <td className="px-4 py-3">{v.print_type || "—"}</td>
                            <td className="px-4 py-3">
                              <div className="font-medium">{v.name}</div>
                              {vSku ? (
                                <div className="font-mono text-xs text-slate-500">{vSku}</div>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs">{v.barcode || "—"}</td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {formatMoney(Number(v.price))}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                              {formatMoney(Number(product.purchase_price || 0))}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${stockBadgeClass(v.stock_qty, thr, v.is_critical)}`}
                              >
                                {v.stock_qty}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-4 py-4 text-sm text-slate-500">
                  Stoğu olan varyant yok.{" "}
                  <button
                    type="button"
                    className="text-baykus-primary hover:underline"
                    onClick={() => setStockFilters((f) => ({ ...f, inStockOnly: false }))}
                  >
                    Tüm varyantları göster
                  </button>
                </p>
              )
            ) : (
              <p className="px-4 py-4 text-sm text-slate-500">
                Varyant yok — ana stok: {total} ({product.warehouse || "Ana Depo"})
              </p>
            )}
          </div>

          {/* Stok by warehouse — same in-stock filter */}
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center gap-2">
              <h2 className="font-semibold text-sm">Depo Bazlı Stok</h2>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="text-xs text-baykus-primary hover:underline font-medium"
                  onClick={() => setStockModalOpen(true)}
                >
                  Tüm Stoklar ({inStockRows.length})
                </button>
                <Link href="/stock/warehouses" className="text-xs text-baykus-primary hover:underline">
                  Depo yönetimi
                </Link>
              </div>
            </div>
            <div className="bk-table-wrap">
              <table className="bk-table">
                <thead>
                  <tr>
                    <th>Depo</th>
                    <th>Varyant</th>
                    <th className="text-right">Miktar</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleWarehouseStocks.map((w, i) => (
                    <tr
                      key={`${w.warehouse}-${w.variant_id ?? "p"}-${i}`}
                      className="border-t border-slate-100"
                    >
                      <td className="px-4 py-2 font-medium">{w.warehouse}</td>
                      <td className="px-4 py-2 text-slate-600">
                        {variantLabel(w.variant_name, w.variant_sku)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">
                        {w.quantity}
                      </td>
                    </tr>
                  ))}
                  {visibleWarehouseStocks.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-center text-baykus-muted py-4">
                        {warehouseStocks.length === 0
                          ? "Depo stok satırı yok"
                          : "Stoğu olan depo/varyant yok — «Stokta olanlar» işaretini kaldırın"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Previous sales / purchases — BH product card parity */}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                <h2 className="font-semibold text-sm">Önceki Satışlar</h2>
                <Link
                  href={`/products/${id}/history`}
                  className="text-xs text-baykus-primary hover:underline"
                >
                  Tümü ({historyLite?.satislar?.length || 0})
                </Link>
              </div>
              {recentPriceTable(
                historyLite?.satislar || [],
                "Bu ürün için önceki satış kaydı bulunmuyor.",
              )}
            </div>
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                <h2 className="font-semibold text-sm">Önceki Alışlar</h2>
                <Link
                  href={`/products/${id}/history`}
                  className="text-xs text-baykus-primary hover:underline"
                >
                  Tümü ({historyLite?.alislar?.length || 0})
                </Link>
              </div>
              {recentPriceTable(
                historyLite?.alislar || [],
                "Bu ürün için önceki alış kaydı bulunmuyor.",
              )}
            </div>
          </div>

          {product.product_type !== "hizmet" && (
            <div className="rounded-xl border border-sky-100 bg-sky-50/60 px-4 py-3 text-sm text-slate-700 flex flex-wrap items-center justify-between gap-2">
              <span>
                Stok girişi tek yol: <strong>Stok Girişi</strong> (miktar · depo · birim maliyet ·
                tarih). Çıkış / düzeltme için{" "}
                <Link href="/stock/count" className="text-baykus-primary hover:underline">
                  Stok Sayımı
                </Link>
                .
              </span>
              <Link
                href={`/stock/entry?product_id=${id}`}
                className="rounded-lg px-3 py-1.5 text-xs font-bold text-white"
                style={{ background: "#0369a1" }}
              >
                Stok Girişi →
              </Link>
            </div>
          )}

          {movements.length > 0 && (
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <h2 className="font-semibold text-sm mb-3">Stok Hareket Geçmişi</h2>
              <ul className="space-y-2 text-sm text-slate-600">
                {movements.map((m) => (
                  <li key={m.id} className="flex flex-wrap gap-2 border-b border-slate-50 pb-2">
                    <span className="text-slate-400 whitespace-nowrap">
                      {new Date(m.created_at).toLocaleString("tr-TR")}
                    </span>
                    <span
                      className={
                        m.direction === "increase"
                          ? "text-emerald-700 font-medium"
                          : "text-red-700 font-medium"
                      }
                    >
                      {m.direction === "increase" ? "+" : "−"}
                      {m.quantity}
                    </span>
                    <span>
                      {m.qty_before} → {m.qty_after}
                    </span>
                    {m.variant_name && <span className="text-slate-500">({m.variant_name})</span>}
                    {m.reason && <span>— {m.reason}</span>}
                    {(() => { const n = sanitizeDisplayNote(m.note); return n ? <span className="text-slate-400">{n}</span> : null; })()}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {editing && (
        <ProductForm
          initial={product}
          submitLabel="Güncelle"
          onSubmit={handleUpdate}
          onCancel={() => setEditing(false)}
        />
      )}

      {/* BizimHesap "Tüm Stoklar" — warehouses+variants with qty>0 only */}
      {stockModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tum-stoklar-title"
          onClick={() => setStockModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-lg bg-white shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#334155] text-white px-4 py-3 flex items-center justify-between">
              <div>
                <div id="tum-stoklar-title" className="font-bold text-sm tracking-wide">
                  TÜM STOKLAR
                </div>
                <div className="text-[11px] text-slate-300">
                  {product.name}
                  {humanSku ? ` · ${humanSku}` : ""} — yalnızca stoğu olan depo/varyant
                </div>
              </div>
              <button
                type="button"
                className="text-2xl leading-none px-2"
                onClick={() => setStockModalOpen(false)}
                aria-label="Kapat"
              >
                ×
              </button>
            </div>
            <div className="p-0 max-h-[60vh] overflow-auto">
              {inStockRows.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">
                  Stoğu olan depo/varyant yok.
                </p>
              ) : (
                <table className="bk-table text-sm w-full">
                  <thead>
                    <tr>
                      <th>Depo</th>
                      <th>Varyant</th>
                      <th className="text-right">Miktar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inStockRows.map((w, i) => (
                      <tr key={`modal-${w.warehouse}-${w.variant_id ?? "p"}-${i}`}>
                        <td className="px-4 py-2 font-medium">{w.warehouse}</td>
                        <td className="px-4 py-2 text-slate-600">
                          {variantLabel(w.variant_name, w.variant_sku)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums font-semibold">
                          {w.quantity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-slate-50">
                      <td className="px-4 py-2 font-semibold" colSpan={2}>
                        Toplam
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-bold">{total}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
            <div className="flex justify-end gap-2 bg-slate-50 px-4 py-3 border-t">
              <button
                type="button"
                className="rounded-lg px-4 py-1.5 text-xs font-semibold text-white"
                style={{ background: "#334155" }}
                onClick={() => setStockModalOpen(false)}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      <StatusFooter onRefresh={load} />
    </div>
  );
}
