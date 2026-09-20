"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import ProductForm, { ProductFormPayload } from "@/components/ProductForm";
import {
  ProductDetail,
  StockMovement,
  apiFetch,
  formatMoney,
  stockBadgeClass,
} from "@/lib/api";

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [direction, setDirection] = useState<"increase" | "decrease">("increase");
  const [qty, setQty] = useState("1");
  const [variantId, setVariantId] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [stockBusy, setStockBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await apiFetch<ProductDetail>(`/api/products/${id}`);
      setProduct(data);
      if (data.variants?.length && !variantId) {
        setVariantId(String(data.variants[0].id));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [id, variantId]);

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

  async function adjustStock(e: FormEvent) {
    e.preventDefault();
    if (!product) return;
    setStockBusy(true);
    setError("");
    try {
      await apiFetch(`/api/products/${id}/stock/adjust`, {
        method: "POST",
        body: JSON.stringify({
          direction,
          quantity: Number(qty),
          variant_id: product.variants?.length ? Number(variantId) : null,
          reason: reason.trim() || null,
          note: note.trim() || null,
          warehouse: product.warehouse || "Ana Depo",
        }),
      });
      setQty("1");
      setReason("");
      setNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stok hareketi başarısız");
    } finally {
      setStockBusy(false);
    }
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
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/products" className="text-sm text-baykus-600 hover:underline">
            ← Ürünler
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">{product.name}</h1>
          <p className="text-slate-500 text-sm font-mono">
            {product.sku}
            {product.brand ? ` · ${product.brand}` : ""}
            {product.category ? ` · ${product.category}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
          >
            {editing ? "Formu Kapat" : "Düzenle"}
          </button>
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
        <div className="space-y-6">
          <div className="grid md:grid-cols-4 gap-4">
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-500">Satış</div>
              <div className="text-lg font-semibold">{formatMoney(Number(product.base_price))}</div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-500">Alış / Maliyet</div>
              <div className="text-lg font-semibold">
                {formatMoney(Number(product.purchase_price || 0))} /{" "}
                {formatMoney(Number(product.cost || 0))}
              </div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-500">Toplam stok</div>
              <div className="text-lg font-semibold">
                {product.product_type === "hizmet" ? (
                  "—"
                ) : (
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-sm font-medium ${stockBadgeClass(total, thr, product.is_critical)}`}
                  >
                    {total}
                    {product.is_critical ? " kritik" : ""}
                  </span>
                )}
              </div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-500">Depo / Eşik</div>
              <div className="text-lg font-semibold">
                {product.warehouse || "Ana Depo"} · {thr}
              </div>
            </div>
          </div>

          {product.description && (
            <div className="rounded-xl border bg-white p-4 shadow-sm text-sm text-slate-700">
              {product.description}
            </div>
          )}

          {product.variants?.length > 0 && (
            <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Varyant</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Renk</th>
                    <th className="px-4 py-3">Beden</th>
                    <th className="px-4 py-3">Baskı</th>
                    <th className="px-4 py-3">Barkod</th>
                    <th className="px-4 py-3">Fiyat</th>
                    <th className="px-4 py-3">Stok</th>
                  </tr>
                </thead>
                <tbody>
                  {product.variants.map((v) => (
                    <tr
                      key={v.id}
                      className={`border-t border-slate-100 ${v.is_critical ? "bg-red-50/50" : ""}`}
                    >
                      <td className="px-4 py-3 font-medium">{v.name}</td>
                      <td className="px-4 py-3 font-mono text-xs">{v.sku}</td>
                      <td className="px-4 py-3">{v.color || "—"}</td>
                      <td className="px-4 py-3">{v.size || "—"}</td>
                      <td className="px-4 py-3">{v.print_type || "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs">{v.barcode || "—"}</td>
                      <td className="px-4 py-3">{formatMoney(Number(v.price))}</td>
                      <td className="px-4 py-3">
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
          )}

          {product.product_type !== "hizmet" && (
            <form
              onSubmit={adjustStock}
              className="rounded-xl border bg-white p-5 shadow-sm space-y-3"
            >
              <h2 className="font-semibold text-slate-800">Stok Hareketi</h2>
              <div className="grid md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Yön</label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={direction}
                    onChange={(e) => setDirection(e.target.value as "increase" | "decrease")}
                  >
                    <option value="increase">Giriş (+)</option>
                    <option value="decrease">Çıkış (−)</option>
                  </select>
                </div>
                {product.variants?.length > 0 && (
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Varyant</label>
                    <select
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={variantId}
                      onChange={(e) => setVariantId(e.target.value)}
                      required
                    >
                      {product.variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} ({v.stock_qty})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Miktar</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Sebep</label>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Alım, sipariş, sayım…"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Not</label>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={stockBusy}
                className="rounded-lg bg-baykus-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                {stockBusy ? "İşleniyor…" : "Stok Güncelle"}
              </button>
            </form>
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
    </div>
  );
}
