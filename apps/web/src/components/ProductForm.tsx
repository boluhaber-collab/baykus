"use client";

import { FormEvent, useState } from "react";
import { ProductDetail, ProductVariant } from "@/lib/api";

export type VariantFormRow = {
  key: string;
  name: string;
  sku: string;
  color: string;
  size: string;
  print_type: string;
  barcode: string;
  price: string;
  stock_qty: string;
};

export type ProductFormPayload = {
  sku: string;
  name: string;
  category: string | null;
  brand: string | null;
  supplier_name: string | null;
  product_type: string;
  description: string | null;
  base_price: number;
  purchase_price: number;
  cost: number;
  photo_url: string | null;
  is_active: boolean;
  critical_stock_threshold: number;
  warehouse: string | null;
  stock_qty: number;
  variants: {
    name: string;
    sku: string;
    color: string | null;
    size: string | null;
    print_type: string | null;
    barcode: string | null;
    price: number;
    stock_qty: number;
  }[];
};

type Props = {
  initial?: Partial<ProductDetail> | null;
  submitLabel: string;
  onSubmit: (payload: ProductFormPayload) => Promise<void>;
  onCancel?: () => void;
};

function emptyVariant(skuPrefix = ""): VariantFormRow {
  return {
    key: Math.random().toString(36).slice(2),
    name: "",
    sku: skuPrefix ? `${skuPrefix}-` : "",
    color: "",
    size: "",
    print_type: "",
    barcode: "",
    price: "0",
    stock_qty: "0",
  };
}

function fromVariant(v: ProductVariant): VariantFormRow {
  return {
    key: String(v.id),
    name: v.name || "",
    sku: v.sku || "",
    color: v.color || "",
    size: v.size || "",
    print_type: v.print_type || "",
    barcode: v.barcode || "",
    price: String(v.price ?? 0),
    stock_qty: String(v.stock_qty ?? 0),
  };
}

export default function ProductForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [sku, setSku] = useState(initial?.sku || "");
  const [name, setName] = useState(initial?.name || "");
  const [category, setCategory] = useState(initial?.category || "");
  const [brand, setBrand] = useState(initial?.brand || "");
  const [supplier, setSupplier] = useState(initial?.supplier_name || "");
  const [productType, setProductType] = useState(initial?.product_type || "stoklu");
  const [description, setDescription] = useState(initial?.description || "");
  const [basePrice, setBasePrice] = useState(String(initial?.base_price ?? 0));
  const [purchasePrice, setPurchasePrice] = useState(String(initial?.purchase_price ?? 0));
  const [cost, setCost] = useState(String(initial?.cost ?? 0));
  const [photoUrl, setPhotoUrl] = useState(initial?.photo_url || "");
  const [isActive, setIsActive] = useState(initial?.is_active !== false);
  const [threshold, setThreshold] = useState(String(initial?.critical_stock_threshold ?? 10));
  const [warehouse, setWarehouse] = useState(initial?.warehouse || "Ana Depo");
  const [stockQty, setStockQty] = useState(String(initial?.stock_qty ?? 0));
  const [variants, setVariants] = useState<VariantFormRow[]>(
    initial?.variants?.length ? initial.variants.map(fromVariant) : [],
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function updateVariant(key: string, patch: Partial<VariantFormRow>) {
    setVariants((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload: ProductFormPayload = {
        sku: sku.trim(),
        name: name.trim(),
        category: category.trim() || null,
        brand: brand.trim() || null,
        supplier_name: supplier.trim() || null,
        product_type: productType,
        description: description.trim() || null,
        base_price: Number(basePrice) || 0,
        purchase_price: Number(purchasePrice) || 0,
        cost: Number(cost) || 0,
        photo_url: photoUrl.trim() || null,
        is_active: isActive,
        critical_stock_threshold: Number(threshold) || 0,
        warehouse: warehouse.trim() || "Ana Depo",
        stock_qty: Number(stockQty) || 0,
        variants: variants
          .filter((v) => v.name.trim() && v.sku.trim())
          .map((v) => ({
            name: v.name.trim(),
            sku: v.sku.trim(),
            color: v.color.trim() || null,
            size: v.size.trim() || null,
            print_type: v.print_type.trim() || null,
            barcode: v.barcode.trim() || null,
            price: Number(v.price) || 0,
            stock_qty: Number(v.stock_qty) || 0,
          })),
      };
      await onSubmit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    } finally {
      setLoading(false);
    }
  }

  const input =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-baykus-500";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <h2 className="font-semibold text-slate-800">Ürün Bilgileri</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">SKU / Kod *</label>
            <input className={input} value={sku} onChange={(e) => setSku(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Ad *</label>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Kategori</label>
            <input className={input} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Giyim, Promosyon…" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Marka</label>
            <input className={input} value={brand} onChange={(e) => setBrand(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tedarikçi</label>
            <input className={input} value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tür</label>
            <select className={input} value={productType} onChange={(e) => setProductType(e.target.value)}>
              <option value="stoklu">Stoklu ürün</option>
              <option value="hizmet">Hizmet</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Satış fiyatı</label>
            <input type="number" step="0.01" className={input} value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Alış fiyatı</label>
            <input type="number" step="0.01" className={input} value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Maliyet</label>
            <input type="number" step="0.01" className={input} value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Kritik stok eşiği</label>
            <input type="number" className={input} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Depo</label>
            <input className={input} value={warehouse} onChange={(e) => setWarehouse(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Foto URL</label>
            <input className={input} value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} />
          </div>
          {productType === "stoklu" && variants.length === 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Stok (varyantsız)</label>
              <input type="number" className={input} value={stockQty} onChange={(e) => setStockQty(e.target.value)} />
            </div>
          )}
          <div className="flex items-center gap-2 pt-6">
            <input
              id="is_active"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-slate-300"
            />
            <label htmlFor="is_active" className="text-sm text-slate-700">
              Aktif
            </label>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Açıklama</label>
          <textarea
            rows={2}
            className={input}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>

      {productType === "stoklu" && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Varyantlar</h2>
            <button
              type="button"
              onClick={() => setVariants((v) => [...v, emptyVariant(sku)])}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              + Varyant
            </button>
          </div>
          {variants.length === 0 && (
            <p className="text-sm text-slate-400">Varyant yok — ürün seviyesinde stok kullanılır.</p>
          )}
          <div className="space-y-3">
            {variants.map((v) => (
              <div key={v.key} className="rounded-lg border border-slate-100 bg-slate-50 p-3 grid md:grid-cols-4 gap-2">
                <input className={input} placeholder="Ad *" value={v.name} onChange={(e) => updateVariant(v.key, { name: e.target.value })} />
                <input className={input} placeholder="SKU *" value={v.sku} onChange={(e) => updateVariant(v.key, { sku: e.target.value })} />
                <input className={input} placeholder="Renk" value={v.color} onChange={(e) => updateVariant(v.key, { color: e.target.value })} />
                <input className={input} placeholder="Beden" value={v.size} onChange={(e) => updateVariant(v.key, { size: e.target.value })} />
                <input className={input} placeholder="Baskı türü" value={v.print_type} onChange={(e) => updateVariant(v.key, { print_type: e.target.value })} />
                <input className={input} placeholder="Barkod" value={v.barcode} onChange={(e) => updateVariant(v.key, { barcode: e.target.value })} />
                <input className={input} type="number" step="0.01" placeholder="Fiyat" value={v.price} onChange={(e) => updateVariant(v.key, { price: e.target.value })} />
                <div className="flex gap-2">
                  <input className={input} type="number" placeholder="Stok" value={v.stock_qty} onChange={(e) => updateVariant(v.key, { stock_qty: e.target.value })} />
                  <button
                    type="button"
                    onClick={() => setVariants((rows) => rows.filter((r) => r.key !== v.key))}
                    className="rounded-lg border border-red-200 text-red-600 px-2 text-sm"
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-baykus-600 text-white px-5 py-2.5 text-sm font-medium disabled:opacity-60"
        >
          {loading ? "Kaydediliyor…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm">
            İptal
          </button>
        )}
      </div>
    </form>
  );
}
