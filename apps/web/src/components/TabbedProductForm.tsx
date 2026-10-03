"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { ProductDetail, ProductVariant } from "@/lib/api";
import { displayCode, displaySku, isBhSyncCode, maskBhSyncValue } from "@/lib/productLabel";
import {
  ProductMeta,
  SALES_UNITS,
  VAT_RATES,
  parseProductDescription,
  serializeProductDescription,
} from "@/lib/productMeta";
import { ProductFormPayload, VariantFormRow } from "@/components/ProductForm";

type TabId =
  | "definition"
  | "pricing"
  | "other"
  | "images"
  | "variants"
  | "linked";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "definition", label: "ÜRÜN / HİZMET TANIMI", icon: "🏷" },
  { id: "pricing", label: "FİYATLANDIRMA", icon: "₺" },
  { id: "other", label: "DİĞER BİLGİLER", icon: "☰" },
  { id: "images", label: "RESİMLER", icon: "🖼" },
  { id: "variants", label: "VARYANT", icon: "△" },
  { id: "linked", label: "BAĞLI ÜRÜNLER", icon: "⛓" },
];

type Props = {
  initial?: Partial<ProductDetail> | null;
  mode: "create" | "edit";
  onSubmit: (payload: ProductFormPayload) => Promise<void>;
  onCancel: () => void;
  busy?: boolean;
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

export default function TabbedProductForm({
  initial,
  mode,
  onSubmit,
  onCancel,
  busy,
}: Props) {
  const parsed = useMemo(
    () => parseProductDescription(initial?.description),
    [initial?.description],
  );

  const [tab, setTab] = useState<TabId>("definition");
  const [sku, setSku] = useState(initial?.sku || "");
  const [name, setName] = useState(initial?.name || "");
  const [category, setCategory] = useState(initial?.category || "");
  const [brand, setBrand] = useState(initial?.brand || "");
  const [supplier, setSupplier] = useState(initial?.supplier_name || "");
  const [productType, setProductType] = useState(initial?.product_type || "stoklu");
  const [descText, setDescText] = useState(parsed.text);
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

  const [salesUnit, setSalesUnit] = useState(parsed.meta.sales_unit || "Adet");
  const [isEcommerce, setIsEcommerce] = useState(!!parsed.meta.is_ecommerce);
  const [saleVat, setSaleVat] = useState(String(parsed.meta.sale_vat ?? 20));
  const [saleVatIncluded, setSaleVatIncluded] = useState(
    parsed.meta.sale_vat_included ? "dahil" : "haric",
  );
  const [purchaseVat, setPurchaseVat] = useState(String(parsed.meta.purchase_vat ?? 20));
  const [purchaseVatIncluded, setPurchaseVatIncluded] = useState(
    parsed.meta.purchase_vat_included ? "dahil" : "haric",
  );
  const [purchaseDiscount, setPurchaseDiscount] = useState(
    String(parsed.meta.purchase_discount ?? 0),
  );
  const [oivRate, setOivRate] = useState(parsed.meta.oiv_rate || "Ö.İ.V. yok");
  const [otvType, setOtvType] = useState(parsed.meta.otv_type || "Ö.T.V. Yok");
  const [purchaseOtv, setPurchaseOtv] = useState(
    parsed.meta.purchase_otv_rate != null ? String(parsed.meta.purchase_otv_rate) : "",
  );
  const [linkedIds, setLinkedIds] = useState(
    (parsed.meta.linked_product_ids || []).join(", "),
  );

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function updateVariant(key: string, patch: Partial<VariantFormRow>) {
    setVariants((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError("");
    try {
      const meta: ProductMeta = {
        sales_unit: salesUnit || "Adet",
        is_ecommerce: isEcommerce,
        sale_vat: saleVat === "" ? null : Number(saleVat),
        sale_vat_included: saleVatIncluded === "dahil",
        purchase_vat: purchaseVat === "" ? null : Number(purchaseVat),
        purchase_vat_included: purchaseVatIncluded === "dahil",
        purchase_discount: purchaseDiscount === "" ? null : Number(purchaseDiscount),
        oiv_rate: oivRate || null,
        otv_type: otvType || null,
        purchase_otv_rate: purchaseOtv === "" ? null : Number(purchaseOtv),
        linked_product_ids: linkedIds
          .split(/[,\s]+/)
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n) && n > 0),
      };
      const payload: ProductFormPayload = {
        sku: sku.trim(),
        name: name.trim(),
        category: category.trim() || null,
        brand: brand.trim() || null,
        supplier_name: supplier.trim() || null,
        product_type: productType,
        description: serializeProductDescription(descText, meta),
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
      if (!payload.sku || !payload.name) {
        setError("SKU ve ürün adı zorunlu");
        setTab("definition");
        return;
      }
      await onSubmit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    } finally {
      setLoading(false);
    }
  }

  const input = "bk-input";
  const saving = loading || !!busy;

  return (
    <form onSubmit={handleSubmit} data-baykus-save className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="bk-btn text-white font-bold text-sm px-4 py-2"
          style={{ backgroundColor: "#22a447" }}
        >
          ✓ Kaydet
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="bk-btn text-white font-bold text-sm px-4 py-2"
          style={{ backgroundColor: "#0ea5e9" }}
        >
          ← Geri Dön
        </button>
        <span className="text-xs text-baykus-muted ml-2">
          {mode === "create" ? "Yeni ürün / hizmet" : `Düzenle${displaySku(initial?.sku) ? ` · ${displaySku(initial?.sku)}` : ""}`}
        </span>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}

      <div className="bk-product-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`bk-product-tab ${tab === t.id ? "active" : ""}`}
          >
            <span className="opacity-80">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="bk-card p-4 space-y-4">
        {tab === "definition" && (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Ürün Adı *</label>
                <input className={input} value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Ürün Tipi</label>
                <select className={input} value={productType} onChange={(e) => setProductType(e.target.value)}>
                  <option value="stoklu">Stoklu ürün</option>
                  <option value="hizmet">Hizmet</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">SKU / Kod{isBhSyncCode(sku) ? "" : " *"}</label>
                <input
                  className={input}
                  value={maskBhSyncValue(sku)}
                  onChange={(e) => setSku(e.target.value)}
                  required={!isBhSyncCode(sku)}
                  placeholder={isBhSyncCode(sku) ? "Senkron kodu gizli" : undefined}
                />
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Satış Birimi</label>
                <select className={input} value={salesUnit} onChange={(e) => setSalesUnit(e.target.value)}>
                  {SALES_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Şemada ayrı kolon yok — description meta JSON içinde saklanır.
                </p>
              </div>
              <label className="flex items-start gap-2 pt-2">
                <input
                  type="checkbox"
                  checked={isEcommerce}
                  onChange={(e) => setIsEcommerce(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300"
                />
                <span>
                  <span className="text-sm text-slate-800 font-medium">E-Ticaret Ürünü?</span>
                  <span className="block text-[11px] text-slate-400">
                    İşaretlenirse e-ticaret vitrininde görünür (bayrak; canlı sync yok).
                  </span>
                </span>
              </label>
            </div>
          </div>
        )}

        {tab === "pricing" && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-800 border-b pb-1">Satış</h3>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Satış Fiyatı</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    className={input}
                    value={basePrice}
                    onChange={(e) => setBasePrice(e.target.value)}
                  />
                  <span className="bk-input w-16 flex items-center justify-center bg-slate-50">TL</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Satış KDV Oranı (%)</label>
                <select className={input} value={saleVat} onChange={(e) => setSaleVat(e.target.value)}>
                  {VAT_RATES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Satış Fiyatına KDV Dahil mi?
                </label>
                <select
                  className={input}
                  value={saleVatIncluded}
                  onChange={(e) => setSaleVatIncluded(e.target.value)}
                >
                  <option value="haric">KDV hariç</option>
                  <option value="dahil">KDV dahil</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Ö.İ.V. Oranı (%)</label>
                <select className={input} value={oivRate} onChange={(e) => setOivRate(e.target.value)}>
                  <option>Ö.İ.V. yok</option>
                  <option>1</option>
                  <option>5</option>
                  <option>10</option>
                  <option>25</option>
                </select>
                <p className="text-[11px] text-slate-400">özel iletişim vergisi — meta JSON</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Ö.T.V. Tipi</label>
                <select className={input} value={otvType} onChange={(e) => setOtvType(e.target.value)}>
                  <option>Ö.T.V. Yok</option>
                  <option>Liste bedeli üzerinden</option>
                  <option>Maktu</option>
                </select>
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-800 border-b pb-1">Alış</h3>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Alış Fiyatı</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    className={input}
                    value={purchasePrice}
                    onChange={(e) => setPurchasePrice(e.target.value)}
                  />
                  <span className="bk-input w-16 flex items-center justify-center bg-slate-50">TL</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Alış KDV Oranı (%)</label>
                <select
                  className={input}
                  value={purchaseVat}
                  onChange={(e) => setPurchaseVat(e.target.value)}
                >
                  {VAT_RATES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Alış Fiyatına KDV Dahil mi?
                </label>
                <select
                  className={input}
                  value={purchaseVatIncluded}
                  onChange={(e) => setPurchaseVatIncluded(e.target.value)}
                >
                  <option value="haric">KDV hariç</option>
                  <option value="dahil">KDV dahil</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Alış İskontosu (%)</label>
                <input
                  type="number"
                  step="0.01"
                  className={input}
                  value={purchaseDiscount}
                  onChange={(e) => setPurchaseDiscount(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Alış ÖTV Oranı (%)</label>
                <input
                  type="number"
                  step="0.01"
                  className={input}
                  value={purchaseOtv}
                  onChange={(e) => setPurchaseOtv(e.target.value)}
                  placeholder="—"
                />
                <p className="text-[11px] text-slate-400">özel tüketim vergisi — meta JSON</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Maliyet</label>
                <input
                  type="number"
                  step="0.01"
                  className={input}
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {tab === "other" && (
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Kategori</label>
              <input className={input} value={category} onChange={(e) => setCategory(e.target.value)} />
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
              <label className="block text-xs font-medium text-slate-600 mb-1">Depo</label>
              <input className={input} value={warehouse} onChange={(e) => setWarehouse(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Kritik stok eşiği</label>
              <input
                type="number"
                className={input}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
              />
            </div>
            {productType === "stoklu" && variants.length === 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Stok (varyantsız başlangıç)
                </label>
                <input
                  type="number"
                  className={input}
                  value={stockQty}
                  onChange={(e) => setStockQty(e.target.value)}
                />
              </div>
            )}
            <div className="flex items-center gap-2 pt-6">
              <input
                id="tp_active"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-slate-300"
              />
              <label htmlFor="tp_active" className="text-sm text-slate-700">
                Aktif ürün
              </label>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Açıklama</label>
              <textarea
                rows={3}
                className={input}
                value={descText}
                onChange={(e) => setDescText(e.target.value)}
              />
            </div>
          </div>
        )}

        {tab === "images" && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Fotoğraf URL</label>
              <input
                className={input}
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                placeholder="https://… veya /uploads/…"
              />
            </div>
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt="Önizleme"
                className="max-h-48 rounded border border-slate-200 object-contain bg-slate-50"
              />
            ) : (
              <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                Dosya yükleme API&apos;si yok — URL ile resim bağlayın veya Toplu Resim stub
                panelini kullanın.
              </div>
            )}
          </div>
        )}

        {tab === "variants" && (
          <div className="space-y-3">
            {productType === "hizmet" ? (
              <p className="text-sm text-slate-500">Hizmet ürünlerinde varyant kullanılmaz.</p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-600">Beden / renk / baskı varyantları</p>
                  <button
                    type="button"
                    onClick={() => setVariants((v) => [...v, emptyVariant(displayCode(sku) || "")])}
                    className="bk-btn bk-btn-ghost text-xs"
                  >
                    + Varyant
                  </button>
                </div>
                {variants.length === 0 && (
                  <p className="text-sm text-slate-400">
                    Varyant yok — ürün seviyesinde stok kullanılır. Stok girişi için{" "}
                    <Link href="/stock/entry" className="text-baykus-primary hover:underline">
                      /stock/entry
                    </Link>
                    .
                  </p>
                )}
                {variants.map((v) => (
                  <div
                    key={v.key}
                    className="rounded-lg border border-slate-100 bg-slate-50 p-3 grid md:grid-cols-4 gap-2"
                  >
                    <input
                      className={input}
                      placeholder="Ad *"
                      value={v.name}
                      onChange={(e) => updateVariant(v.key, { name: e.target.value })}
                    />
                    <input
                      className={input}
                      placeholder={isBhSyncCode(v.sku) ? "Senkron kodu gizli" : "SKU *"}
                      value={maskBhSyncValue(v.sku)}
                      onChange={(e) => updateVariant(v.key, { sku: e.target.value })}
                    />
                    <input
                      className={input}
                      placeholder="Renk"
                      value={v.color}
                      onChange={(e) => updateVariant(v.key, { color: e.target.value })}
                    />
                    <input
                      className={input}
                      placeholder="Beden"
                      value={v.size}
                      onChange={(e) => updateVariant(v.key, { size: e.target.value })}
                    />
                    <input
                      className={input}
                      placeholder="Baskı türü"
                      value={v.print_type}
                      onChange={(e) => updateVariant(v.key, { print_type: e.target.value })}
                    />
                    <input
                      className={input}
                      placeholder={isBhSyncCode(v.barcode) ? "Senkron kodu gizli" : "Barkod"}
                      value={isBhSyncCode(v.barcode) ? "" : v.barcode}
                      onChange={(e) => updateVariant(v.key, { barcode: e.target.value })}
                    />
                    <input
                      className={input}
                      type="number"
                      step="0.01"
                      placeholder="Fiyat"
                      value={v.price}
                      onChange={(e) => updateVariant(v.key, { price: e.target.value })}
                    />
                    <div className="flex gap-2">
                      <input
                        className={input}
                        type="number"
                        placeholder="Stok"
                        value={v.stock_qty}
                        onChange={(e) => updateVariant(v.key, { stock_qty: e.target.value })}
                      />
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
              </>
            )}
          </div>
        )}

        {tab === "linked" && (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Bağlı ürün ID listesi (virgülle)
            </label>
            <input
              className={input}
              value={linkedIds}
              onChange={(e) => setLinkedIds(e.target.value)}
              placeholder="12, 34, 56"
            />
            <p className="text-[11px] text-slate-400">
              İlişkisel tablo yok — ID&apos;ler description meta JSON&apos;da saklanır (dürüst stub).
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saving}
          className="bk-btn text-white font-bold text-sm px-4 py-2"
          style={{ backgroundColor: "#22a447" }}
        >
          {saving ? "Kaydediliyor…" : "✓ Kaydet"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="bk-btn text-white font-bold text-sm px-4 py-2"
          style={{ backgroundColor: "#0ea5e9" }}
        >
          ← Geri Dön
        </button>
      </div>
    </form>
  );
}
