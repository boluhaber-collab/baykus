"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  CriticalStockItem,
  Product,
  ProductDetail,
  Supplier,
  apiFetch,
  formatMoney,
} from "@/lib/api";

type LineForm = {
  description: string;
  quantity: string;
  unit_cost: string;
  product_id: string;
  variant_id: string;
};

type TalepRow = CriticalStockItem & {
  key: string;
  selected: boolean;
  talep: number;
};

function NewPurchaseForm() {
  const router = useRouter();
  const search = useSearchParams();
  const presetSupplier = search.get("supplier_id") || "";
  const modeParam = search.get("mode") || "talep";

  const [tab, setTab] = useState<"talep" | "manuel">(modeParam === "manuel" ? "manuel" : "talep");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productDetails, setProductDetails] = useState<Record<number, ProductDetail>>({});
  const [supplierId, setSupplierId] = useState(presetSupplier);
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [taxAmount, setTaxAmount] = useState("0");
  const [confirmOnSave, setConfirmOnSave] = useState(true);
  const [lines, setLines] = useState<LineForm[]>([
    { description: "", quantity: "1", unit_cost: "0", product_id: "", variant_id: "" },
  ]);
  const [kritik, setKritik] = useState("5");
  const [ara, setAra] = useState("");
  const [talepRows, setTalepRows] = useState<TalepRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const loadTalep = useCallback(async () => {
    setError("");
    try {
      const items = await apiFetch<CriticalStockItem[]>("/api/products/critical");
      const thr = Number(kritik) || 5;
      const needle = ara.trim().toLocaleLowerCase("tr");
      const mapped: TalepRow[] = items
        .filter((r) => r.stock_qty <= thr)
        .filter((r) => {
          if (!needle) return true;
          const hay = [r.supplier_name, r.category, r.product_name, r.variant_name, r.size, r.color, r.print_type]
            .join(" ")
            .toLocaleLowerCase("tr");
          return hay.includes(needle);
        })
        .map((r) => {
          const hedef = Math.max(thr, 1);
          const onerilen = Math.max(hedef - r.stock_qty, 1);
          return {
            ...r,
            key: `${r.product_id}-${r.variant_id ?? "p"}`,
            selected: false,
            talep: onerilen,
          };
        });
      setTalepRows(mapped);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kritik stok yüklenemedi");
    }
  }, [kritik, ara]);

  useEffect(() => {
    Promise.all([
      apiFetch<Supplier[]>("/api/suppliers?active=true"),
      apiFetch<Product[]>("/api/products?active_only=true"),
    ])
      .then(([s, p]) => {
        setSuppliers(s);
        setProducts(p.filter((x) => x.product_type !== "hizmet"));
        if (!presetSupplier && s.length) setSupplierId(String(s[0]!.id));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Yükleme hatası"));
  }, [presetSupplier]);

  useEffect(() => {
    if (tab === "talep") void loadTalep();
  }, [tab, loadTalep]);

  const selectedTalep = useMemo(() => talepRows.filter((r) => r.selected), [talepRows]);
  const talepToplamAdet = selectedTalep.reduce((s, r) => s + Math.max(0, r.talep), 0);

  const subtotal = useMemo(
    () => lines.reduce((sum, l) => sum + Number(l.quantity || 0) * Number(l.unit_cost || 0), 0),
    [lines],
  );
  const total = subtotal + Number(taxAmount || 0);

  function setLine(idx: number, patch: Partial<LineForm>) {
    setLines((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function toggleRow(key: string) {
    setTalepRows((rows) => rows.map((r) => (r.key === key ? { ...r, selected: !r.selected } : r)));
  }

  function toggleAll() {
    const allOn = talepRows.length > 0 && talepRows.every((r) => r.selected);
    setTalepRows((rows) => rows.map((r) => ({ ...r, selected: !allOn })));
  }

  async function onProductChange(idx: number, productId: string) {
    const product = products.find((p) => String(p.id) === productId);
    if (!productId) {
      setLine(idx, { product_id: "", variant_id: "", description: "", unit_cost: "0" });
      return;
    }
    let detail = productDetails[Number(productId)];
    if (!detail) {
      try {
        detail = await apiFetch<ProductDetail>(`/api/products/${productId}`);
        setProductDetails((m) => ({ ...m, [detail!.id]: detail! }));
      } catch {
        detail = undefined as unknown as ProductDetail;
      }
    }
    const variants = detail?.variants || [];
    setLine(idx, {
      product_id: productId,
      variant_id: variants.length === 1 ? String(variants[0]!.id) : "",
      description: product
        ? variants.length === 1
          ? `${product.name} — ${variants[0]!.name}`
          : product.name
        : lines[idx]!.description,
      unit_cost: product ? String(product.purchase_price ?? product.cost ?? 0) : lines[idx]!.unit_cost,
    });
  }

  function onVariantChange(idx: number, variantId: string) {
    const product = products.find((p) => String(p.id) === lines[idx]!.product_id);
    const detail = productDetails[Number(lines[idx]!.product_id)];
    const variant = detail?.variants?.find((v) => String(v.id) === variantId);
    setLine(idx, {
      variant_id: variantId,
      description: product && variant ? `${product.name} — ${variant.name}` : lines[idx]!.description,
    });
  }

  async function createPurchase(payloadLines: {
    description: string;
    quantity: number;
    unit_cost: number;
    product_id: number | null;
    variant_id: number | null;
  }[], noteExtra?: string) {
    if (!supplierId) throw new Error("Tedarikçi seçin");
    if (!payloadLines.length) throw new Error("En az bir satır gerekli");
    const created = await apiFetch<{ id: number }>("/api/purchases", {
      method: "POST",
      body: JSON.stringify({
        supplier_id: Number(supplierId),
        purchase_date: purchaseDate,
        notes: [notes.trim(), noteExtra].filter(Boolean).join(" · ") || null,
        tax_amount: Number(taxAmount || 0),
        confirm: confirmOnSave,
        lines: payloadLines,
      }),
    });
    return created;
  }

  async function convertTalep() {
    setLoading(true);
    setError("");
    setMsg("");
    try {
      if (!selectedTalep.length) throw new Error("Önce ürün seçin");
      // Group by supplier name → try match supplier; else use selected supplierId
      const payloadLines = selectedTalep.map((r) => ({
        description: [r.product_name, r.variant_name, r.size, r.color].filter(Boolean).join(" — "),
        quantity: Math.max(1, r.talep),
        unit_cost: Number(r.purchase_price || 0),
        product_id: r.product_id,
        variant_id: r.variant_id ?? null,
      }));
      // If all selected share a supplier_name that matches a supplier, prefer it
      const names = [...new Set(selectedTalep.map((r) => (r.supplier_name || "").trim()).filter(Boolean))];
      let sid = supplierId;
      if (names.length === 1) {
        const match = suppliers.find(
          (s) => s.name.toLocaleLowerCase("tr") === names[0]!.toLocaleLowerCase("tr"),
        );
        if (match) sid = String(match.id);
      }
      if (!sid) throw new Error("Tedarikçi seçin");
      setSupplierId(sid);
      const created = await apiFetch<{ id: number }>("/api/purchases", {
        method: "POST",
        body: JSON.stringify({
          supplier_id: Number(sid),
          purchase_date: purchaseDate,
          notes: notes.trim() || "Satın Alma Talebi",
          tax_amount: 0,
          confirm: confirmOnSave,
          lines: payloadLines,
        }),
      });
      setMsg("Satın alma belgesi oluşturuldu");
      router.push(`/purchases/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dönüşüm hatası");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = lines.map((l) => ({
        description: l.description.trim(),
        quantity: Number(l.quantity),
        unit_cost: Number(l.unit_cost),
        product_id: l.product_id ? Number(l.product_id) : null,
        variant_id: l.variant_id ? Number(l.variant_id) : null,
      }));
      const created = await createPurchase(payload);
      router.push(`/purchases/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    } finally {
      setLoading(false);
    }
  }

  const input =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-baykus-500";

  return (
    <div className="max-w-6xl space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href="/purchases" className="text-sm text-baykus-600 hover:underline">
            ← Satın Alma
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Satın Alma Talebi</h1>
          <p className="text-slate-500 text-sm">Tedarik Merkezi › Satın Alma Talebi · kritik stok → alış belgesi</p>
        </div>
        <div className="flex gap-2">
          <Link href="/stock/critical" className="bk-btn bk-btn-ghost text-xs">
            Kritik Stok
          </Link>
          <Link href="/suppliers" className="bk-btn bk-btn-ghost text-xs">
            Tedarikçiler
          </Link>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm">{msg}</div>}

      <div className="flex gap-2">
        <button
          type="button"
          className={`bk-btn text-xs ${tab === "talep" ? "bk-btn-primary" : "bk-btn-ghost"}`}
          onClick={() => setTab("talep")}
        >
          Kritik stok talebi
        </button>
        <button
          type="button"
          className={`bk-btn text-xs ${tab === "manuel" ? "bk-btn-primary" : "bk-btn-ghost"}`}
          onClick={() => setTab("manuel")}
        >
          Manuel alış belgesi
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm grid sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Tedarikçi *</label>
          <select required className={input} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Seçin</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code ? `${s.code} — ` : ""}
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Tarih</label>
          <input type="date" className={input} value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Notlar</label>
          <input className={input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Talep / irsaliye notu" />
        </div>
      </div>

      {tab === "talep" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3 rounded border bg-white px-3 py-2">
            <label className="text-xs">
              Kritik seviye
              <input
                className="bk-input mt-0.5 block w-20"
                value={kritik}
                onChange={(e) => setKritik(e.target.value)}
              />
            </label>
            <label className="text-xs">
              Ara
              <input
                className="bk-input mt-0.5 block min-w-[200px]"
                value={ara}
                onChange={(e) => setAra(e.target.value)}
                placeholder="Tedarikçi / ürün / beden…"
              />
            </label>
            <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={loadTalep}>
              Yenile
            </button>
            <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={toggleAll}>
              Tümünü seç / kaldır
            </button>
            <div className="ml-auto text-xs font-semibold text-teal-800">
              Seçilen ürün: {selectedTalep.length} | Talep edilen toplam: {talepToplamAdet} adet
            </div>
          </div>
          <div className="text-xs text-baykus-muted">Satın alma önerisi: {talepRows.length} ürün</div>

          <div className="bk-table-wrap max-h-[480px] overflow-auto">
            <table className="bk-table text-xs">
              <thead>
                <tr>
                  <th>Seç</th>
                  <th>Tedarikçi</th>
                  <th>Kategori</th>
                  <th>Ürün</th>
                  <th>Beden</th>
                  <th>Renk</th>
                  <th>Baskı</th>
                  <th className="text-right">Stok</th>
                  <th className="text-right">Talep Adedi</th>
                  <th className="text-right">Alış Fiyatı</th>
                </tr>
              </thead>
              <tbody>
                {talepRows.map((r) => (
                  <tr
                    key={r.key}
                    className={r.stock_qty < 0 ? "bg-red-50" : r.stock_qty < (Number(kritik) || 5) ? "bg-amber-50" : undefined}
                  >
                    <td>
                      <input type="checkbox" checked={r.selected} onChange={() => toggleRow(r.key)} />
                    </td>
                    <td>{r.supplier_name || "—"}</td>
                    <td>{r.category || "—"}</td>
                    <td className="font-medium">
                      {r.product_name}
                      {r.variant_name ? ` / ${r.variant_name}` : ""}
                    </td>
                    <td>{r.size || "—"}</td>
                    <td>{r.color || "—"}</td>
                    <td>{r.print_type || "—"}</td>
                    <td className="text-right tabular-nums font-semibold text-red-700">{r.stock_qty}</td>
                    <td className="text-right">
                      <input
                        type="number"
                        min={1}
                        className="bk-input w-20 text-right"
                        value={r.talep}
                        onChange={(e) => {
                          const n = Math.max(1, Number(e.target.value) || 1);
                          setTalepRows((rows) =>
                            rows.map((x) => (x.key === r.key ? { ...x, talep: n, selected: true } : x)),
                          );
                        }}
                      />
                    </td>
                    <td className="text-right tabular-nums">{formatMoney(Number(r.purchase_price || 0))}</td>
                  </tr>
                ))}
                {talepRows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center text-baykus-muted py-8">
                      Kritik seviye altında ürün yok
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={confirmOnSave} onChange={(e) => setConfirmOnSave(e.target.checked)} />
            Dönüştürürken onayla (stok + tedarikçi borcu)
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading || !selectedTalep.length}
              onClick={() => void convertTalep()}
              className="rounded-lg text-white px-5 py-2 text-sm font-medium disabled:opacity-60"
              style={{ background: "#be123c" }}
            >
              {loading ? "Oluşturuluyor…" : "Satın Almaya Dönüştür"}
            </button>
            <Link href="/purchases" className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
              İptal
            </Link>
          </div>
        </div>
      )}

      {tab === "manuel" && (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Satırlar</h2>
              <button
                type="button"
                className="text-sm text-baykus-700 hover:underline"
                onClick={() =>
                  setLines((rows) => [
                    ...rows,
                    { description: "", quantity: "1", unit_cost: "0", product_id: "", variant_id: "" },
                  ])
                }
              >
                + Satır ekle
              </button>
            </div>
            {lines.map((line, idx) => {
              const variants = productDetails[Number(line.product_id)]?.variants || [];
              return (
                <div key={idx} className="rounded-lg border border-slate-100 p-3 space-y-2">
                  <div className="grid sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Ürün (opsiyonel)</label>
                      <select
                        className={input}
                        value={line.product_id}
                        onChange={(e) => {
                          void onProductChange(idx, e.target.value);
                        }}
                      >
                        <option value="">— Manuel açıklama —</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} — {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Varyant</label>
                      <select
                        className={input}
                        value={line.variant_id}
                        disabled={!variants.length}
                        onChange={(e) => onVariantChange(idx, e.target.value)}
                      >
                        <option value="">{variants.length ? "Seçin" : "—"}</option>
                        {variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name} (stok: {v.stock_qty})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-4 gap-2">
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-slate-500 mb-1">Açıklama *</label>
                      <input
                        required
                        className={input}
                        value={line.description}
                        onChange={(e) => setLine(idx, { description: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Miktar</label>
                      <input
                        required
                        type="number"
                        step="0.01"
                        min="0.01"
                        className={input}
                        value={line.quantity}
                        onChange={(e) => setLine(idx, { quantity: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Birim maliyet</label>
                      <input
                        required
                        type="number"
                        step="0.01"
                        min="0"
                        className={input}
                        value={line.unit_cost}
                        onChange={(e) => setLine(idx, { unit_cost: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Satır: {formatMoney(Number(line.quantity || 0) * Number(line.unit_cost || 0))}</span>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        className="text-red-600 hover:underline"
                        onClick={() => setLines((rows) => rows.filter((_, i) => i !== idx))}
                      >
                        Sil
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="flex flex-wrap items-end justify-between gap-4 pt-2 border-t border-slate-100">
              <div className="w-40">
                <label className="block text-xs text-slate-500 mb-1">KDV / vergi</label>
                <input
                  type="number"
                  step="0.01"
                  className={input}
                  value={taxAmount}
                  onChange={(e) => setTaxAmount(e.target.value)}
                />
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">Ara toplam {formatMoney(subtotal)}</div>
                <div className="text-lg font-bold tabular-nums">{formatMoney(total)}</div>
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={confirmOnSave}
              onChange={(e) => setConfirmOnSave(e.target.checked)}
            />
            Kaydet ve onayla (stok + tedarikçi borcu)
          </label>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-baykus-600 text-white px-5 py-2 text-sm font-medium disabled:opacity-60"
            >
              {loading ? "Kaydediliyor…" : confirmOnSave ? "Kaydet ve Onayla" : "Taslak Kaydet"}
            </button>
            <Link href="/purchases" className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
              İptal
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}

export default function NewPurchasePage() {
  return (
    <Suspense fallback={<div className="text-slate-500">Yükleniyor…</div>}>
      <NewPurchaseForm />
    </Suspense>
  );
}
