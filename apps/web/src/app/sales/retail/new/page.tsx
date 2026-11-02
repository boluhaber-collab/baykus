"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Product,
  ProductDetail,
  ProductVariant,
  apiFetch,
  formatMoney,
} from "@/lib/api";
import { displaySku } from "@/lib/productLabel";
import StatusFooter from "@/components/StatusFooter";
import SplitPaymentRows, {
  SplitPaymentRow,
  rowsSum,
  rowsToPayload,
} from "@/components/SplitPaymentRows";
import { localToday } from "@/lib/dates";
import InvoiceTotalsFooter, { KDV_RATES } from "@/components/InvoiceTotalsFooter";
import { DiscountType, computeInvoice, parseNum, r2 } from "@/lib/invoiceTotals";
import LiveSearchSelect, { useProductSearch } from "@/components/LiveSearchSelect";
import StockDetailFilters from "@/components/StockDetailFilters";
import {
  EMPTY_STOCK_FILTERS,
  StockFilterState,
  collectFacetOptions,
  filterStockRows,
} from "@/lib/stockFilters";

type CartLine = {
  key: string;
  product_id: number;
  variant_id?: number | null;
  urun: string;
  secenek: string;
  depo: string;
  miktar: string;
  birim_fiyat: string;
  /** KDV oranı (%) — tutar değil */
  kdv: string;
  /** Satır indirimi (₺) */
  indirim: string;
  not?: string;
};

/** Ürünlerde KDV oranı alanı yok → satış satırı varsayılanı %0 (eski satışlarla aynı fiyat) */
const DEFAULT_SALE_KDV = "0";
const num = parseNum;

function todayDateInput(): string {
  return localToday();
}

function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function PerakendeSatisGirPage() {
  const router = useRouter();
  const [tarih, setTarih] = useState(todayDateInput());
  const [saat, setSaat] = useState(nowTime());
  const [payRows, setPayRows] = useState<SplitPaymentRow[]>([]);
  const [delivered, setDelivered] = useState(true);
  const [aciklama, setAciklama] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const productSearch = useProductSearch(products, setProducts);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [variantPick, setVariantPick] = useState<{
    product: Product;
    detail: ProductDetail;
    variants: ProductVariant[];
  } | null>(null);
  const [pickFilters, setPickFilters] = useState<StockFilterState>({ ...EMPTY_STOCK_FILTERS });

  const loadMeta = useCallback(async () => {
    try {
      const prods = await apiFetch<Product[]>("/api/products?limit=1000&active_only=true");
      setProducts(prods);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const [discType, setDiscType] = useState<DiscountType>("amount");
  const [discValue, setDiscValue] = useState("0");
  const calc = useMemo(
    () =>
      computeInvoice(
        cart.map((l) => ({ qty: num(l.miktar), price: num(l.birim_fiyat), discount: num(l.indirim), rate: num(l.kdv) })),
        discType,
        num(discValue),
      ),
    [cart, discType, discValue],
  );
  /** Vergiler dahil genel toplam — tahsilat / kasa bununla eşleşir */
  const toplam = calc.total;

  const tahsilatNum = useMemo(() => rowsSum(payRows), [payRows]);

  function pushCartLine(
    p: Product,
    opts: { variantId: number | null; secenek: string; price: number; depo: string },
  ) {
    const key = Math.random().toString(36).slice(2);
    const line: CartLine = {
      key,
      product_id: p.id,
      variant_id: opts.variantId,
      urun: p.name,
      secenek: opts.secenek,
      depo: opts.depo,
      miktar: "1",
      birim_fiyat: String(opts.price || 0),
      kdv: DEFAULT_SALE_KDV,
      indirim: "0",
    };
    // KDV oranı: son satırın oranı (kullanıcı değiştirdiyse), yoksa %0
    setCart((prev) => [...prev, { ...line, kdv: prev.length ? prev[prev.length - 1]!.kdv : DEFAULT_SALE_KDV }]);
    setSelectedKey(key);
    setVariantPick(null);
  }

  async function addProduct(p: Product) {
    let price = Number(p.base_price || 0);
    let depo = p.warehouse || "Ana Depo";
    try {
      const detail = await apiFetch<ProductDetail>(`/api/products/${p.id}`);
      depo = detail.warehouse || depo;
      const allVariants = detail.variants || [];
      const inStock = allVariants.filter((v) => Number(v.stock_qty ?? 0) > 0);
      if (allVariants.length > 1) {
        setPickFilters({ ...EMPTY_STOCK_FILTERS });
        setVariantPick({ product: p, detail, variants: allVariants });
        return;
      }
      if (inStock.length === 1) {
        const v = inStock[0]!;
        pushCartLine(p, {
          variantId: v.id,
          secenek: [v.color, v.size].filter(Boolean).join(" / "),
          price: Number(v.price || price),
          depo,
        });
        return;
      }
      if (allVariants.length === 1) {
        setPickFilters({ ...EMPTY_STOCK_FILTERS });
        setVariantPick({ product: p, detail, variants: allVariants });
        return;
      }
    } catch {
      /* use list row */
    }
    pushCartLine(p, { variantId: null, secenek: "", price, depo });
  }

  function confirmVariant(v: ProductVariant) {
    if (!variantPick) return;
    const p = variantPick.product;
    const price = Number(v.price || p.base_price || 0);
    const depo = variantPick.detail.warehouse || p.warehouse || "Ana Depo";
    pushCartLine(p, {
      variantId: v.id,
      secenek: [v.color, v.size, v.name].filter(Boolean).join(" / "),
      price,
      depo,
    });
  }

  function updateLine(key: string, patch: Partial<CartLine>) {
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function setRateAll(value: string) {
    setCart((prev) => prev.map((l) => ({ ...l, kdv: value })));
  }

  function removeSelected() {
    if (!selectedKey) return;
    setCart((prev) => prev.filter((l) => l.key !== selectedKey));
    setSelectedKey(null);
  }

  async function saveSale() {
    setError("");
    if (cart.length === 0) {
      setError("Satışa en az bir ürün eklenmelidir.");
      return;
    }
    for (const l of cart) {
      if (!(num(l.miktar) >= 1)) {
        setError(`${l.urun}: miktar en az 1 olmalı.`);
        return;
      }
      const r = num(l.kdv);
      if (r < 0 || r > 100) {
        setError(`${l.urun}: KDV oranı 0–100 arasında olmalı.`);
        return;
      }
    }
    if (num(discValue) < 0 || (discType === "percent" && num(discValue) > 100)) {
      setError("Genel indirim geçersiz (yüzde 0–100, tutar negatif olamaz).");
      return;
    }
    if (toplam <= 0) {
      setError("Satış toplamı sıfırdan büyük olmalıdır.");
      return;
    }
    const payments = rowsToPayload(payRows);
    if (payments.length === 0 && toplam > 0) {
      setError("En az bir kasa/hesap tahsilat satırı girilmelidir.");
      return;
    }
    if (tahsilatNum < 0 || tahsilatNum > toplam + 0.01) {
      setError("Tahsilat, sıfır ile satış toplamı arasında olmalıdır.");
      return;
    }
    if (payments.length > 0 && Math.abs(rowsSum(payRows) - tahsilatNum) > 0.02) {
      setError("Ödeme satırları toplamı tutarsız.");
      return;
    }
    setBusy(true);
    try {
      // Perakende direkt satış = satış faturası; asla Sipariş Alındı bırakılmaz.
      const status = "Teslim Edildi";
      const noteParts = [
        aciklama.trim(),
        `Tarih ${tarih} ${saat}`,
        payments.length > 1 ? `Çoklu tahsilat (${payments.length} satır)` : "Tahsilat",
        delivered ? "Teslim edildi" : null,
      ].filter(Boolean);
      // Single create: stok↓ + kapora payment + kasa/banka (cari yok — müşterisiz perakende)
      await apiFetch<{ id: number; order_number: string }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          customer_id: null,
          status,
          notes: noteParts.join(" · ") || null,
          channel: "perakende",
          design_status: "Onaylandı",
          due_date: tarih || null,
          delivery_date: tarih || localToday(),
          movement_date: tarih || localToday(),
          deposit_amount: tahsilatNum > 0 ? tahsilatNum : 0,
          discount_type: discType,
          discount_value: Math.max(0, num(discValue)),
          lines: cart.map((l) => ({
            product_id: l.product_id,
            variant_id: l.variant_id || null,
            description: l.urun,
            quantity: Math.max(1, Math.round(num(l.miktar))),
            size: null,
            color: l.secenek || null,
            print_type: null,
            unit_price: Math.max(0, num(l.birim_fiyat)),
            discount_rate: 0,
            discount_amount: Math.max(0, num(l.indirim)),
            tax_rate: r2(num(l.kdv)),
            line_note: (l.not || "").trim() || null,
          })),
          payments: payments.length && tahsilatNum > 0 ? payments : undefined,
        }),
      });

      router.push("/sales");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kayıt hatası");
    } finally {
      setBusy(false);
    }
  }

  const numCls = "bk-input py-0.5 tabular-nums text-right";

  return (
    <div className="space-y-2 pb-2">
      <div>
        <h2 className="text-lg font-bold text-baykus-text leading-tight">Perakende Satış Gir</h2>
        <p className="text-[11px] text-baykus-muted mt-0.5">Satışlar &gt; Direkt Satışlar &gt; Perakende Satış</p>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="bk-entry-grid">
        {/* SOL — PERAKENDE LabelFrame */}
        <fieldset className="rounded border border-baykus-line bg-white px-3 py-2.5 space-y-2.5 min-w-0">
          <legend className="px-1 text-xs font-bold tracking-wide">PERAKENDE</legend>

          <div className="flex flex-wrap items-center gap-2 pb-1">
            <button
              type="button"
              data-baykus-save
              disabled={busy}
              onClick={() => void saveSale()}
              className="bk-btn bk-btn-desktop-red text-sm font-bold px-4 py-2"
            >
              + Satış Kaydet
            </button>
            <Link
              href="/sales"
              className="bk-btn bk-btn-desktop-orange text-sm font-bold px-4 py-2"
            >
              − Geri Dön
            </Link>
          </div>

          <div className="bk-entry-row">
            <label className="text-xs font-medium">Tarih</label>
            <div className="bk-date-time">
              <input
                type="date"
                className="bk-input"
                value={tarih}
                onChange={(e) => setTarih(e.target.value)}
              />
              <input
                type="time"
                className="bk-input"
                value={saat}
                onChange={(e) => setSaat(e.target.value)}
              />
            </div>
          </div>

          <div className="bk-entry-row">
            <label className="text-xs font-medium">Genel Toplam</label>
            <div className="text-base font-bold tabular-nums">
              {formatMoney(toplam)}
              <span className="ml-1 text-[10px] font-normal text-baykus-muted">KDV dahil</span>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium mb-1.5">Kasa / Hesap · Tahsilat</div>
            <SplitPaymentRows
              expectedTotal={toplam}
              mode="tahsilat"
              autoFill
              onChange={setPayRows}
            />
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-medium">
            <input
              type="checkbox"
              checked={delivered}
              onChange={(e) => setDelivered(e.target.checked)}
            />
            Ürün müşteriye teslim edildi
            <span className="text-[10px] text-baykus-muted font-normal">
              (perakende kayıt her zaman satış faturası · Teslim Edildi)
            </span>
          </label>

          <div>
            <label className="block text-xs font-medium mb-1">Açıklama</label>
            <textarea
              className="bk-input min-h-[120px]"
              value={aciklama}
              onChange={(e) => setAciklama(e.target.value)}
            />
          </div>
        </fieldset>

        {/* SAĞ — ÜRÜN / HİZMETLER */}
        <fieldset className="rounded border border-baykus-line bg-white px-3 py-2.5 space-y-2 min-w-0">
          <legend className="px-1 text-xs font-bold tracking-wide">ÜRÜN / HİZMETLER</legend>

          <LiveSearchSelect
            value=""
            clearOnSelect
            options={productSearch.options}
            fetchMatches={productSearch.fetchMatches}
            placeholder="Ürün ara… isim, SKU veya barkod"
            emptyText="Ürün bulunamadı"
            onChange={(id) => {
              if (!id) return;
              const found = products.find((p) => String(p.id) === id);
              if (found) {
                void addProduct(found);
                return;
              }
              void apiFetch<ProductDetail>(`/api/products/${id}`).then((d) => addProduct(d));
            }}
          />

          <div className="bk-table-wrap bk-entry-table-wrap">
            <table className="bk-table bk-entry-table">
              <thead>
                <tr>
                  <th>Ürün</th>
                  <th>Seçenek</th>
                  <th>Depo</th>
                  <th className="text-right">Miktar</th>
                  <th className="text-right">Birim Fiyat</th>
                  <th className="text-right">KDV %</th>
                  <th className="text-right">KDV Tutarı</th>
                  <th className="text-right">İndirim ₺</th>
                  <th>Açıklama</th>
                  <th className="text-right" title="Miktar × Birim Fiyat − İndirim (KDV hariç)">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {cart.map((l, i) => (
                  <tr
                    key={l.key}
                    onClick={() => setSelectedKey(l.key)}
                    className={selectedKey === l.key ? "bg-sky-50" : ""}
                  >
                    <td className="font-medium min-w-[9rem]">{l.urun}</td>
                    <td>
                      <input
                        className="bk-input py-0.5 w-24"
                        value={l.secenek}
                        onChange={(e) => updateLine(l.key, { secenek: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="bk-input py-0.5 w-20"
                        value={l.depo}
                        onChange={(e) => updateLine(l.key, { depo: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        inputMode="numeric"
                        className={`${numCls} w-16`}
                        value={l.miktar}
                        onChange={(e) => updateLine(l.key, { miktar: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        inputMode="decimal"
                        className={`${numCls} w-20`}
                        value={l.birim_fiyat}
                        placeholder="0,00"
                        onChange={(e) => updateLine(l.key, { birim_fiyat: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        inputMode="decimal"
                        list="bk-sale-kdv-rates"
                        className={`${numCls} w-14`}
                        value={l.kdv}
                        title="KDV oranı (%)"
                        onChange={(e) => updateLine(l.key, { kdv: e.target.value })}
                      />
                    </td>
                    <td className="tabular-nums whitespace-nowrap text-right text-baykus-muted">
                      {formatMoney(calc.lines[i]?.tax ?? 0)}
                    </td>
                    <td>
                      <input
                        inputMode="decimal"
                        className={`${numCls} w-16`}
                        value={l.indirim}
                        onChange={(e) => updateLine(l.key, { indirim: e.target.value })}
                      />
                    </td>
                    <td className="min-w-[10rem]">
                      <input
                        className="bk-input py-0.5 w-full"
                        value={l.not || ""}
                        placeholder="Örn. 45x60 ön baskı"
                        maxLength={2000}
                        onChange={(e) => updateLine(l.key, { not: e.target.value })}
                      />
                    </td>
                    <td className="tabular-nums font-medium whitespace-nowrap text-right">
                      {formatMoney(calc.lines[i]?.net ?? 0)}
                    </td>
                  </tr>
                ))}
                {cart.length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center text-baykus-muted py-8">
                      Sepete ürün eklemek için listeden seçin
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <datalist id="bk-sale-kdv-rates">
            {KDV_RATES.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-baykus-muted">{cart.length} kalem</span>
            <button
              type="button"
              onClick={removeSelected}
              disabled={!selectedKey}
              className="bk-btn bk-btn-desktop-red text-xs font-bold disabled:opacity-50"
            >
              Seçili Satırı Sil
            </button>
          </div>

          {/* Fatura altı toplamlar */}
          <InvoiceTotalsFooter
            calc={calc}
            discType={discType}
            discValue={discValue}
            onDiscType={setDiscType}
            onDiscValue={setDiscValue}
            onRateAll={setRateAll}
            lineCount={cart.length}
            paid={tahsilatNum}
            paidLabel="Tahsil Edilen"
            remainingLabel="Kalan"
          />
        </fieldset>
      </div>


      {variantPick && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-slate-200">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div>
                <div className="text-sm font-bold">Varyant Seç</div>
                <div className="text-xs text-baykus-muted">{variantPick.product.name}</div>
              </div>
              <button
                type="button"
                className="text-slate-500 hover:text-slate-800 text-lg leading-none"
                onClick={() => setVariantPick(null)}
              >
                ×
              </button>
            </div>
            {(() => {
              const facets = collectFacetOptions(variantPick.variants);
              const filtered = filterStockRows(variantPick.variants, pickFilters);
              return (
                <>
                  <StockDetailFilters
                    compact
                    hideWarehouse
                    value={pickFilters}
                    onChange={setPickFilters}
                    facets={facets}
                  />
                  <div className="max-h-72 overflow-auto p-2 space-y-1">
                    {!filtered.length ? (
                      <p className="text-sm text-baykus-muted px-2 py-6 text-center">
                        Filtrelere uyan / stoğu olan varyant yok.
                      </p>
                    ) : (
                      filtered.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => confirmVariant(v)}
                          className="w-full text-left rounded-lg border border-slate-200 px-3 py-2 hover:border-baykus-primary hover:bg-sky-50 transition"
                        >
                          <div className="text-sm font-medium">
                            {[v.color, v.size, v.print_type, v.name].filter(Boolean).join(" / ") ||
                              displaySku(v.sku) ||
                              `Varyant #${v.id}`}
                          </div>
                          <div className="text-xs text-baykus-muted flex justify-between mt-0.5">
                            <span>Stok: {v.stock_qty ?? 0}</span>
                            <span className="font-semibold text-baykus-text">
                              {formatMoney(Number(v.price || 0))}
                            </span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      <StatusFooter />
    </div>
  );
}
