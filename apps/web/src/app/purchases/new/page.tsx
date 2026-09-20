"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { Product, ProductDetail, Supplier, apiFetch, formatMoney } from "@/lib/api";

type LineForm = {
  description: string;
  quantity: string;
  unit_cost: string;
  product_id: string;
  variant_id: string;
};

function NewPurchaseForm() {
  const router = useRouter();
  const search = useSearchParams();
  const presetSupplier = search.get("supplier_id") || "";

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productDetails, setProductDetails] = useState<Record<number, ProductDetail>>({});
  const [supplierId, setSupplierId] = useState(presetSupplier);
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [taxAmount, setTaxAmount] = useState("0");
  const [confirmOnSave, setConfirmOnSave] = useState(true);
  const [lines, setLines] = useState<LineForm[]>([
    { description: "", quantity: "1", unit_cost: "0", product_id: "", variant_id: "" },
  ]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch<Supplier[]>("/api/suppliers?active=true"),
      apiFetch<Product[]>("/api/products?active_only=true"),
    ])
      .then(([s, p]) => {
        setSuppliers(s);
        setProducts(p.filter((x) => x.product_type !== "hizmet"));
        if (!presetSupplier && s.length) setSupplierId(String(s[0].id));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Yükleme hatası"));
  }, [presetSupplier]);

  const subtotal = useMemo(
    () =>
      lines.reduce((sum, l) => sum + Number(l.quantity || 0) * Number(l.unit_cost || 0), 0),
    [lines],
  );
  const total = subtotal + Number(taxAmount || 0);

  function setLine(idx: number, patch: Partial<LineForm>) {
    setLines((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function onProductChange(idx: number, productId: string) {
    const product = products.find((p) => String(p.id) === productId);
    if (!productId) {
      setLine(idx, { product_id: "", variant_id: "", description: "", unit_cost: "0" });
      return;
    }
    let detail = productDetails[Number(productId)];
    if (!detail) {
      try {
        detail = await apiFetch<ProductDetail>(`/api/products/${productId}`);
        setProductDetails((m) => ({ ...m, [detail!.id]: detail! }));
      } catch {
        detail = undefined as unknown as ProductDetail;
      }
    }
    const variants = detail?.variants || [];
    setLine(idx, {
      product_id: productId,
      variant_id: variants.length === 1 ? String(variants[0].id) : "",
      description: product
        ? variants.length === 1
          ? `${product.name} — ${variants[0].name}`
          : product.name
        : lines[idx].description,
      unit_cost: product ? String(product.purchase_price ?? product.cost ?? 0) : lines[idx].unit_cost,
    });
  }

  function onVariantChange(idx: number, variantId: string) {
    const product = products.find((p) => String(p.id) === lines[idx].product_id);
    const detail = productDetails[Number(lines[idx].product_id)];
    const variant = detail?.variants?.find((v) => String(v.id) === variantId);
    setLine(idx, {
      variant_id: variantId,
      description:
        product && variant ? `${product.name} — ${variant.name}` : lines[idx].description,
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = {
        supplier_id: Number(supplierId),
        purchase_date: purchaseDate,
        notes: notes.trim() || null,
        tax_amount: Number(taxAmount || 0),
        confirm: confirmOnSave,
        lines: lines.map((l) => ({
          description: l.description.trim(),
          quantity: Number(l.quantity),
          unit_cost: Number(l.unit_cost),
          product_id: l.product_id ? Number(l.product_id) : null,
          variant_id: l.variant_id ? Number(l.variant_id) : null,
        })),
      };
      const created = await apiFetch<{ id: number }>("/api/purchases", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      router.push(`/purchases/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    } finally {
      setLoading(false);
    }
  }

  const input =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-baykus-500";

  return (
    <div className="max-w-4xl">
      <Link href="/purchases" className="text-sm text-baykus-600 hover:underline">
        ← Satın Alma
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mt-2 mb-6">Yeni Satın Alma</h1>
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tedarikçi *</label>
            <select
              required
              className={input}
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">Seçin</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code ? `${s.code} — ` : ""}
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tarih</label>
            <input
              type="date"
              className={input}
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Notlar</label>
            <textarea rows={2} className={input} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Satırlar</h2>
            <button
              type="button"
              className="text-sm text-baykus-700 hover:underline"
              onClick={() =>
                setLines((rows) => [
                  ...rows,
                  { description: "", quantity: "1", unit_cost: "0", product_id: "", variant_id: "" },
                ])
              }
            >
              + Satır ekle
            </button>
          </div>
          {lines.map((line, idx) => {
            const variants = productDetails[Number(line.product_id)]?.variants || [];
            return (
              <div key={idx} className="rounded-lg border border-slate-100 p-3 space-y-2">
                <div className="grid sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Ürün (opsiyonel)</label>
                    <select
                      className={input}
                      value={line.product_id}
                      onChange={(e) => { void onProductChange(idx, e.target.value); }}
                    >
                      <option value="">— Manuel açıklama —</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} — {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Varyant</label>
                    <select
                      className={input}
                      value={line.variant_id}
                      disabled={!variants.length}
                      onChange={(e) => onVariantChange(idx, e.target.value)}
                    >
                      <option value="">{variants.length ? "Seçin" : "—"}</option>
                      {variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} (stok: {v.stock_qty})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid sm:grid-cols-4 gap-2">
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-slate-500 mb-1">Açıklama *</label>
                    <input
                      required
                      className={input}
                      value={line.description}
                      onChange={(e) => setLine(idx, { description: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Miktar</label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      min="0.01"
                      className={input}
                      value={line.quantity}
                      onChange={(e) => setLine(idx, { quantity: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Birim maliyet</label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      min="0"
                      className={input}
                      value={line.unit_cost}
                      onChange={(e) => setLine(idx, { unit_cost: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>
                    Satır:{" "}
                    {formatMoney(Number(line.quantity || 0) * Number(line.unit_cost || 0))}
                  </span>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      className="text-red-600 hover:underline"
                      onClick={() => setLines((rows) => rows.filter((_, i) => i !== idx))}
                    >
                      Sil
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <div className="flex flex-wrap items-end justify-between gap-4 pt-2 border-t border-slate-100">
            <div className="w-40">
              <label className="block text-xs text-slate-500 mb-1">KDV / vergi</label>
              <input
                type="number"
                step="0.01"
                className={input}
                value={taxAmount}
                onChange={(e) => setTaxAmount(e.target.value)}
              />
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Ara toplam {formatMoney(subtotal)}</div>
              <div className="text-lg font-bold tabular-nums">{formatMoney(total)}</div>
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={confirmOnSave}
            onChange={(e) => setConfirmOnSave(e.target.checked)}
          />
          Kaydet ve onayla (stok + tedarikçi borcu)
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-baykus-600 text-white px-5 py-2 text-sm font-medium disabled:opacity-60"
          >
            {loading ? "Kaydediliyor…" : confirmOnSave ? "Kaydet ve Onayla" : "Taslak Kaydet"}
          </button>
          <Link href="/purchases" className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
            İptal
          </Link>
        </div>
      </form>
    </div>
  );
}

export default function NewPurchasePage() {
  return (
    <Suspense fallback={<div className="text-slate-500">Yükleniyor…</div>}>
      <NewPurchaseForm />
    </Suspense>
  );
}
