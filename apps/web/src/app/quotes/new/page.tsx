"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch, Customer, Product, QUOTE_STATUSES } from "@/lib/api";

type Line = {
  key: string;
  product_id: string;
  description: string;
  quantity: string;
  size: string;
  color: string;
  print_type: string;
  unit_price: string;
};

function emptyLine(): Line {
  return {
    key: Math.random().toString(36).slice(2),
    product_id: "",
    description: "",
    quantity: "1",
    size: "",
    color: "",
    print_type: "",
    unit_price: "0",
  };
}

export default function NewQuotePage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [status, setStatus] = useState("Taslak");
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [discount, setDiscount] = useState("0");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch<Customer[]>("/api/customers"),
      apiFetch<Product[]>("/api/products"),
    ])
      .then(([c, p]) => {
        setCustomers(c);
        setProducts(p);
      })
      .catch((e) => setError(e.message));
  }, []);

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const payloadLines = lines
      .filter((l) => l.description.trim())
      .map((l) => ({
        product_id: l.product_id ? Number(l.product_id) : null,
        description: l.description.trim(),
        quantity: Math.max(1, Number(l.quantity) || 1),
        size: l.size || null,
        color: l.color || null,
        print_type: l.print_type || null,
        unit_price: Number(l.unit_price) || 0,
        discount_rate: 0,
        discount_amount: 0,
      }));
    if (!payloadLines.length) {
      setError("En az bir satır gerekli");
      return;
    }
    setBusy(true);
    try {
      const created = await apiFetch<{ id: number }>("/api/quotes", {
        method: "POST",
        body: JSON.stringify({
          customer_id: customerId ? Number(customerId) : null,
          status,
          notes: notes || null,
          valid_until: validUntil || null,
          discount_amount: Number(discount) || 0,
          lines: payloadLines,
        }),
      });
      router.push(`/quotes/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

  return (
    <div>
      <Link href="/quotes" className="text-sm text-baykus-600 hover:underline">
        ← Teklifler
      </Link>
      <h1 className="text-2xl font-bold mt-2 mb-6">Yeni Teklif</h1>
      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}
      <form onSubmit={onSubmit} className="space-y-6">
        <div className="rounded-xl border bg-white p-5 shadow-sm grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-600 mb-1">Müşteri</label>
            <select className={input} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
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
            <label className="block text-xs text-slate-600 mb-1">Durum</label>
            <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
              {QUOTE_STATUSES.filter((s) => s !== "Siparişe Dönüştü").map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">Geçerlilik</label>
            <input type="date" className={input} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">İskonto (₺)</label>
            <input type="number" min={0} step="0.01" className={input} value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-slate-600 mb-1">Notlar</label>
            <textarea className={input} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold">Satırlar</h2>
            <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => setLines((p) => [...p, emptyLine()])}>
              + Satır
            </button>
          </div>
          {lines.map((line, idx) => (
            <div key={line.key} className="grid md:grid-cols-6 gap-2 rounded-lg bg-slate-50 p-3 border">
              <div className="md:col-span-2">
                <label className="text-[10px] text-slate-500">Ürün #{idx + 1}</label>
                <select
                  className={input}
                  value={line.product_id}
                  onChange={(e) => {
                    const prod = products.find((p) => String(p.id) === e.target.value);
                    updateLine(line.key, {
                      product_id: e.target.value,
                      description: prod?.name || line.description,
                      unit_price: prod ? String(prod.base_price ?? 0) : line.unit_price,
                    });
                  }}
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
                <label className="text-[10px] text-slate-500">Açıklama</label>
                <input className={input} value={line.description} onChange={(e) => updateLine(line.key, { description: e.target.value })} required />
              </div>
              <div>
                <label className="text-[10px] text-slate-500">Adet</label>
                <input className={input} type="number" min={1} value={line.quantity} onChange={(e) => updateLine(line.key, { quantity: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-slate-500">Birim ₺</label>
                <input className={input} type="number" min={0} step="0.01" value={line.unit_price} onChange={(e) => updateLine(line.key, { unit_price: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-slate-500">Beden</label>
                <input className={input} value={line.size} onChange={(e) => updateLine(line.key, { size: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-slate-500">Renk</label>
                <input className={input} value={line.color} onChange={(e) => updateLine(line.key, { color: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-slate-500">Baskı</label>
                <input className={input} value={line.print_type} onChange={(e) => updateLine(line.key, { print_type: e.target.value })} />
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button disabled={busy} type="submit" className="rounded-lg bg-baykus-600 text-white px-5 py-2 text-sm font-medium disabled:opacity-50">
            {busy ? "Kaydediliyor…" : "Teklifi Kaydet"}
          </button>
          <Link href="/quotes" className="rounded-lg border px-5 py-2 text-sm">
            Vazgeç
          </Link>
        </div>
      </form>
    </div>
  );
}
