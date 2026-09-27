"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [priceLists, setPriceLists] = useState<ProductPriceListRef[]>([]);
  const [warehouseStocks, setWarehouseStocks] = useState<
    { warehouse: string; variant_id?: number | null; variant_name?: string | null; variant_sku?: string | null; quantity: number }[]
  >([]);


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
        const wh = await apiFetch<typeof warehouseStocks>(`/api/products/${id}/warehouse-stocks`);
        setWarehouseStocks(wh);
      } catch {
        setWarehouseStocks([]);
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

  const thr = product.critical_stock_threshold ?? 10;
  const total = product.total_stock ?? product.stock_qty;
  const movements: StockMovement[] = product.recent_movements || [];

  return (
    <div className="space-y-2 pb-2">
      <div className="bk-sticky-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] text-baykus-muted mb-0.5">
            <Link href="/products" className="text-baykus-primary hover:underline">Ürün & Stok</Link>
            <span className="mx-1">/</span>
            <span className="font-medium text-baykus-text">{product.sku}</span>
          </div>
          <h1 className="text-lg font-bold text-baykus-text leading-tight">{product.name}</h1>
          <p className="text-baykus-muted text-[11px] font-mono">
            {product.sku}
            {product.brand ? ` · ${product.brand}` : ""}
            {product.category ? ` · ${product.category}` : ""}
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
          <div className="bk-kpi-strip" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
            <div className="bk-kpi-card" style={{ backgroundColor: "#198754" }}>
              <span className="bk-kpi-icon">₺</span>
              <div className="min-w-0 flex-1 text-right">
                <div className="bk-kpi-label">Satış</div>
                <div className="bk-kpi-value truncate">{formatMoney(Number(product.base_price))}</div>
              </div>
            </div>
            <div className="bk-kpi-card" style={{ backgroundColor: "#0f766e" }}>
              <span className="bk-kpi-icon">↓</span>
              <div className="min-w-0 flex-1 text-right">
                <div className="bk-kpi-label">Alış / Maliyet</div>
                <div className="bk-kpi-value truncate text-sm">
                  {formatMoney(Number(product.purchase_price || 0))} / {formatMoney(Number(product.cost || 0))}
                </div>
              </div>
            </div>
            <div className="bk-kpi-card" style={{ backgroundColor: product.is_critical || (product.product_type !== "hizmet" && total < thr) ? "#be123c" : "#334155" }}>
              <span className="bk-kpi-icon">📦</span>
              <div className="min-w-0 flex-1 text-right">
                <div className="bk-kpi-label">Toplam stok</div>
                <div className="bk-kpi-value">
                  {product.product_type === "hizmet" ? "—" : <>{total}{product.is_critical ? " !" : ""}</>}
                </div>
              </div>
            </div>
            <div className="bk-kpi-card" style={{ backgroundColor: "#64748b" }}>
              <span className="bk-kpi-icon">🏷</span>
              <div className="min-w-0 flex-1 text-right">
                <div className="bk-kpi-label">Depo / Eşik</div>
                <div className="bk-kpi-value truncate text-sm">{product.warehouse || "Ana Depo"} · {thr}</div>
              </div>
            </div>
          </div>


          {(product.is_critical || (product.product_type !== "hizmet" && total < thr)) && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
              Kritik stok uyarısı: mevcut {total} / eşik {thr}. Sipariş ve teklif formlarında stok kontrolü yapılır.
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
              <p className="px-4 py-4 text-sm text-baykus-muted">Bu ürün henüz bir fiyat listesinde değil.</p>
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
                    <span className="tabular-nums text-baykus-text">{formatMoney(Number(pl.unit_price))}</span>
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

          {/* Varyant stokları — urun_kartlari_varyant_paneli */}
          <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-sm text-slate-800">Varyant Stokları</h2>
              <div className="text-xs text-slate-500 flex gap-3">
                <span>Satış: {formatMoney(Number(product.base_price))}</span>
                <span>Alış: {formatMoney(Number(product.purchase_price || 0))}</span>
                <span>Maliyet: {formatMoney(Number(product.cost || 0))}</span>
              </div>
            </div>
            {product.variants?.length > 0 ? (
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
                  {product.variants.map((v) => (
                    <tr
                      key={v.id}
                      className={`border-t border-slate-100 ${v.is_critical ? "bg-red-50/50" : ""}`}
                    >
                      <td className="px-4 py-3">{v.size || "—"}</td>
                      <td className="px-4 py-3">{v.color || "—"}</td>
                      <td className="px-4 py-3">{v.print_type || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{v.name}</div>
                        <div className="font-mono text-xs text-slate-500">{v.sku}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{v.barcode || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatMoney(Number(v.price))}</td>
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
                  ))}
                </tbody>
              </table>
              </div>
            ) : (
              <p className="px-4 py-4 text-sm text-slate-500">
                Varyant yok — ana stok: {total} ({product.warehouse || "Ana Depo"})
              </p>
            )}
          </div>

          {/* Stok by warehouse */}
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex justify-between">
              <h2 className="font-semibold text-sm">Depo Bazlı Stok</h2>
              <Link href="/stock/warehouses" className="text-xs text-baykus-primary hover:underline">
                Depo yönetimi
              </Link>
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
                {warehouseStocks.map((w, i) => (
                  <tr key={`${w.warehouse}-${w.variant_id ?? "p"}-${i}`} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium">{w.warehouse}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {w.variant_name || "Ana ürün"}
                      {w.variant_sku ? ` (${w.variant_sku})` : ""}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{w.quantity}</td>
                  </tr>
                ))}
                {warehouseStocks.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center text-baykus-muted py-4">
                      Depo stok satırı yok
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>


          {product.product_type !== "hizmet" && (
            <div className="rounded-xl border border-sky-100 bg-sky-50/60 px-4 py-3 text-sm text-slate-700 flex flex-wrap items-center justify-between gap-2">
              <span>
                Stok girişi tek yol: <strong>Stok Girişi</strong> (miktar · depo · birim maliyet · tarih).
                Çıkış / düzeltme için <Link href="/stock/count" className="text-baykus-primary hover:underline">Stok Sayımı</Link>.
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
                        m.direction === "increase" ? "text-emerald-700 font-medium" : "text-red-700 font-medium"
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
                    {m.note && <span className="text-slate-400">{m.note}</span>}
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
      <StatusFooter onRefresh={load} />
    </div>
  );
}
