"use client";

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
} from "@/lib/api";

export type OrderFormPayload = {
  customer_id: number | null;
  order_number?: string | null;
  status: string;
  notes: string | null;
  due_date: string | null;
  delivery_date: string | null;
  channel: string;
  design_status: string;
  design_notes: string | null;
  deposit_amount: number;
  discount_amount: number;
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
  }[];
};

type LineState = {
  key: string;
  product_id: string;
  description: string;
  quantity: string;
  size: string;
  color: string;
  print_type: string;
  unit_price: string;
  discount_rate: string;
  discount_amount: string;
};

function emptyLine(): LineState {
  return {
    key: Math.random().toString(36).slice(2),
    product_id: "",
    description: "",
    quantity: "1",
    size: "",
    color: "",
    print_type: "",
    unit_price: "0",
    discount_rate: "0",
    discount_amount: "0",
  };
}

function fromOrderLines(lines: OrderLine[]): LineState[] {
  if (!lines.length) return [emptyLine()];
  return lines.map((l) => ({
    key: String(l.id ?? Math.random().toString(36).slice(2)),
    product_id: l.product_id != null ? String(l.product_id) : "",
    description: l.description || "",
    quantity: String(l.quantity ?? 1),
    size: l.size || "",
    color: l.color || "",
    print_type: l.print_type || "",
    unit_price: String(l.unit_price ?? 0),
    discount_rate: String(l.discount_rate ?? 0),
    discount_amount: String(l.discount_amount ?? 0),
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
  const [customerId, setCustomerId] = useState(initial?.customer_id ? String(initial.customer_id) : "");
  const [orderNumber, setOrderNumber] = useState(initial?.order_number || "");
  const [status, setStatus] = useState(initial?.status || "Sipariş Alındı");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [dueDate, setDueDate] = useState(initial?.due_date ? initial.due_date.slice(0, 10) : "");
  const [deliveryDate, setDeliveryDate] = useState(initial?.delivery_date ? initial.delivery_date.slice(0, 10) : "");
  const [channel, setChannel] = useState(initial?.channel || "mağaza");
  const [designStatus, setDesignStatus] = useState(initial?.design_status || "bekliyor");
  const [designNotes, setDesignNotes] = useState(initial?.design_notes || "");
  const [deposit, setDeposit] = useState(String(initial?.deposit_amount ?? 0));
  const [discount, setDiscount] = useState(String(initial?.discount_amount ?? 0));
  const [lines, setLines] = useState<LineState[]>(() =>
    initial ? fromOrderLines(initial.lines) : [emptyLine()],
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch<Customer[]>("/api/customers"),
      apiFetch<Product[]>("/api/products"),
    ])
      .then(([c, p]) => {
        setCustomers(c);
        setProducts(p);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Yükleme hatası"));
  }, []);

  const linesSubtotal = useMemo(() => {
    return lines.reduce((sum, l) => {
      const qty = Number(l.quantity) || 0;
      const price = Number(l.unit_price) || 0;
      let disc = Number(l.discount_amount) || 0;
      const rate = Number(l.discount_rate) || 0;
      if (rate > 0 && disc === 0) disc = (qty * price * rate) / 100;
      return sum + Math.max(qty * price - disc, 0);
    }, 0);
  }, [lines]);

  const grandTotal = Math.max(linesSubtotal - (Number(discount) || 0), 0);

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function onProductChange(key: string, productId: string) {
    const product = products.find((p) => String(p.id) === productId);
    updateLine(key, {
      product_id: productId,
      description: product?.name || "",
      unit_price: product ? String(product.base_price) : "0",
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!lines.some((l) => l.description.trim())) {
      setError("En az bir satır açıklaması gerekli");
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
        delivery_date: deliveryDate || null,
        channel,
        design_status: designStatus,
        design_notes: designNotes.trim() || null,
        deposit_amount: Number(deposit) || 0,
        discount_amount: Number(discount) || 0,
        lines: lines
          .filter((l) => l.description.trim())
          .map((l) => ({
            product_id: l.product_id ? Number(l.product_id) : null,
            description: l.description.trim(),
            quantity: Math.max(1, Number(l.quantity) || 1),
            size: l.size.trim() || null,
            color: l.color.trim() || null,
            print_type: l.print_type.trim() || null,
            unit_price: Number(l.unit_price) || 0,
            discount_rate: Number(l.discount_rate) || 0,
            discount_amount: Number(l.discount_amount) || 0,
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
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Müşteri</label>
          <select
            className={inputCls}
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">— Seçin —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.company ? ` (${c.company})` : ""}
              </option>
            ))}
          </select>
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
          <label className="block text-xs font-medium text-slate-600 mb-1">Teslim Tarihi</label>
          <input
            type="date"
            className={inputCls}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Kapora (₺)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            className={inputCls}
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Sipariş İskontosu (₺)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            className={inputCls}
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
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
                <label className="block text-[10px] text-slate-500 mb-0.5">Ürün #{idx + 1}</label>
                <select
                  className={inputCls}
                  value={line.product_id}
                  onChange={(e) => onProductChange(line.key, e.target.value)}
                >
                  <option value="">— Manuel —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] text-slate-500 mb-0.5">Açıklama *</label>
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
                  type="number"
                  min={1}
                  className={inputCls}
                  value={line.quantity}
                  onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">Birim Fiyat</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
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
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">İskonto %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  className={inputCls}
                  value={line.discount_rate}
                  onChange={(e) => updateLine(line.key, { discount_rate: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">İskonto ₺</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={inputCls}
                  value={line.discount_amount}
                  onChange={(e) => updateLine(line.key, { discount_amount: e.target.value })}
                />
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

        <div className="flex justify-end gap-6 text-sm pt-2 border-t border-slate-100">
          <div>
            Ara toplam:{" "}
            <strong>
              {new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(
                linesSubtotal,
              )}
            </strong>
          </div>
          <div>
            Genel toplam:{" "}
            <strong>
              {new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(
                grandTotal,
              )}
            </strong>
          </div>
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
