"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  apiFetch,
  Customer,
  ORDER_CHANNELS,
  DESIGN_STATUSES,
  ORDER_STATUSES,
  OrderDetail,
  OrderLine,
  Product,
  ProductPricingInfo,
  formatMoney,
} from "@/lib/api";
import LiveSearchSelect, { useCustomerSearch, useProductSearch } from "@/components/LiveSearchSelect";
import { localToday } from "@/lib/dates";
import InvoiceTotalsFooter, { KDV_RATES } from "@/components/InvoiceTotalsFooter";
import { DiscountType, computeInvoice, parseNum, r2 } from "@/lib/invoiceTotals";

const num = parseNum;
/** Ürünlerde KDV alanı yok → yeni satış satırı %0 */
const DEFAULT_SALE_KDV = "0";

/** Satır indirimi ₺: tutar girilmişse o, yoksa oran × brüt (API ile aynı) */
function lineDiscountAmount(l: { quantity: string; unit_price: string; discount_rate: string; discount_amount: string }) {
  const amt = num(l.discount_amount);
  if (amt > 0) return r2(amt);
  const rate = num(l.discount_rate);
  if (rate > 0) return r2((r2(num(l.quantity) * num(l.unit_price)) * rate) / 100);
  return 0;
}

export type OrderFormPayload = {
  customer_id: number | null;
  order_number?: string | null;
  status: string;
  notes: string | null;
  due_date: string | null;
  delivery_date: string | null;
  movement_date?: string | null;
  channel: string;
  design_status: string;
  design_notes: string | null;
  deposit_amount: number;
  /** Genel indirim: ₺ veya % (API fatura mantığıyla hesaplar) */
  discount_type: DiscountType;
  discount_value: number;
  lines: {
    product_id?: number | null;
    variant_id?: number | null;
    description: string;
    quantity: number;
    size?: string | null;
    color?: string | null;
    print_type?: string | null;
    unit_price: number;
    discount_rate: number;
    discount_amount: number;
    tax_rate: number;
    line_note?: string | null;
  }[];
};

type LineState = {
  key: string;
  product_id: string;
  variant_id: string;
  description: string;
  quantity: string;
  size: string;
  color: string;
  print_type: string;
  unit_price: string;
  discount_rate: string;
  discount_amount: string;
  tax_rate: string;
  line_note: string;
  stock_qty?: number | null;
  is_critical?: boolean;
  price_source?: string | null;
};

function emptyLine(): LineState {
  return {
    key: Math.random().toString(36).slice(2),
    product_id: "",
    variant_id: "",
    description: "",
    quantity: "1",
    size: "",
    color: "",
    print_type: "",
    unit_price: "0",
    discount_rate: "0",
    discount_amount: "0",
    tax_rate: DEFAULT_SALE_KDV,
    line_note: "",
    stock_qty: null,
    is_critical: false,
    price_source: null,
  };
}

function fromOrderLines(lines: OrderLine[]): LineState[] {
  if (!lines.length) return [emptyLine()];
  return lines.map((l) => ({
    key: String(l.id ?? Math.random().toString(36).slice(2)),
    product_id: l.product_id != null ? String(l.product_id) : "",
    variant_id: l.variant_id != null ? String(l.variant_id) : "",
    description: l.description || "",
    quantity: String(l.quantity ?? 1),
    size: l.size || "",
    color: l.color || "",
    print_type: l.print_type || "",
    unit_price: String(l.unit_price ?? 0),
    discount_rate: String(l.discount_rate ?? 0),
    discount_amount: String(l.discount_amount ?? 0),
    tax_rate: String(Number(l.tax_rate ?? 0)),
    line_note: l.line_note || "",
    stock_qty: null,
    is_critical: false,
    price_source: null,
  }));
}

type Props = {
  initial?: OrderDetail | null;
  submitLabel: string;
  onSubmit: (payload: OrderFormPayload) => Promise<void>;
  onCancel?: () => void;
};

export default function OrderForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const customerSearch = useCustomerSearch(customers, setCustomers);
  const productSearch = useProductSearch(products, setProducts);
  const [customerId, setCustomerId] = useState(initial?.customer_id ? String(initial.customer_id) : "");
  const [orderNumber, setOrderNumber] = useState(initial?.order_number || "");
  const [status, setStatus] = useState(initial?.status || "Sipariş Alındı");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [dueDate, setDueDate] = useState(initial?.due_date ? initial.due_date.slice(0, 10) : "");
  const [deliveryDate, setDeliveryDate] = useState(initial?.delivery_date ? initial.delivery_date.slice(0, 10) : "");
  const [saleDate, setSaleDate] = useState(() =>
    initial?.delivery_date
      ? initial.delivery_date.slice(0, 10)
      : initial?.due_date
        ? initial.due_date.slice(0, 10)
        : localToday(),
  );
  const [channel, setChannel] = useState(initial?.channel || "mağaza");
  const [designStatus, setDesignStatus] = useState(initial?.design_status || "Bekliyor");
  const [designNotes, setDesignNotes] = useState(initial?.design_notes || "");
  const [deposit, setDeposit] = useState(String(initial?.deposit_amount ?? 0));
  // Eski siparişler: discount_value yoksa ₺ discount_amount korunur (toplam değişmez)
  const [discType, setDiscType] = useState<DiscountType>(() =>
    initial && Number(initial.discount_value ?? 0) > 0 && initial.discount_type === "percent" ? "percent" : "amount",
  );
  const [discValue, setDiscValue] = useState(() => {
    if (!initial) return "0";
    const v = Number(initial.discount_value ?? 0);
    return String(v > 0 ? v : Number(initial.discount_amount ?? 0));
  });
  const [lines, setLines] = useState<LineState[]>(() =>
    initial ? fromOrderLines(initial.lines) : [emptyLine()],
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch<Customer[]>("/api/customers?limit=1000"),
      apiFetch<Product[]>("/api/products?active_only=true&limit=1000"),
    ])
      .then(([c, p]) => {
        setCustomers(c);
        setProducts(p);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Yükleme hatası"));
  }, []);

  const selectedCustomer = useMemo(
    () => customers.find((c) => String(c.id) === customerId) || null,
    [customers, customerId],
  );

  const calc = useMemo(
    () =>
      computeInvoice(
        lines.map((l) => ({
          qty: num(l.quantity),
          price: num(l.unit_price),
          discount: lineDiscountAmount(l),
          rate: num(l.tax_rate),
        })),
        discType,
        num(discValue),
      ),
    [lines, discType, discValue],
  );

  function setRateAll(value: string) {
    setLines((prev) => prev.map((l) => ({ ...l, tax_rate: value })));
  }

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function onProductChange(key: string, productId: string) {
    const product = products.find((p) => String(p.id) === productId);
    updateLine(key, {
      product_id: productId,
      variant_id: "",
      description: product?.name || "",
      unit_price: product ? String(product.base_price ?? 0) : "0",
      stock_qty: product?.stock_qty ?? null,
      is_critical: Boolean(product?.is_critical),
      price_source: productId ? "product" : null,
    });
    if (!productId) return;
    try {
      const info = await apiFetch<ProductPricingInfo>(`/api/products/${productId}/pricing`);
      updateLine(key, {
        description: info.name || product?.name || "",
        unit_price: String(info.unit_price ?? 0),
        stock_qty: info.stock_qty,
        is_critical: info.is_critical,
        price_source: info.price_source,
      });
    } catch {
      // keep product fallback
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!lines.some((l) => l.description.trim())) {
      setError("En az bir satır açıklaması gerekli");
      return;
    }
    for (const l of lines) {
      const r = num(l.tax_rate);
      if (l.description.trim() && (r < 0 || r > 100)) {
        setError(`${l.description}: KDV oranı 0–100 olmalı`);
        return;
      }
    }
    if (num(discValue) < 0 || (discType === "percent" && num(discValue) > 100)) {
      setError("Genel indirim geçersiz (yüzde 0–100, tutar negatif olamaz)");
      return;
    }
    setLoading(true);
    try {
      const payload: OrderFormPayload = {
        customer_id: customerId ? Number(customerId) : null,
        order_number: orderNumber.trim() || null,
        status,
        notes: notes.trim() || null,
        due_date: dueDate || null,
        delivery_date: deliveryDate || saleDate || null,
        movement_date: saleDate || deliveryDate || dueDate || localToday(),
        channel,
        design_status: designStatus,
        design_notes: designNotes.trim() || null,
        deposit_amount: num(deposit),
        discount_type: discType,
        discount_value: Math.max(0, num(discValue)),
        lines: lines
          .filter((l) => l.description.trim())
          .map((l) => ({
            product_id: l.product_id ? Number(l.product_id) : null,
            variant_id: l.variant_id ? Number(l.variant_id) : null,
            description: l.description.trim(),
            quantity: Math.max(1, Math.round(num(l.quantity)) || 1),
            size: l.size.trim() || null,
            color: l.color.trim() || null,
            print_type: l.print_type.trim() || null,
            unit_price: Math.max(0, num(l.unit_price)),
            discount_rate: num(l.discount_rate),
            discount_amount: num(l.discount_amount),
            tax_rate: r2(num(l.tax_rate)),
            line_note: l.line_note.trim() || null,
          })),
      };
      await onSubmit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-baykus-500";

  return (
    <form onSubmit={handleSubmit} data-baykus-save className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Müşteri Ara</label>
          <LiveSearchSelect
            value={customerId}
            onChange={(id) => setCustomerId(id)}
            options={customerSearch.options}
            fetchMatches={customerSearch.fetchMatches}
            placeholder="Ad / telefon / firma…"
            inputClassName={inputCls}
          />
          {selectedCustomer && (
            <div className="mt-2 rounded-lg border border-baykus-line bg-baykus-bg px-3 py-2 text-xs space-y-1">
              <div>
                Telefon: <strong>{selectedCustomer.phone || "—"}</strong>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  Açık bakiye:{" "}
                  <strong
                    className={`tabular-nums ${Number(selectedCustomer.balance || 0) > 0 ? "text-amber-700" : ""}`}
                  >
                    {formatMoney(Number(selectedCustomer.balance || 0))}
                  </strong>
                </span>
                <Link href={`/customers/${selectedCustomer.id}`} className="text-baykus-primary hover:underline">
                  Cari kartı →
                </Link>
              </div>
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Sipariş No {initial ? "" : "(boş = otomatik)"}
          </label>
          <input
            className={inputCls}
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="SIP-2026-…"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Durum</label>
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">İşlem Tarihi</label>
          <input
            type="date"
            className={inputCls}
            value={saleDate}
            onChange={(e) => setSaleDate(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Vade</label>
          <input
            type="date"
            className={inputCls}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Tahsilat / Kapora (₺)</label>
          <input
            inputMode="decimal"
            className={inputCls}
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Teslim Tarihi</label>
          <input type="date" className={inputCls} value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Kanal</label>
          <select className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value)}>
            {ORDER_CHANNELS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Tasarım Durumu</label>
          <select className={inputCls} value={designStatus} onChange={(e) => setDesignStatus(e.target.value)}>
            {DESIGN_STATUSES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-slate-600 mb-1">Tasarım Notları</label>
          <textarea rows={2} className={inputCls} value={designNotes} onChange={(e) => setDesignNotes(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-slate-600 mb-1">Notlar</label>
          <textarea
            rows={2}
            className={inputCls}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Satırlar</h2>
          <button
            type="button"
            onClick={() => setLines((prev) => [...prev, emptyLine()])}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            + Satır Ekle
          </button>
        </div>

        <div className="space-y-4">
          {lines.map((line, idx) => (
            <div
              key={line.key}
              className="rounded-lg border border-slate-100 bg-slate-50 p-3 grid md:grid-cols-6 gap-2"
            >
              <div className="md:col-span-2">
                <label className="block text-[10px] text-slate-500 mb-0.5">Ürün ara #{idx + 1}</label>
                <LiveSearchSelect
                  value={line.product_id}
                  onChange={(id) => void onProductChange(line.key, id)}
                  options={productSearch.options}
                  fetchMatches={productSearch.fetchMatches}
                  placeholder="Ürün ara…"
                  inputClassName={inputCls}
                />
                {line.product_id && (
                  <div className="mt-1 text-[11px] text-slate-500 space-x-2">
                    <span>
                      Stok:{" "}
                      <strong
                        className={
                          line.is_critical ||
                          (line.stock_qty != null && Number(line.quantity) > line.stock_qty)
                            ? "text-red-700"
                            : "text-slate-800"
                        }
                      >
                        {line.stock_qty ?? "—"}
                      </strong>
                    </span>
                    {line.price_source && (
                      <span>
                        Fiyat kaynağı:{" "}
                        {line.price_source === "price_list"
                          ? "fiyat listesi"
                          : line.price_source === "variant"
                            ? "varyant"
                            : "ürün"}
                      </span>
                    )}
                    {line.stock_qty != null && Number(line.quantity) > line.stock_qty && (
                      <span className="text-red-700 font-medium">Miktar stoktan fazla!</span>
                    )}
                  </div>
                )}
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] text-slate-500 mb-0.5">Ürün / Tanım *</label>
                <input
                  className={inputCls}
                  value={line.description}
                  onChange={(e) => updateLine(line.key, { description: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">Adet</label>
                <input
                  inputMode="numeric"
                  className={inputCls}
                  value={line.quantity}
                  onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">Birim Fiyat</label>
                <input
                  inputMode="decimal"
                  className={inputCls}
                  value={line.unit_price}
                  onChange={(e) => updateLine(line.key, { unit_price: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">Beden</label>
                <input
                  className={inputCls}
                  value={line.size}
                  onChange={(e) => updateLine(line.key, { size: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">Renk</label>
                <input
                  className={inputCls}
                  value={line.color}
                  onChange={(e) => updateLine(line.key, { color: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">Baskı Türü</label>
                <input
                  className={inputCls}
                  value={line.print_type}
                  onChange={(e) => updateLine(line.key, { print_type: e.target.value })}
                  placeholder="DTF, Serigrafi…"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] text-slate-500 mb-0.5">Açıklama</label>
                <input
                  className={inputCls}
                  value={line.line_note}
                  maxLength={2000}
                  onChange={(e) => updateLine(line.key, { line_note: e.target.value })}
                  placeholder="Örn. 45x60 ön baskı"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">İskonto %</label>
                <input
                  inputMode="decimal"
                  className={inputCls}
                  value={line.discount_rate}
                  onChange={(e) => updateLine(line.key, { discount_rate: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">İskonto ₺</label>
                <input
                  inputMode="decimal"
                  className={inputCls}
                  value={line.discount_amount}
                  onChange={(e) => updateLine(line.key, { discount_amount: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">KDV %</label>
                <input
                  inputMode="decimal"
                  list="bk-order-kdv-rates"
                  className={`${inputCls} text-right tabular-nums`}
                  value={line.tax_rate}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => updateLine(line.key, { tax_rate: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">KDV Tutarı</label>
                <div className="px-1 py-2 text-sm text-right tabular-nums text-slate-600">
                  {formatMoney(calc.lines[idx]?.tax ?? 0)}
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5" title="KDV hariç, satır indirimi düşülmüş">
                  Tutar
                </label>
                <div className="px-1 py-2 text-sm text-right tabular-nums font-semibold">
                  {formatMoney(calc.lines[idx]?.net ?? 0)}
                </div>
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  disabled={lines.length <= 1}
                  onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                  className="text-red-600 text-sm hover:underline disabled:opacity-40"
                >
                  Satırı Sil
                </button>
              </div>
            </div>
          ))}
        </div>

        <datalist id="bk-order-kdv-rates">
          {KDV_RATES.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>

        {/* Fatura altı toplamlar */}
        <div className="pt-2 border-t border-slate-100">
          <InvoiceTotalsFooter
            calc={calc}
            discType={discType}
            discValue={discValue}
            onDiscType={setDiscType}
            onDiscValue={setDiscValue}
            onRateAll={setRateAll}
            lineCount={lines.length}
            paid={num(deposit)}
            paidLabel="Kapora / Ödenen"
            remainingLabel="Kalan"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-baykus-600 text-white px-5 py-2.5 text-sm font-medium disabled:opacity-60"
        >
          {loading ? "Kaydediliyor…" : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm"
          >
            İptal
          </button>
        )}
      </div>
    </form>
  );
}
