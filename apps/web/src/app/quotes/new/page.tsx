"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch, AppSettings, Customer, Product, ProductPricingInfo, QUOTE_STATUSES, formatMoney } from "@/lib/api";

type Line = {
  key: string;
  product_id: string;
  description: string;
  quantity: string;
  size: string;
  color: string;
  print_type: string;
  unit_price: string;
  stock_qty?: number | null;
  is_critical?: boolean;
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
    stock_qty: null,
    is_critical: false,
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
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedCustomer = useMemo(
    () => customers.find((c) => String(c.id) === customerId) || null,
    [customers, customerId],
  );

  useEffect(() => {
    Promise.all([
      apiFetch<Customer[]>("/api/customers"),
      apiFetch<Product[]>("/api/products"),
      apiFetch<AppSettings>("/api/settings/app").catch(() => null),
    ])
      .then(([c, p, s]) => {
        setCustomers(c);
        setProducts(p);
        if (s) setSettings(s);
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

  const input = "w-full rounded-lg border border-baykus-line px-3 py-2 text-sm";

  return (
    <div>
      <Link href="/quotes" className="text-sm text-baykus-primary hover:underline">
        ← Teklifler
      </Link>
      <h1 className="text-2xl font-bold mt-2 mb-6">Yeni Teklif</h1>
      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}
      <form onSubmit={onSubmit} className="space-y-6">
        <div className="rounded-xl border bg-white p-5 shadow-sm grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-baykus-muted mb-1">Müşteri</label>
            <select className={input} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">— Seçin —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.company ? ` (${c.company})` : ""}
                </option>
              ))}
            </select>
            {selectedCustomer && (
              <div className="mt-2 rounded-lg border border-baykus-line bg-baykus-bg px-3 py-2 text-xs space-y-1">
                <div>
                  Telefon: <strong>{selectedCustomer.phone || "—"}</strong>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <span>
                    Açık bakiye:{" "}
                    <strong className="tabular-nums">{formatMoney(Number(selectedCustomer.balance || 0))}</strong>
                  </span>
                  <Link href={`/customers/${selectedCustomer.id}`} className="text-baykus-primary hover:underline">
                    Cari kartı →
                  </Link>
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs text-baykus-muted mb-1">Durum</label>
            <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
              {QUOTE_STATUSES.filter((s) => s !== "Siparişe Dönüştü").map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-baykus-muted mb-1">Geçerlilik</label>
            <input type="date" className={input} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-baykus-muted mb-1">İskonto (₺)</label>
            <input type="number" min={0} step="0.01" className={input} value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-baykus-muted mb-1">Notlar</label>
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
            <div key={line.key} className="grid md:grid-cols-6 gap-2 rounded-lg bg-baykus-bg p-3 border">
              <div className="md:col-span-2">
                <label className="text-[10px] text-baykus-muted">Ürün #{idx + 1}</label>
                <select
                  className={input}
                  value={line.product_id}
                  onChange={async (e) => {
                    const pid = e.target.value;
                    const prod = products.find((p) => String(p.id) === pid);
                    updateLine(line.key, {
                      product_id: pid,
                      description: prod?.name || line.description,
                      unit_price: prod ? String(prod.base_price ?? 0) : line.unit_price,
                      stock_qty: prod?.stock_qty ?? null,
                      is_critical: Boolean(prod?.is_critical),
                    });
                    if (!pid) return;
                    try {
                      const info = await apiFetch<ProductPricingInfo>(`/api/products/${pid}/pricing`);
                      updateLine(line.key, {
                        description: info.name || prod?.name || line.description,
                        unit_price: String(info.unit_price ?? 0),
                        stock_qty: info.stock_qty,
                        is_critical: info.is_critical,
                      });
                    } catch {
                      /* keep fallback */
                    }
                  }}
                >
                  <option value="">— Manuel —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.name}
                    </option>
                  ))}
                </select>
                {line.product_id && (
                  <div className="mt-1 text-[11px] text-baykus-muted">
                    Stok:{" "}
                    <strong
                      className={
                        line.is_critical ||
                        (line.stock_qty != null && Number(line.quantity) > line.stock_qty)
                          ? "text-red-700"
                          : ""
                      }
                    >
                      {line.stock_qty ?? "—"}
                    </strong>
                    {line.stock_qty != null && Number(line.quantity) > line.stock_qty && (
                      <span className="ml-2 text-red-700 font-medium">Miktar stoktan fazla!</span>
                    )}
                  </div>
                )}
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] text-baykus-muted">Açıklama</label>
                <input className={input} value={line.description} onChange={(e) => updateLine(line.key, { description: e.target.value })} required />
              </div>
              <div>
                <label className="text-[10px] text-baykus-muted">Adet</label>
                <input className={input} type="number" min={1} value={line.quantity} onChange={(e) => updateLine(line.key, { quantity: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-baykus-muted">Birim ₺</label>
                <input className={input} type="number" min={0} step="0.01" value={line.unit_price} onChange={(e) => updateLine(line.key, { unit_price: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-baykus-muted">Beden</label>
                <input className={input} value={line.size} onChange={(e) => updateLine(line.key, { size: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-baykus-muted">Renk</label>
                <input className={input} value={line.color} onChange={(e) => updateLine(line.key, { color: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-baykus-muted">Baskı</label>
                <input className={input} value={line.print_type} onChange={(e) => updateLine(line.key, { print_type: e.target.value })} />
              </div>
            </div>
          ))}
        </div>

        {(settings?.teklif_sablon_sartlar_goster === "Evet" || settings?.teklif_sablon_kapanis) && (
          <div className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Teklif Şartları / Şablon</h2>
              <Link href="/settings?tab=sablon" className="text-xs text-baykus-primary hover:underline">
                Şablon Yönetimi →
              </Link>
            </div>
            {settings.teklif_sablon_baslik && (
              <div>
                <div className="text-[10px] text-baykus-muted uppercase">Başlık</div>
                <div className="text-sm font-bold">{settings.teklif_sablon_baslik}</div>
                {settings.teklif_sablon_alt_baslik && (
                  <div className="text-xs text-baykus-muted">{settings.teklif_sablon_alt_baslik}</div>
                )}
              </div>
            )}
            {settings.teklif_sablon_sartlar_goster === "Evet" && settings.teklif_sablon_sartlar && (
              <div>
                <div className="text-[10px] text-baykus-muted uppercase mb-1">Şartlar</div>
                <pre className="whitespace-pre-wrap text-xs bg-baykus-bg rounded-lg border px-3 py-2 font-sans">
{settings.teklif_sablon_sartlar}
                </pre>
              </div>
            )}
            {settings.teklif_sablon_kapanis && (
              <div>
                <div className="text-[10px] text-baykus-muted uppercase mb-1">Kapanış</div>
                <p className="text-xs text-slate-700">{settings.teklif_sablon_kapanis}</p>
              </div>
            )}
            <p className="text-[11px] text-baykus-muted">
              PDF çıktısında Şablon Yönetimi alanları kullanılır (Ayarlar › Şablon Yönetimi).
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <button disabled={busy} type="submit" className="rounded-lg bg-baykus-primary text-white px-5 py-2 text-sm font-medium disabled:opacity-50">
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
