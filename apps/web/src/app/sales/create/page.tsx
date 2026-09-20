"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import {
  Customer,
  Product,
  ProductPricingInfo,
  apiFetch,
  formatMoney,
} from "@/lib/api";

type SaleType = "perakende" | "yeni_musteri" | "kayitli" | "internet" | "teklif";

const SALE_TYPES: { id: SaleType; label: string }[] = [
  { id: "perakende", label: "Perakende" },
  { id: "yeni_musteri", label: "Yeni Müşteri" },
  { id: "kayitli", label: "Kayıtlı Müşteri" },
  { id: "internet", label: "İnternet Siparişi" },
  { id: "teklif", label: "Teklif" },
];

const PAY_TYPES = ["Nakit", "EFT", "Kart", "Veresiye"] as const;
const NET_CHANNELS = ["internet", "Trendyol", "Hepsiburada", "N11"] as const;

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
  };
}

function payMethodApi(label: string): string {
  const m: Record<string, string> = {
    Nakit: "nakit",
    EFT: "eft",
    Kart: "kart",
    Veresiye: "veresiye",
  };
  return m[label] || "nakit";
}

function CreateSaleInner() {
  const router = useRouter();
  const search = useSearchParams();
  const initialType = (search.get("type") as SaleType) || "kayitli";
  const mappedInitial: SaleType =
    initialType === "internet" || SALE_TYPES.some((t) => t.id === initialType)
      ? (initialType === "internet" ? "internet" : initialType)
      : "kayitli";

  const [saleType, setSaleType] = useState<SaleType>(mappedInitial);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [channel, setChannel] = useState<string>("internet");
  const [notes, setNotes] = useState("");
  const [payType, setPayType] = useState<(typeof PAY_TYPES)[number]>("Nakit");
  const [payAmount, setPayAmount] = useState("");
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
      .catch((e) => setError(e instanceof Error ? e.message : "Yükleme hatası"));
  }, []);

  const selectedCustomer = useMemo(
    () => customers.find((c) => String(c.id) === customerId) || null,
    [customers, customerId],
  );

  const linesTotal = useMemo(() => {
    return lines.reduce((sum, l) => {
      const qty = Number(l.quantity) || 0;
      const price = Number(l.unit_price) || 0;
      return sum + qty * price;
    }, 0);
  }, [lines]);

  useEffect(() => {
    if (!payAmount && linesTotal > 0 && payType !== "Veresiye") {
      setPayAmount(String(linesTotal.toFixed(2)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linesTotal, payType]);

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function ensureCustomerId(): Promise<number | null> {
    if (saleType === "perakende") return customerId ? Number(customerId) : null;
    if (saleType === "yeni_musteri") {
      if (!newName.trim()) throw new Error("Yeni müşteri adı gerekli");
      const created = await apiFetch<{ id: number }>("/api/customers", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          phone: newPhone.trim() || null,
          company: newCompany.trim() || null,
          is_active: true,
          opening_balance: 0,
        }),
      });
      return created.id;
    }
    if (saleType === "kayitli" || saleType === "internet" || saleType === "teklif") {
      return customerId ? Number(customerId) : null;
    }
    return null;
  }

  function buildLinesPayload() {
    const payload = lines
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
    if (!payload.length) throw new Error("En az bir ürün satırı gerekli");
    return payload;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const payloadLines = buildLinesPayload();
      const cid = await ensureCustomerId();
      const amount = Number(payAmount) || 0;
      const isQuote = saleType === "teklif";

      if (isQuote) {
        const created = await apiFetch<{ id: number }>("/api/quotes", {
          method: "POST",
          body: JSON.stringify({
            customer_id: cid,
            status: "Taslak",
            notes: notes || null,
            discount_amount: 0,
            lines: payloadLines,
          }),
        });
        router.push(`/quotes/${created.id}`);
        return;
      }

      const orderChannel =
        saleType === "internet"
          ? channel || "internet"
          : saleType === "perakende"
            ? "perakende"
            : "mağaza";

      const created = await apiFetch<{ id: number }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          customer_id: cid,
          status: "Sipariş Alındı",
          notes: notes || null,
          channel: orderChannel,
          design_status: "bekliyor",
          deposit_amount: 0,
          discount_amount: 0,
          lines: payloadLines,
        }),
      });

      // Ödeme tipi ile tahsilat (çift kapora yazmamak için deposit=0)
      if (payType !== "Veresiye" && amount > 0) {
        await apiFetch(`/api/orders/${created.id}/payments`, {
          method: "POST",
          body: JSON.stringify({
            amount,
            method: payMethodApi(payType),
            notes: `${payType} tahsilat`,
            post_to_cari: Boolean(cid),
            // Banka hesabı seçimi yok; yalnızca nakit kasaya yazılır
            post_to_finance: payType === "Nakit",
            finance_method: payType === "Nakit" ? "cash" : null,
          }),
        });
      }

      router.push(`/orders/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 max-w-5xl">
      <div>
        <h2 className="text-base font-bold">Satış / Teklif Oluştur</h2>
        <p className="text-xs text-baykus-muted">
          Masaüstü hızlı satış ekranı · tip seçin, satır ekleyin, ödeme alın
        </p>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="bk-card p-3">
          <div className="text-xs font-semibold text-baykus-muted mb-2">Satış tipi</div>
          <div className="flex flex-wrap gap-2">
            {SALE_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSaleType(t.id)}
                className={`rounded px-3 py-1.5 text-xs font-semibold border ${
                  saleType === t.id
                    ? "bg-baykus-primary text-white border-baykus-primary"
                    : "bg-white text-baykus-text border-baykus-line hover:bg-baykus-bg"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bk-card p-3 grid md:grid-cols-2 gap-3">
          {saleType === "yeni_musteri" ? (
            <>
              <div>
                <label className="block text-[11px] text-baykus-muted mb-0.5">Müşteri adı *</label>
                <input className="bk-input" value={newName} onChange={(e) => setNewName(e.target.value)} required />
              </div>
              <div>
                <label className="block text-[11px] text-baykus-muted mb-0.5">Telefon</label>
                <input className="bk-input" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] text-baykus-muted mb-0.5">Firma</label>
                <input className="bk-input" value={newCompany} onChange={(e) => setNewCompany(e.target.value)} />
              </div>
            </>
          ) : saleType === "perakende" ? (
            <div className="md:col-span-2 text-sm text-baykus-muted">
              Perakende satış — müşteri isteğe bağlı.
              <select
                className="bk-input mt-2 max-w-md"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">— Müşterisiz / perakende —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.company ? ` (${c.company})` : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="md:col-span-2">
              <label className="block text-[11px] text-baykus-muted mb-0.5">
                {saleType === "teklif" ? "Müşteri (opsiyonel)" : "Kayıtlı müşteri"}
              </label>
              <select
                className="bk-input max-w-lg"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                required={saleType === "kayitli"}
              >
                <option value="">— Seçin —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.company ? ` (${c.company})` : ""}
                  </option>
                ))}
              </select>
              {selectedCustomer && (
                <div className="mt-2 text-xs text-baykus-muted">
                  Tel: {selectedCustomer.phone || "—"} · Bakiye:{" "}
                  <strong className="tabular-nums">{formatMoney(Number(selectedCustomer.balance || 0))}</strong>
                  {" · "}
                  <Link href={`/customers/${selectedCustomer.id}`} className="text-baykus-primary hover:underline">
                    Cari kartı
                  </Link>
                </div>
              )}
            </div>
          )}

          {saleType === "internet" && (
            <div>
              <label className="block text-[11px] text-baykus-muted mb-0.5">Kanal</label>
              <select className="bk-input" value={channel} onChange={(e) => setChannel(e.target.value)}>
                {NET_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className={saleType === "internet" ? "" : "md:col-span-2"}>
            <label className="block text-[11px] text-baykus-muted mb-0.5">Not</label>
            <input className="bk-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="bk-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Ürün satırları</div>
            <button
              type="button"
              className="bk-btn bk-btn-ghost text-xs"
              onClick={() => setLines((p) => [...p, emptyLine()])}
            >
              + Satır
            </button>
          </div>
          <div className="bk-table-wrap">
            <table className="bk-table">
              <thead>
                <tr>
                  <th>Ürün</th>
                  <th>Açıklama</th>
                  <th>Beden</th>
                  <th>Renk</th>
                  <th>Baskı</th>
                  <th>Adet</th>
                  <th>Fiyat</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.key}>
                    <td className="min-w-[160px]">
                      <select
                        className="bk-input"
                        value={line.product_id}
                        onChange={async (e) => {
                          const pid = e.target.value;
                          const prod = products.find((p) => String(p.id) === pid);
                          updateLine(line.key, {
                            product_id: pid,
                            description: prod?.name || line.description,
                            unit_price: prod ? String(prod.base_price ?? 0) : line.unit_price,
                            stock_qty: prod?.stock_qty ?? null,
                          });
                          if (!pid) return;
                          try {
                            const info = await apiFetch<ProductPricingInfo>(`/api/products/${pid}/pricing`);
                            updateLine(line.key, {
                              description: info.name || prod?.name || line.description,
                              unit_price: String(info.unit_price ?? 0),
                              stock_qty: info.stock_qty,
                            });
                          } catch {
                            /* keep */
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
                      {line.stock_qty != null && (
                        <div className="text-[10px] text-baykus-muted mt-0.5">Stok: {line.stock_qty}</div>
                      )}
                    </td>
                    <td>
                      <input
                        className="bk-input min-w-[120px]"
                        value={line.description}
                        onChange={(e) => updateLine(line.key, { description: e.target.value })}
                        required
                      />
                    </td>
                    <td>
                      <input
                        className="bk-input w-16"
                        value={line.size}
                        onChange={(e) => updateLine(line.key, { size: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="bk-input w-20"
                        value={line.color}
                        onChange={(e) => updateLine(line.key, { color: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="bk-input w-24"
                        value={line.print_type}
                        onChange={(e) => updateLine(line.key, { print_type: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="bk-input w-16"
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="bk-input w-24"
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.unit_price}
                        onChange={(e) => updateLine(line.key, { unit_price: e.target.value })}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="text-red-600 text-xs hover:underline"
                        onClick={() =>
                          setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== line.key)))
                        }
                      >
                        Sil
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-right text-sm font-semibold tabular-nums">
            Ara toplam: {formatMoney(linesTotal)}
          </div>
        </div>

        {saleType !== "teklif" && (
          <div className="bk-card p-3 grid sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-[11px] text-baykus-muted mb-0.5">Ödeme tipi</label>
              <select
                className="bk-input"
                value={payType}
                onChange={(e) => setPayType(e.target.value as (typeof PAY_TYPES)[number])}
              >
                {PAY_TYPES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-baykus-muted mb-0.5">Ödeme tutarı (₺)</label>
              <input
                className="bk-input"
                type="number"
                min={0}
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                disabled={payType === "Veresiye"}
              />
            </div>
            <div className="text-xs text-baykus-muted pb-2">
              {payType === "Veresiye"
                ? "Veresiye: kapora yok, cariye borç yazılır."
                : "Kapora / tahsilat siparişe işlenir."}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className="bk-btn bk-btn-primary">
            {busy
              ? "Kaydediliyor…"
              : saleType === "teklif"
                ? "Teklifi Kaydet"
                : "Siparişi Kaydet"}
          </button>
          <Link href="/sales" className="bk-btn bk-btn-ghost">
            Vazgeç
          </Link>
        </div>
      </form>
    </div>
  );
}

export default function CreateSalePage() {
  return (
    <Suspense fallback={<div className="text-sm text-baykus-muted p-4">Yükleniyor…</div>}>
      <CreateSaleInner />
    </Suspense>
  );
}
