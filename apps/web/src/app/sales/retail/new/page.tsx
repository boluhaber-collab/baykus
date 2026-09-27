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
import StatusFooter from "@/components/StatusFooter";
import SplitPaymentRows, {
  SplitPaymentRow,
  rowsSum,
  rowsToPayload,
} from "@/components/SplitPaymentRows";

type CartLine = {
  key: string;
  product_id: number;
  variant_id?: number | null;
  urun: string;
  secenek: string;
  depo: string;
  miktar: number;
  birim_fiyat: number;
  kdv: number;
  indirim: number;
  toplam: number;
};

function todayDateInput(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
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
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [variantPick, setVariantPick] = useState<{
    product: Product;
    detail: ProductDetail;
    variants: ProductVariant[];
  } | null>(null);

  const loadMeta = useCallback(async () => {
    try {
      const prods = await apiFetch<Product[]>("/api/products?limit=500&active_only=true");
      setProducts(prods);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const filteredProducts = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("tr");
    return products
      .filter((p) => {
        if (p.product_type === "hizmet") return true;
        return (p.stock_qty ?? p.total_stock ?? 0) >= 0;
      })
      .filter((p) => {
        if (!needle) return true;
        const hay = `${p.name} ${p.sku} ${p.category || ""}`.toLocaleLowerCase("tr");
        return hay.includes(needle);
      })
      .slice(0, 80);
  }, [products, search]);

  const toplam = useMemo(
    () => cart.reduce((s, l) => s + Number(l.toplam || 0), 0),
    [cart],
  );

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
      miktar: 1,
      birim_fiyat: opts.price,
      kdv: 0,
      indirim: 0,
      toplam: opts.price,
    };
    setCart((prev) => [...prev, line]);
    setSelectedKey(key);
    setSearch("");
    setVariantPick(null);
  }

  async function addProduct(p: Product) {
    let price = Number(p.base_price || 0);
    let depo = p.warehouse || "Ana Depo";
    try {
      const detail = await apiFetch<ProductDetail>(`/api/products/${p.id}`);
      depo = detail.warehouse || depo;
      const variants = detail.variants || [];
      if (variants.length > 1) {
        setVariantPick({ product: p, detail, variants });
        return;
      }
      if (variants.length === 1) {
        const v = variants[0]!;
        pushCartLine(p, {
          variantId: v.id,
          secenek: [v.color, v.size].filter(Boolean).join(" / "),
          price: Number(v.price || price),
          depo,
        });
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
    setCart((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        const gross = next.miktar * next.birim_fiyat;
        next.toplam = Math.max(0, gross - Number(next.indirim || 0) + Number(next.kdv || 0));
        return next;
      }),
    );
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
      const status = delivered ? "Teslim Edildi" : "Sipariş Alındı";
      const noteParts = [
        aciklama.trim(),
        `Tarih ${tarih} ${saat}`,
        payments.length > 1 ? `Çoklu tahsilat (${payments.length} satır)` : "Tahsilat",
      ].filter(Boolean);
      const created = await apiFetch<{ id: number; order_number: string }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          customer_id: null,
          status,
          notes: noteParts.join(" · ") || null,
          channel: "perakende",
          design_status: "Bekliyor",
          due_date: delivered ? tarih : null,
          delivery_date: delivered ? tarih : null,
          deposit_amount: 0,
          discount_amount: 0,
          lines: cart.map((l) => ({
            product_id: l.product_id,
            variant_id: l.variant_id || null,
            description: l.urun,
            quantity: l.miktar,
            size: null,
            color: l.secenek || null,
            print_type: null,
            unit_price: l.birim_fiyat,
            discount_rate: 0,
            discount_amount: l.indirim || 0,
          })),
        }),
      });

      if (payments.length > 0 && tahsilatNum > 0) {
        await apiFetch(`/api/orders/${created.id}/payments`, {
          method: "POST",
          body: JSON.stringify({
            amount: tahsilatNum,
            method: payments.length > 1 ? "çoklu" : payments[0]!.method || "nakit",
            notes: aciklama || `Perakende direkt satış tahsilatı ${created.order_number}`,
            post_to_cari: false,
            post_to_finance: true,
            payments,
          }),
        });
      }

      router.push("/sales");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kayıt hatası");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 pb-2">
      <div>
        <h2 className="text-lg font-bold text-baykus-text leading-tight">Perakende Satış Gir</h2>
        <p className="text-[11px] text-baykus-muted mt-0.5">Satışlar &gt; Direkt Satışlar &gt; Perakende Satış</p>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="grid gap-2 lg:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)]">
        {/* SOL — PERAKENDE LabelFrame */}
        <fieldset className="rounded border border-baykus-line bg-white px-3 py-2.5 space-y-2.5">
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

          <div className="grid grid-cols-[7.5rem_1fr] items-center gap-2">
            <label className="text-xs font-medium">Tarih</label>
            <div className="flex gap-2">
              <input
                type="date"
                className="bk-input"
                value={tarih}
                onChange={(e) => setTarih(e.target.value)}
              />
              <input
                type="time"
                className="bk-input w-28"
                value={saat}
                onChange={(e) => setSaat(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-[7.5rem_1fr] items-center gap-2">
            <label className="text-xs font-medium">Toplam Tutar</label>
            <div className="text-base font-bold tabular-nums">{formatMoney(toplam)}</div>
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
        <fieldset className="rounded border border-baykus-line bg-white px-3 py-2.5 space-y-2">
          <legend className="px-1 text-xs font-bold tracking-wide">ÜRÜN / HİZMETLER</legend>

          <input
            className="bk-input"
            placeholder="Ürün isminden arayın veya barkod okutun"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const first = filteredProducts[0];
                if (first) void addProduct(first);
              }
            }}
          />

          <div className="max-h-44 overflow-auto rounded border border-baykus-line bg-slate-50">
            {filteredProducts.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => void addProduct(p)}
                className="block w-full text-left px-3 py-1.5 text-xs border-b border-baykus-line/60 hover:bg-sky-50"
              >
                <span className="font-semibold">{p.name}</span>
                <span className="text-baykus-muted">
                  {" "}
                  · {(p.stock_qty ?? p.total_stock ?? 0)} ad
                  {p.category ? ` · ${p.category}` : ""}
                </span>
              </button>
            ))}
            {filteredProducts.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-baykus-muted">Ürün bulunamadı</div>
            )}
          </div>

          <div className="bk-table-wrap">
            <table className="bk-table">
              <thead>
                <tr>
                  <th>Ürün</th>
                  <th>Seçenek</th>
                  <th>Depo</th>
                  <th>Miktar</th>
                  <th>Birim Fiyat</th>
                  <th>KDV</th>
                  <th>İndirim</th>
                  <th>Toplam</th>
                </tr>
              </thead>
              <tbody>
                {cart.map((l) => (
                  <tr
                    key={l.key}
                    onClick={() => setSelectedKey(l.key)}
                    className={selectedKey === l.key ? "bg-sky-50" : ""}
                  >
                    <td className="font-medium">{l.urun}</td>
                    <td>
                      <input
                        className="bk-input py-0.5"
                        value={l.secenek}
                        onChange={(e) => updateLine(l.key, { secenek: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="bk-input py-0.5 w-24"
                        value={l.depo}
                        onChange={(e) => updateLine(l.key, { depo: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        className="bk-input py-0.5 w-16 tabular-nums"
                        value={l.miktar}
                        onChange={(e) =>
                          updateLine(l.key, { miktar: Math.max(1, Number(e.target.value) || 1) })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="bk-input py-0.5 w-24 tabular-nums"
                        value={l.birim_fiyat}
                        onChange={(e) =>
                          updateLine(l.key, { birim_fiyat: Number(e.target.value) || 0 })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="bk-input py-0.5 w-20 tabular-nums"
                        value={l.kdv}
                        onChange={(e) => updateLine(l.key, { kdv: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="bk-input py-0.5 w-20 tabular-nums"
                        value={l.indirim}
                        onChange={(e) =>
                          updateLine(l.key, { indirim: Number(e.target.value) || 0 })
                        }
                      />
                    </td>
                    <td className="tabular-nums font-medium whitespace-nowrap">
                      {formatMoney(l.toplam)}
                    </td>
                  </tr>
                ))}
                {cart.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center text-baykus-muted py-8">
                      Sepete ürün eklemek için listeden seçin
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={removeSelected}
              className="bk-btn bk-btn-desktop-red text-xs font-bold"
            >
              Seçili Satırı Sil
            </button>
          </div>
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
            <div className="max-h-72 overflow-auto p-2 space-y-1">
              {variantPick.variants.map((v) => (
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
                    <span>Stok: {v.stock_qty ?? 0}</span>
                    <span className="font-semibold text-baykus-text">{formatMoney(Number(v.price || 0))}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <StatusFooter />
    </div>
  );
}
