"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Product,
  ProductDetail,
  ProductVariant,
  PurchaseDetail,
  Supplier,
  apiFetch,
  formatMoney,
} from "@/lib/api";
import { localToday } from "@/lib/dates";
import LiveSearchSelect, { useProductSearch, useSupplierSearch } from "@/components/LiveSearchSelect";
import SplitPaymentRows, { SplitPaymentRow, rowsSum, rowsToPayload } from "@/components/SplitPaymentRows";

type Line = {
  key: string;
  product_id: number | null;
  variant_id: number | null;
  urun: string;
  secenek: string;
  variants: ProductVariant[];
  depo: string;
  miktar: string;
  birim: string;
  kdv: string;
  indirim: string;
  not: string;
};

function num(s: string | number | null | undefined): number {
  const n = Number(String(s ?? "").replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function lineTotal(l: Line): number {
  return Math.max(0, num(l.miktar) * num(l.birim) - num(l.indirim) + num(l.kdv));
}

function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function newKey() {
  return Math.random().toString(36).slice(2, 10);
}

function variantLabel(v: ProductVariant): string {
  return [v.size, v.color, v.print_type, v.name].filter(Boolean).join(" / ") || v.name || `#${v.id}`;
}

type Props = {
  presetSupplier?: string;
  editId?: string | null;
};

/** Perakende Satış Gir düzeninde alış belgesi (yeni / düzenle) */
export default function PurchaseEntryForm({ presetSupplier = "", editId = null }: Props) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const supplierSearch = useSupplierSearch(suppliers, setSuppliers);
  const productSearch = useProductSearch(products, setProducts, { inStockOnly: false });
  const [supplierId, setSupplierId] = useState(presetSupplier);
  const [tarih, setTarih] = useState(() => localToday());
  const [saat, setSaat] = useState(nowTime());
  const [stokaGirdi, setStokaGirdi] = useState(true);
  const [aciklama, setAciklama] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [payRows, setPayRows] = useState<SplitPaymentRow[]>([]);
  const [existing, setExisting] = useState<PurchaseDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch<Supplier[]>("/api/suppliers?active=true&limit=1000"),
      apiFetch<Product[]>("/api/products?active_only=true&in_stock_only=false&limit=1000"),
    ])
      .then(([s, p]) => {
        setSuppliers(s);
        setProducts(p.filter((x) => x.product_type !== "hizmet"));
        if (!presetSupplier && !editId && s.length) setSupplierId((cur) => cur || String(s[0]!.id));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Yükleme hatası"));
  }, [presetSupplier, editId]);

  useEffect(() => {
    if (!editId) return;
    apiFetch<PurchaseDetail>(`/api/purchases/${editId}`)
      .then((p) => {
        setExisting(p);
        setSupplierId(String(p.supplier_id));
        setTarih(String(p.purchase_date).slice(0, 10));
        const notes = p.notes || "";
        const m = notes.match(/Saat (\d{2}:\d{2})/);
        if (m) setSaat(m[1]!);
        setAciklama(notes.replace(/\s*·?\s*Saat \d{2}:\d{2}/, "").trim());
        setStokaGirdi(p.status === "confirmed");
        const tax = Number(p.tax_amount || 0);
        setLines(
          p.lines.map((l, i) => ({
            key: newKey(),
            product_id: l.product_id ?? null,
            variant_id: l.variant_id ?? null,
            urun: l.product_name || l.description,
            secenek: l.variant_name || "",
            variants: [],
            depo: "Ana Depo",
            miktar: String(l.quantity),
            birim: String(l.unit_cost),
            kdv: i === 0 && tax ? String(tax) : "0",
            indirim: "0",
            not: l.line_note || "",
          })),
        );
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Alış yüklenemedi"));
  }, [editId]);

  const toplam = useMemo(() => lines.reduce((s, l) => s + lineTotal(l), 0), [lines]);
  const odenen = useMemo(() => rowsSum(payRows), [payRows]);
  const kalan = Math.max(0, toplam - odenen);
  const isConfirmed = existing?.status === "confirmed";

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function addProduct(id: string) {
    if (!id) return;
    const listRow = products.find((p) => String(p.id) === id);
    let detail: ProductDetail | null = null;
    try {
      detail = await apiFetch<ProductDetail>(`/api/products/${id}`);
    } catch {
      detail = null;
    }
    const name = listRow?.name || detail?.name || "Ürün";
    const variants = detail?.variants || [];
    const v = variants.length === 1 ? variants[0]! : null;
    const cost = listRow?.purchase_price ?? listRow?.cost ?? detail?.purchase_price ?? detail?.cost ?? 0;
    const key = newKey();
    setLines((prev) => [
      ...prev,
      {
        key,
        product_id: Number(id),
        variant_id: v ? v.id : null,
        urun: name,
        secenek: v ? variantLabel(v) : "",
        variants,
        depo: detail?.warehouse || listRow?.warehouse || "Ana Depo",
        miktar: "1",
        birim: String(cost || ""),
        kdv: "0",
        not: "",
        indirim: "0",
      },
    ]);
    setSelectedKey(key);
  }

  async function ensureVariants(l: Line) {
    if (!l.product_id || l.variants.length) return;
    try {
      const d = await apiFetch<ProductDetail>(`/api/products/${l.product_id}`);
      updateLine(l.key, { variants: d.variants || [] });
    } catch {
      /* ignore */
    }
  }

  function removeSelected() {
    if (!selectedKey) return;
    setLines((prev) => prev.filter((l) => l.key !== selectedKey));
    setSelectedKey(null);
  }

  async function save() {
    setError("");
    if (!supplierId) return setError("Tedarikçi seçin.");
    if (!lines.length) return setError("Alışa en az bir ürün ekleyin.");
    for (const l of lines) {
      if (!(num(l.miktar) > 0)) return setError(`${l.urun}: miktar sıfırdan büyük olmalı.`);
      if (l.variants.length > 1 && !l.variant_id) return setError(`${l.urun}: seçenek (varyant) seçin.`);
    }
    if (odenen > toplam + 0.01) return setError("Ödenen tutar alış toplamından büyük olamaz.");
    const payments = rowsToPayload(payRows);
    const payloadLines = lines.map((l) => {
      const qty = num(l.miktar);
      const net = Math.max(0, qty * num(l.birim) - num(l.indirim));
      return {
        description: [l.urun, l.secenek].filter(Boolean).join(" — ").slice(0, 255),
        quantity: qty,
        unit_cost: Math.round((net / qty) * 10000) / 10000,
        product_id: l.product_id,
        variant_id: l.variant_id,
        line_note: l.not.trim() || null,
      };
    });
    const tax = lines.reduce((s, l) => s + num(l.kdv), 0);
    const notes = [aciklama.trim(), `Saat ${saat}`].filter(Boolean).join(" · ");
    setBusy(true);
    try {
      let purchase: PurchaseDetail;
      if (existing) {
        const body: Record<string, unknown> = {
          purchase_date: tarih,
          notes,
          tax_amount: tax,
          lines: payloadLines,
        };
        if (existing.status === "draft") body.supplier_id = Number(supplierId);
        purchase = await apiFetch<PurchaseDetail>(`/api/purchases/${existing.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        if (existing.status === "draft" && stokaGirdi) {
          await apiFetch(`/api/purchases/${existing.id}/confirm`, { method: "POST" });
        }
      } else {
        purchase = await apiFetch<PurchaseDetail>("/api/purchases", {
          method: "POST",
          body: JSON.stringify({
            supplier_id: Number(supplierId),
            purchase_date: tarih,
            notes,
            tax_amount: tax,
            confirm: stokaGirdi,
            lines: payloadLines,
          }),
        });
      }
      if (payments.length && odenen > 0) {
        try {
          await apiFetch(`/api/suppliers/${purchase.supplier_id}/movements`, {
            method: "POST",
            body: JSON.stringify({
              movement_type: "payment",
              amount: Math.round(rowsSum(payRows) * 100) / 100,
              movement_date: tarih,
              purchase_id: purchase.id,
              note: `Alış ödemesi — ${purchase.purchase_number}`,
              post_to_finance: true,
              payments,
            }),
          });
        } catch (e) {
          setError(
            `Alış kaydedildi (${purchase.purchase_number}) ancak ödeme işlenemedi: ${
              e instanceof Error ? e.message : "hata"
            }. Ödemeyi tedarikçi kartından girin.`,
          );
          return;
        }
      }
      router.push(`/purchases/${purchase.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kayıt hatası");
    } finally {
      setBusy(false);
    }
  }

  const numCls = "bk-input py-0.5 tabular-nums text-right";

  return (
    <div className="space-y-2">
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      <div className="bk-entry-grid">
        {/* SOL — ALIŞ */}
        <fieldset className="rounded border border-baykus-line bg-white px-3 py-2.5 space-y-2.5 min-w-0">
          <legend className="px-1 text-xs font-bold tracking-wide">{existing ? `ALIŞ · ${existing.purchase_number}` : "ALIŞ"}</legend>

          <div className="flex flex-wrap items-center gap-2 pb-1">
            <button
              type="button"
              data-baykus-save
              disabled={busy}
              onClick={() => void save()}
              className="bk-btn bk-btn-desktop-red text-sm font-bold px-4 py-2"
            >
              {busy ? "Kaydediliyor…" : existing ? "✓ Alışı Güncelle" : "+ Alış Kaydet"}
            </button>
            <Link
              href={existing ? `/purchases/${existing.id}` : "/purchases"}
              className="bk-btn bk-btn-desktop-orange text-sm font-bold px-4 py-2"
            >
              − Geri Dön
            </Link>
          </div>

          <div className="bk-entry-row">
            <label className="text-xs font-medium">Tedarikçi *</label>
            {existing && existing.status !== "draft" ? (
              <div className="text-sm font-semibold truncate">{existing.supplier_name}</div>
            ) : (
              <LiveSearchSelect
                required
                value={supplierId}
                onChange={(id) => setSupplierId(id)}
                options={supplierSearch.options}
                fetchMatches={supplierSearch.fetchMatches}
                placeholder="Tedarikçi ara…"
              />
            )}
          </div>

          <div className="bk-entry-row">
            <label className="text-xs font-medium">Tarih</label>
            <div className="bk-date-time">
              <input type="date" className="bk-input" value={tarih} onChange={(e) => setTarih(e.target.value)} />
              <input type="time" className="bk-input" value={saat} onChange={(e) => setSaat(e.target.value)} />
            </div>
          </div>

          <div className="bk-entry-row">
            <label className="text-xs font-medium">Toplam Tutar</label>
            <div className="text-base font-bold tabular-nums">{formatMoney(toplam)}</div>
          </div>

          <div>
            <div className="text-xs font-medium mb-1.5">
              Kasa / Banka / Hesap · Ödeme{" "}
              <span className="font-normal text-baykus-muted">(boş bırakırsanız tamamı cari borç)</span>
            </div>
            <SplitPaymentRows expectedTotal={toplam} mode="odeme" autoFill={false} allowPartial onChange={setPayRows} />
          </div>

          <div className="bk-entry-row">
            <label className="text-xs font-medium">Cari Borç</label>
            <div className={`text-sm font-bold tabular-nums ${kalan > 0 ? "text-red-700" : "text-emerald-700"}`}>
              {formatMoney(kalan)}
              <span className="ml-1 text-[10px] font-normal text-baykus-muted">tedarikçi cari borcuna yazılır</span>
            </div>
          </div>

          <label className="inline-flex items-start gap-2 text-xs font-medium">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={stokaGirdi}
              disabled={isConfirmed}
              onChange={(e) => setStokaGirdi(e.target.checked)}
            />
            <span>
              Ürünler stoka girdi
              <span className="block text-[10px] text-baykus-muted font-normal">
                {isConfirmed
                  ? "Onaylı alış — kalem değişikliği stok ve cariye yansır"
                  : "İşaretli değilse taslak olarak kaydedilir (stok ve cari işlenmez)"}
              </span>
            </span>
          </label>

          <div>
            <label className="block text-xs font-medium mb-1">Açıklama</label>
            <textarea
              className="bk-input min-h-[90px]"
              value={aciklama}
              onChange={(e) => setAciklama(e.target.value)}
              placeholder="İrsaliye / fatura no, not…"
            />
          </div>
        </fieldset>

        {/* SAĞ — ÜRÜNLER */}
        <fieldset className="rounded border border-baykus-line bg-white px-3 py-2.5 space-y-2 min-w-0">
          <legend className="px-1 text-xs font-bold tracking-wide">ÜRÜNLER</legend>
          <LiveSearchSelect
            value=""
            clearOnSelect
            options={productSearch.options}
            fetchMatches={productSearch.fetchMatches}
            placeholder="Ürün ara… isim, SKU veya barkod (stoksuz ürünler dahil)"
            emptyText="Ürün bulunamadı"
            onChange={(id) => void addProduct(id)}
          />

          <div className="bk-table-wrap bk-entry-table-wrap">
            <table className="bk-table bk-entry-table">
              <thead>
                <tr>
                  <th>Ürün</th>
                  <th>Seçenek</th>
                  <th>Depo</th>
                  <th className="text-right">Miktar</th>
                  <th className="text-right">Alış Fiyatı</th>
                  <th className="text-right">KDV</th>
                  <th className="text-right">İndirim</th>
                  <th>Açıklama</th>
                  <th className="text-right">Toplam</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr
                    key={l.key}
                    onClick={() => setSelectedKey(l.key)}
                    className={selectedKey === l.key ? "bg-sky-50" : ""}
                  >
                    <td className="font-medium min-w-[9rem]">{l.urun}</td>
                    <td className="min-w-[7rem]">
                      {l.product_id && (l.variants.length > 0 || l.variant_id) ? (
                        <select
                          className="bk-input py-0.5"
                          value={l.variant_id ?? ""}
                          onFocus={() => void ensureVariants(l)}
                          onChange={(e) => {
                            const v = l.variants.find((x) => String(x.id) === e.target.value);
                            updateLine(l.key, {
                              variant_id: v ? v.id : null,
                              secenek: v ? variantLabel(v) : "",
                            });
                          }}
                        >
                          <option value="">Seçin</option>
                          {!l.variants.length && l.variant_id && (
                            <option value={l.variant_id}>{l.secenek || `#${l.variant_id}`}</option>
                          )}
                          {l.variants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {variantLabel(v)} (stok: {v.stock_qty ?? 0})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="bk-input py-0.5"
                          value={l.secenek}
                          onChange={(e) => updateLine(l.key, { secenek: e.target.value })}
                        />
                      )}
                    </td>
                    <td>
                      <input
                        className="bk-input py-0.5 w-20"
                        value={l.depo}
                        onChange={(e) => updateLine(l.key, { depo: e.target.value })}
                      />
                    </td>
                    <td>
                      <input inputMode="decimal" className={`${numCls} w-16`} value={l.miktar} onChange={(e) => updateLine(l.key, { miktar: e.target.value })} />
                    </td>
                    <td>
                      <input inputMode="decimal" className={`${numCls} w-20`} value={l.birim} placeholder="0,00" onChange={(e) => updateLine(l.key, { birim: e.target.value })} />
                    </td>
                    <td>
                      <input inputMode="decimal" className={`${numCls} w-16`} value={l.kdv} onChange={(e) => updateLine(l.key, { kdv: e.target.value })} />
                    </td>
                    <td>
                      <input inputMode="decimal" className={`${numCls} w-16`} value={l.indirim} onChange={(e) => updateLine(l.key, { indirim: e.target.value })} />
                    </td>
                    <td className="min-w-[10rem]">
                      <input
                        className="bk-input py-0.5 w-full"
                        value={l.not}
                        placeholder="Örn. 45x60 ön baskı"
                        maxLength={2000}
                        onChange={(e) => updateLine(l.key, { not: e.target.value })}
                      />
                    </td>
                    <td className="tabular-nums font-medium whitespace-nowrap text-right">{formatMoney(lineTotal(l))}</td>
                  </tr>
                ))}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center text-baykus-muted py-8">
                      Alışa ürün eklemek için yukarıdan arayın
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-baykus-muted">
              {lines.length} kalem · KDV {formatMoney(lines.reduce((s, l) => s + num(l.kdv), 0))}
            </span>
            <button type="button" onClick={removeSelected} disabled={!selectedKey} className="bk-btn bk-btn-desktop-red text-xs font-bold disabled:opacity-50">
              Seçili Satırı Sil
            </button>
          </div>
        </fieldset>
      </div>
    </div>
  );
}
