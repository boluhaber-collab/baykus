"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import {
  Customer,
  Product,
  ProductDetail,
  ProductVariant,
  apiFetch,
  formatMoney,
} from "@/lib/api";

type SaleType = "perakende" | "yeni" | "kayitli" | "internet" | "teklif";

const SALE_TYPES: { id: SaleType; label: string; title: string }[] = [
  { id: "perakende", label: "Perakende", title: "Perakende Satış" },
  { id: "yeni", label: "Yeni Müşteri", title: "Yeni Müşteriye Satış" },
  { id: "kayitli", label: "Kayıtlı Müşteri", title: "Kayıtlı Müşteriye Satış" },
  { id: "internet", label: "İnternet Siparişi", title: "İnternet Siparişi" },
  { id: "teklif", label: "Teklif", title: "Teklif Girişi" },
];

const PAY_TYPES = ["Nakit", "EFT", "Kart", "Veresiye"] as const;
const NET_CHANNELS = ["internet", "Trendyol", "Hepsiburada", "N11"] as const;
const PRINT_TYPES = ["", "DTF", "Sublimasyon", "Serigrafi", "Nakış", "Transfer", "UV"] as const;

type Line = {
  key: string;
  product_id: string;
  variant_id?: string;
  description: string;
  quantity: string;
  size: string;
  color: string;
  print_type: string;
  unit_price: string;
  depo: string;
  stock_qty?: number | null;
};

type Wh = { id: number; name: string; is_default?: boolean; is_active?: boolean };

function emptyLine(): Line {
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
    depo: "Ana Depo",
    stock_qty: null,
  };
}

function normalizeType(raw: string | null): SaleType {
  const v = (raw || "kayitli").trim().toLowerCase();
  const map: Record<string, SaleType> = {
    perakende: "perakende",
    yeni: "yeni",
    yeni_musteri: "yeni",
    "yeni musteri": "yeni",
    kayitli: "kayitli",
    "kayitli musteri": "kayitli",
    internet: "internet",
    teklif: "teklif",
  };
  return map[v] || "kayitli";
}

function CreateSaleInner() {
  const router = useRouter();
  const search = useSearchParams();
  const mappedInitial = normalizeType(search.get("type"));

  const [saleType, setSaleType] = useState<SaleType>(mappedInitial);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [customerQ, setCustomerQ] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [channel, setChannel] = useState<string>("internet");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [payType, setPayType] = useState<(typeof PAY_TYPES)[number]>("Nakit");
  const [payAmount, setPayAmount] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [productQ, setProductQ] = useState("");
  const [warehouses, setWarehouses] = useState<Wh[]>([]);
  const [variantPick, setVariantPick] = useState<{
    lineKey: string;
    product: Product;
    detail: ProductDetail;
    variants: ProductVariant[];
    depo: string;
    whStocks: Record<string, number>;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setSaleType(normalizeType(search.get("type")));
  }, [search]);

  useEffect(() => {
    Promise.all([
      apiFetch<Customer[]>("/api/customers"),
      apiFetch<Product[]>("/api/products"),
      apiFetch<Wh[]>("/api/stock/warehouses?active=true").catch(() => [] as Wh[]),
    ])
      .then(([c, p, w]) => {
        setCustomers(c);
        setProducts(p);
        setWarehouses(w || []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Yükleme hatası"));
  }, []);

  const selectedCustomer = useMemo(
    () => customers.find((c) => String(c.id) === customerId) || null,
    [customers, customerId],
  );

  const filteredCustomers = useMemo(() => {
    const needle = customerQ.trim().toLocaleLowerCase("tr");
    if (!needle) return customers.slice(0, 80);
    return customers
      .filter((c) =>
        [c.name, c.company, c.phone, c.code]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("tr")
          .includes(needle),
      )
      .slice(0, 80);
  }, [customers, customerQ]);

  const filteredProducts = useMemo(() => {
    const needle = productQ.trim().toLocaleLowerCase("tr");
    if (!needle) return products;
    return products.filter((p) =>
      [p.sku, p.name, p.category]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr")
        .includes(needle),
    );
  }, [products, productQ]);

  async function loadWhStocks(productId: number): Promise<Record<string, number>> {
    const map: Record<string, number> = {};
    await Promise.all(
      warehouses.map(async (w) => {
        try {
          const rows = await apiFetch<{ product_id: number; variant_id: number | null; stock_qty: number }[]>(
            `/api/stock/warehouses/${w.id}/stock`,
          );
          for (const r of rows) {
            if (r.product_id === productId) {
              const key = `${w.name}::${r.variant_id ?? 0}`;
              map[key] = r.stock_qty;
              map[`${w.name}::0`] = (map[`${w.name}::0`] || 0) + r.stock_qty;
            }
          }
        } catch {
          /* ignore */
        }
      }),
    );
    return map;
  }

  async function applyProductToLine(lineKey: string, pid: string) {
    const prod = products.find((p) => String(p.id) === pid);
    if (!pid || !prod) {
      updateLine(lineKey, {
        product_id: "",
        variant_id: "",
        description: "",
        unit_price: "0",
        stock_qty: null,
        size: "",
        color: "",
      });
      return;
    }
    const defaultDepo =
      prod.warehouse ||
      warehouses.find((w) => w.is_default)?.name ||
      warehouses[0]?.name ||
      "Ana Depo";
    try {
      const detail = await apiFetch<ProductDetail>(`/api/products/${pid}`);
      const variants = detail.variants || [];
      const depo = detail.warehouse || defaultDepo;
      const whStocks = await loadWhStocks(Number(pid));
      if (variants.length > 1) {
        setVariantPick({ lineKey, product: prod, detail, variants, depo, whStocks });
        updateLine(lineKey, {
          product_id: pid,
          description: prod.name,
          unit_price: String(prod.base_price ?? 0),
          depo,
          stock_qty: prod.stock_qty ?? null,
        });
        return;
      }
      if (variants.length === 1) {
        const v = variants[0]!;
        const stock =
          whStocks[`${depo}::${v.id}`] ??
          whStocks[`${depo}::0`] ??
          v.stock_qty ??
          detail.stock_qty ??
          null;
        updateLine(lineKey, {
          product_id: pid,
          variant_id: String(v.id),
          description: prod.name,
          size: v.size || "",
          color: v.color || "",
          print_type: v.print_type || "",
          unit_price: String(v.price ?? prod.base_price ?? 0),
          depo,
          stock_qty: stock,
        });
        return;
      }
      updateLine(lineKey, {
        product_id: pid,
        variant_id: "",
        description: detail.name || prod.name,
        unit_price: String(detail.base_price ?? prod.base_price ?? 0),
        depo,
        stock_qty: whStocks[`${depo}::0`] ?? detail.stock_qty ?? prod.stock_qty ?? null,
      });
    } catch {
      updateLine(lineKey, {
        product_id: pid,
        description: prod.name,
        unit_price: String(prod.base_price ?? 0),
        depo: defaultDepo,
        stock_qty: prod.stock_qty ?? null,
      });
    }
  }

  function confirmVariant(v: ProductVariant, depoOverride?: string) {
    if (!variantPick) return;
    const depo = depoOverride || variantPick.depo;
    const stock =
      variantPick.whStocks[`${depo}::${v.id}`] ??
      variantPick.whStocks[`${depo}::0`] ??
      v.stock_qty ??
      null;
    updateLine(variantPick.lineKey, {
      product_id: String(variantPick.product.id),
      variant_id: String(v.id),
      description: variantPick.product.name,
      size: v.size || "",
      color: v.color || "",
      print_type: v.print_type || "",
      unit_price: String(v.price ?? variantPick.product.base_price ?? 0),
      depo,
      stock_qty: stock,
    });
    setVariantPick(null);
  }

  const linesTotal = useMemo(() => {
    return lines.reduce((sum, l) => {
      const qty = Number(l.quantity) || 0;
      const price = Number(l.unit_price) || 0;
      return sum + qty * price;
    }, 0);
  }, [lines]);

  const remaining = Math.max(0, linesTotal - (Number(payAmount) || 0));

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
    if (saleType === "yeni") {
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
    if (saleType === "kayitli") {
      if (!customerId) throw new Error("Kayıtlı müşteri seçin");
      return Number(customerId);
    }
    if (saleType === "internet" || saleType === "teklif") {
      return customerId ? Number(customerId) : null;
    }
    return null;
  }

  function buildLinesPayload() {
    const payload = lines
      .filter((l) => l.description.trim())
      .map((l) => ({
        product_id: l.product_id ? Number(l.product_id) : null,
        variant_id: l.variant_id ? Number(l.variant_id) : null,
        description: l.description.trim(),
        quantity: Math.max(1, Number(l.quantity) || 1),
        size: l.size || null,
        color: l.color || null,
        print_type: l.print_type || null,
        unit_price: Number(l.unit_price) || 0,
        discount_rate: 0,
        discount_amount: 0,
        warehouse: l.depo || null,
      }));
    if (!payload.length) throw new Error("En az bir ürün satırı gerekli");
    return payload;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    setBusy(true);
    try {
      const payloadLines = buildLinesPayload();
      const cid = await ensureCustomerId();
      const amount = payType === "Veresiye" ? 0 : Number(payAmount) || 0;
      const isQuote = saleType === "teklif";

      if (isQuote) {
        const created = await apiFetch<{ id: number }>("/api/quotes", {
          method: "POST",
          body: JSON.stringify({
            customer_id: cid,
            status: "Taslak",
            notes: notes || null,
            valid_until: dueDate || null,
            discount_amount: 0,
            lines: payloadLines,
          }),
        });
        setMsg("Teklif kaydedildi");
        router.push(`/quotes/${created.id}`);
        return;
      }

      const orderChannel =
        saleType === "internet"
          ? channel || "internet"
          : saleType === "perakende"
            ? "perakende"
            : "mağaza";

      // Kapora → deposit_amount (stok↓ + cari/finans order_flow)
      const created = await apiFetch<{ id: number }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          customer_id: cid,
          status: "Sipariş Alındı",
          notes: notes || null,
          channel: orderChannel,
          design_status: "Bekliyor",
          due_date: dueDate || null,
          deposit_amount: amount > 0 ? amount : 0,
          discount_amount: 0,
          lines: payloadLines,
        }),
      });

      setMsg("Satış kaydedildi · stok ve finans güncellendi");
      router.push(`/orders/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    } finally {
      setBusy(false);
    }
  }

  const meta = SALE_TYPES.find((t) => t.id === saleType) || SALE_TYPES[2];

  return (
    <div className="space-y-3 max-w-5xl">
      <div>
        <h2 className="text-base font-bold">{meta.title}</h2>
        <p className="text-xs text-baykus-muted">
          Satış / Sipariş › {meta.title} · masaüstü hızlı satış diyaloğu
        </p>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{msg}</div>}

      <form onSubmit={onSubmit} className="space-y-3">
        <fieldset className="rounded border bg-white px-3 py-3">
          <legend className="px-1 text-xs font-semibold">Satış Bilgileri</legend>
          <div className="flex flex-wrap gap-2 mb-3">
            {SALE_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setSaleType(t.id);
                  router.replace(`/sales/create?type=${t.id}`);
                }}
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

          <div className="grid md:grid-cols-2 gap-3">
            {saleType === "yeni" ? (
              <>
                <div>
                  <label className="block text-[11px] text-baykus-muted mb-0.5">Müşteri *</label>
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
                <p className="md:col-span-2 text-[11px] text-slate-500">
                  Yeni müşteri kaydı oluşturulur; satış cari + stok + kapora finans hareketi yazar.
                </p>
              </>
            ) : saleType === "kayitli" ? (
              <>
                <div className="md:col-span-2">
                  <label className="block text-[11px] text-baykus-muted mb-0.5">Müşteri Ara</label>
                  <input
                    className="bk-input mb-2"
                    placeholder="Ad / telefon / firma…"
                    value={customerQ}
                    onChange={(e) => setCustomerQ(e.target.value)}
                  />
                  <label className="block text-[11px] text-baykus-muted mb-0.5">Kayıtlı müşteri *</label>
                  <select
                    className="bk-input"
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    required
                  >
                    <option value="">— Seçin —</option>
                    {filteredCustomers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.phone ? ` | ${c.phone}` : ""}
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
              </>
            ) : saleType === "perakende" ? (
              <div className="md:col-span-2 text-sm text-baykus-muted">
                Perakende satış — müşteri isteğe bağlı (fihrist için önerilir).
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
                  {saleType === "teklif" ? "Müşteri (opsiyonel)" : "Müşteri"}
                </label>
                <select
                  className="bk-input max-w-lg"
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

            <div>
              <label className="block text-[11px] text-baykus-muted mb-0.5">
                {saleType === "teklif" ? "Geçerlilik" : "Teslim tarihi"}
              </label>
              <input type="date" className="bk-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-[11px] text-baykus-muted mb-0.5">Not / Baskı</label>
              <input className="bk-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        </fieldset>

        <fieldset className="rounded border bg-white px-3 py-3 space-y-2">
          <legend className="px-1 text-xs font-semibold">Ürün / Hizmet</legend>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="bk-input max-w-xs"
              placeholder="Ürün ara…"
              value={productQ}
              onChange={(e) => setProductQ(e.target.value)}
            />
            <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => setLines((p) => [...p, emptyLine()])}>
              Ürün ekle
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
                  <th>Depo</th>
                  <th>Baskı</th>
                  <th>Adet</th>
                  <th>Birim Fiyat</th>
                  <th>Toplam</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const lineTot = (Number(line.quantity) || 0) * (Number(line.unit_price) || 0);
                  return (
                    <tr key={line.key}>
                      <td className="min-w-[160px]">
                        <select
                          className="bk-input"
                          value={line.product_id}
                          onChange={(e) => {
                            void applyProductToLine(line.key, e.target.value);
                          }}
                        >
                          <option value="">— Manuel —</option>
                          {filteredProducts.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.sku} — {p.name}
                            </option>
                          ))}
                        </select>
                        {line.stock_qty != null && (
                          <div
                            className={`text-[10px] mt-0.5 ${
                              Number(line.stock_qty) < Number(line.quantity) ? "text-red-600" : "text-baykus-muted"
                            }`}
                          >
                            Stok: {line.stock_qty}
                          </div>
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
                        <input className="bk-input w-16" value={line.size} onChange={(e) => updateLine(line.key, { size: e.target.value })} />
                      </td>
                      <td>
                        <input className="bk-input w-20" value={line.color} onChange={(e) => updateLine(line.key, { color: e.target.value })} />
                      </td>
                      <td>
                        <select
                          className="bk-input w-28"
                          value={line.depo}
                          onChange={(e) => {
                            const depo = e.target.value;
                            updateLine(line.key, { depo });
                            if (line.product_id) {
                              void (async () => {
                                const map = await loadWhStocks(Number(line.product_id));
                                const vid = line.variant_id ? Number(line.variant_id) : 0;
                                updateLine(line.key, {
                                  depo,
                                  stock_qty: map[`${depo}::${vid}`] ?? map[`${depo}::0`] ?? line.stock_qty,
                                });
                              })();
                            }
                          }}
                        >
                          {(warehouses.length ? warehouses.map((w) => w.name) : [line.depo || "Ana Depo"]).map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select className="bk-input w-28" value={line.print_type} onChange={(e) => updateLine(line.key, { print_type: e.target.value })}>
                          {PRINT_TYPES.map((pt) => (
                            <option key={pt || "empty"} value={pt}>
                              {pt || "—"}
                            </option>
                          ))}
                        </select>
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
                      <td className="tabular-nums text-xs font-semibold">{formatMoney(lineTot)}</td>
                      <td>
                        <button
                          type="button"
                          className="text-red-600 text-xs hover:underline"
                          onClick={() => setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== line.key)))}
                        >
                          Sil
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="text-right text-sm font-semibold tabular-nums">Ara toplam: {formatMoney(linesTotal)}</div>
        </fieldset>

        {saleType !== "teklif" && (
          <fieldset className="rounded border bg-white px-3 py-3">
            <legend className="px-1 text-xs font-semibold">Ödeme / Kapora</legend>
            <div className="grid sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-[11px] text-baykus-muted mb-0.5">Ödeme tipi</label>
                <select
                  className="bk-input"
                  value={payType}
                  onChange={(e) => {
                    const v = e.target.value as (typeof PAY_TYPES)[number];
                    setPayType(v);
                    if (v === "Veresiye") setPayAmount("0");
                    else if (!payAmount) setPayAmount(String(linesTotal.toFixed(2)));
                  }}
                >
                  {PAY_TYPES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-baykus-muted mb-0.5">Kapora / ödeme (₺)</label>
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
              <div className="text-xs space-y-0.5 pb-1">
                <div>
                  Toplam: <strong className="tabular-nums">{formatMoney(linesTotal)}</strong>
                </div>
                <div>
                  Kapora:{" "}
                  <strong className="tabular-nums text-emerald-700">
                    {payType === "Veresiye" ? "0,00 ₺" : formatMoney(Number(payAmount) || 0)}
                  </strong>
                </div>
                <div>
                  Kalan: <strong className="tabular-nums text-red-700">{formatMoney(remaining)}</strong>
                </div>
                <div className="text-[10px] text-baykus-muted">
                  {payType === "Veresiye"
                    ? "Veresiye: kapora yok · cari borç + stok↓"
                    : payType === "Nakit"
                      ? "Nakit → kasa tahsilat + stok↓"
                      : "EFT/Kart → kapora kaydı + stok↓"}
                </div>
              </div>
            </div>
          </fieldset>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className="bk-btn bk-btn-primary" style={{ background: "#198754" }}>
            {busy ? "Kaydediliyor…" : saleType === "teklif" ? "Teklifi Kaydet" : "Satışı Kaydet"}
          </button>
          <Link href="/sales" className="bk-btn bk-btn-ghost">
            Vazgeç
          </Link>
        </div>
      </form>

      {variantPick && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-slate-200">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div>
                <div className="text-sm font-bold">Varyant / Depo Seç</div>
                <div className="text-xs text-baykus-muted">{variantPick.product.name}</div>
              </div>
              <button type="button" className="text-slate-500 hover:text-slate-800 text-lg leading-none" onClick={() => setVariantPick(null)}>
                ×
              </button>
            </div>
            <div className="px-4 py-2 border-b">
              <label className="text-[11px] text-baykus-muted">Depo</label>
              <select
                className="bk-input w-full mt-0.5"
                value={variantPick.depo}
                onChange={(e) => setVariantPick({ ...variantPick, depo: e.target.value })}
              >
                {(warehouses.length ? warehouses.map((w) => w.name) : [variantPick.depo]).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="max-h-72 overflow-auto p-2 space-y-1">
              {variantPick.variants.map((v) => {
                const stock =
                  variantPick.whStocks[`${variantPick.depo}::${v.id}`] ??
                  variantPick.whStocks[`${variantPick.depo}::0`] ??
                  v.stock_qty ??
                  0;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => confirmVariant(v)}
                    className="w-full text-left rounded-lg border border-slate-200 px-3 py-2 hover:border-baykus-primary hover:bg-sky-50 transition"
                  >
                    <div className="text-sm font-medium">
                      {[v.color, v.size, v.name].filter(Boolean).join(" / ") || v.sku || `Varyant #${v.id}`}
                    </div>
                    <div className="text-xs text-baykus-muted flex justify-between mt-0.5">
                      <span className={stock <= 0 ? "text-red-600 font-semibold" : ""}>
                        Stok ({variantPick.depo}): {stock}
                      </span>
                      <span className="font-semibold text-baykus-text">{formatMoney(Number(v.price || 0))}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
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
