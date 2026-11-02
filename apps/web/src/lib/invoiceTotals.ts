/**
 * Fatura mantığı toplamlar (alış ekranı) — backend `_apply_totals` ile birebir aynı:
 *   brüt = miktar × birim, net = brüt − satır indirimi,
 *   genel indirim (₺ veya %) KDV öncesi, satır netlerine oranla dağıtılır (son satır kalanı alır),
 *   satır KDV = (net − indirim payı) × oran / 100 (2 hane, yukarı yuvarlama),
 *   genel toplam = Σnet − genel indirim + ΣKDV.
 */

export type DiscountType = "amount" | "percent";

export type InvoiceLineIn = {
  qty: number;
  price: number;
  discount: number;
  rate: number;
  /** Elle / dağıtılmış KDV tutarı — verilirse orandan hesaplanmaz */
  manualTax?: number | null;
};

export type InvoiceLineOut = {
  gross: number;
  discount: number;
  net: number;
  alloc: number;
  tax: number;
  rate: number;
};

export type InvoiceTotals = {
  lines: InvoiceLineOut[];
  gross: number;
  lineDiscount: number;
  subtotal: number;
  generalDiscount: number;
  totalDiscount: number;
  taxBase: number;
  taxByRate: { rate: number; base: number; amount: number }[];
  tax: number;
  total: number;
};

export function r2(x: number): number {
  if (!Number.isFinite(x)) return 0;
  const s = x < 0 ? -1 : 1;
  return (s * Math.round((Math.abs(x) + 1e-9) * 100)) / 100;
}

export function parseNum(s: string | number | null | undefined): number {
  const n = Number(String(s ?? "").replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function generalDiscountAmount(subtotal: number, type: DiscountType, value: number): number {
  if (!(value > 0) || !(subtotal > 0)) return 0;
  if (type === "percent") return r2((subtotal * Math.min(value, 100)) / 100);
  return Math.min(r2(value), subtotal);
}

/** total'i satırlara ağırlıkla dağıtır (2 hane), son satır kalanı alır. */
export function distribute(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  let remaining = r2(total);
  return weights.map((w, i) => {
    if (i === weights.length - 1) return r2(remaining);
    const a = sum > 0 ? r2((total * w) / sum) : 0;
    remaining = r2(remaining - a);
    return a;
  });
}

export function computeInvoice(
  lines: InvoiceLineIn[],
  discountType: DiscountType,
  discountValue: number,
): InvoiceTotals {
  const base = lines.map((l) => {
    const gross = r2(l.qty * l.price);
    const discount = Math.min(r2(Math.max(0, l.discount)), gross);
    return { gross, discount, net: r2(gross - discount) };
  });
  const subtotal = r2(base.reduce((s, b) => s + b.net, 0));
  const generalDiscount = generalDiscountAmount(subtotal, discountType, discountValue);
  const allocs = distribute(generalDiscount, base.map((b) => b.net));
  const out: InvoiceLineOut[] = base.map((b, i) => {
    const l = lines[i]!;
    const alloc = allocs[i] ?? 0;
    const tax =
      l.manualTax != null ? r2(l.manualTax) : r2((Math.max(0, b.net - alloc) * Math.max(0, l.rate)) / 100);
    return { ...b, alloc, tax, rate: l.rate };
  });
  const byRate = new Map<number, { base: number; amount: number }>();
  for (const o of out) {
    if (!o.tax && !o.rate) continue;
    const cur = byRate.get(o.rate) || { base: 0, amount: 0 };
    cur.base = r2(cur.base + Math.max(0, o.net - o.alloc));
    cur.amount = r2(cur.amount + o.tax);
    byRate.set(o.rate, cur);
  }
  const gross = r2(base.reduce((s, b) => s + b.gross, 0));
  const lineDiscount = r2(base.reduce((s, b) => s + b.discount, 0));
  const tax = r2(out.reduce((s, o) => s + o.tax, 0));
  return {
    lines: out,
    gross,
    lineDiscount,
    subtotal,
    generalDiscount,
    totalDiscount: r2(lineDiscount + generalDiscount),
    taxBase: r2(subtotal - generalDiscount),
    taxByRate: [...byRate.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([rate, v]) => ({ rate, base: v.base, amount: v.amount })),
    tax,
    total: r2(subtotal - generalDiscount + tax),
  };
}

export function formatRate(rate: number): string {
  return Number.isInteger(rate) ? String(rate) : String(r2(rate)).replace(".", ",");
}
