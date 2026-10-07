"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  PURCHASE_STATUS_LABELS,
  Product,
  ProductDetail,
  PurchaseDetail,
  apiFetch,
  formatMoney,
} from "@/lib/api";
import { isBhImportNote } from "@/lib/bhNote";
import LiveSearchSelect, { useProductSearch } from "@/components/LiveSearchSelect";
import { formatTrDate, formatTrDateTime } from "@/lib/dates";
import { printPdfFromApi } from "@/lib/printPdf";

type EditLine = {
  key: string;
  description: string;
  quantity: string;
  unit_cost: string;
  product_id: string;
  variant_id: string;
};

function toEditLines(purchase: PurchaseDetail): EditLine[] {
  return (purchase.lines || []).map((l) => ({
    key: String(l.id ?? Math.random().toString(36).slice(2)),
    description: l.description || "",
    quantity: String(l.quantity ?? 1),
    unit_cost: String(l.unit_cost ?? 0),
    product_id: l.product_id != null ? String(l.product_id) : "",
    variant_id: l.variant_id != null ? String(l.variant_id) : "",
  }));
}

function emptyLine(): EditLine {
  return {
    key: Math.random().toString(36).slice(2),
    description: "",
    quantity: "1",
    unit_cost: "0",
    product_id: "",
    variant_id: "",
  };
}

export default function PurchaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [purchase, setPurchase] = useState<PurchaseDetail | null>(null);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const [purchaseDate, setPurchaseDate] = useState("");
  const [notes, setNotes] = useState("");
  const [taxAmount, setTaxAmount] = useState("0");
  const [lines, setLines] = useState<EditLine[]>([emptyLine()]);
  const [products, setProducts] = useState<Product[]>([]);
  const productSearch = useProductSearch(products, setProducts, { inStockOnly: false });
  const [productDetails, setProductDetails] = useState<Record<number, ProductDetail>>({});

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await apiFetch<PurchaseDetail>(`/api/purchases/${id}`);
      setPurchase(data);
      setPurchaseDate(data.purchase_date ? String(data.purchase_date).slice(0, 10) : "");
      setNotes(data.notes || "");
      setTaxAmount(String(data.tax_amount ?? 0));
      setLines(toEditLines(data).length ? toEditLines(data) : [emptyLine()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [id]);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    load();
  }, [id, load]);

  useEffect(() => {
    if (typeof window === "undefined" || !purchase) return;
    if (new URLSearchParams(window.location.search).get("print") === "1") {
      void (async () => {
        try {
          await printPdfFromApi(`/api/purchases/${id}/pdf`);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Yazdırma hatası");
        }
      })();
    }
  }, [purchase, id]);

  useEffect(() => {
    if (!editing) return;
    apiFetch<Product[]>("/api/products?active_only=true&in_stock_only=false&limit=1000")
      .then((p) => setProducts(p.filter((x) => x.product_type !== "hizmet")))
      .catch((e) => setError(e instanceof Error ? e.message : "Ürün listesi yüklenemedi"));
  }, [editing]);

  const isBh = isBhImportNote(purchase?.notes);
  const canEdit =
    !!purchase &&
    !isBh &&
    (purchase.status === "draft" || purchase.status === "confirmed");
  const canCancel =
    !!purchase &&
    !isBh &&
    (purchase.status === "draft" || purchase.status === "confirmed");

  const editSubtotal = useMemo(
    () => lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unit_cost || 0), 0),
    [lines],
  );
  const editTotal = editSubtotal + Number(taxAmount || 0);

  function setLine(idx: number, patch: Partial<EditLine>) {
    setLines((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function startEdit() {
    if (!purchase || !canEdit) return;
    if (isBh) {
      setError("BizimHesap aktarım kayıtları düzenlenemez");
      return;
    }
    setPurchaseDate(purchase.purchase_date ? String(purchase.purchase_date).slice(0, 10) : "");
    setNotes(purchase.notes || "");
    setTaxAmount(String(purchase.tax_amount ?? 0));
    setLines(toEditLines(purchase).length ? toEditLines(purchase) : [emptyLine()]);
    setEditing(true);
    setError("");
    setOkMsg("");
  }

  function cancelEdit() {
    setEditing(false);
    setError("");
    if (purchase) {
      setLines(toEditLines(purchase).length ? toEditLines(purchase) : [emptyLine()]);
    }
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
    const sorted = [...(detail?.variants || [])].sort(
      (a, b) => Number(b.stock_qty || 0) - Number(a.stock_qty || 0),
    );
    setLine(idx, {
      product_id: productId,
      variant_id: sorted.length === 1 ? String(sorted[0]!.id) : "",
      description:
        (product?.name || detail?.name)
          ? sorted.length === 1
            ? `${product?.name || detail?.name} — ${sorted[0]!.name}`
            : (product?.name || detail?.name || "")
          : lines[idx]!.description,
      unit_cost: String(
        product?.purchase_price ?? product?.cost ?? detail?.purchase_price ?? detail?.cost ?? lines[idx]!.unit_cost,
      ),
    });
  }

  function onVariantChange(idx: number, variantId: string) {
    const product = products.find((p) => String(p.id) === lines[idx]!.product_id);
    const detail = productDetails[Number(lines[idx]!.product_id)];
    const variant = detail?.variants?.find((v) => String(v.id) === variantId);
    setLine(idx, {
      variant_id: variantId,
      description:
        product && variant ? `${product.name} — ${variant.name}` : lines[idx]!.description,
    });
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const payloadLines = lines
      .filter((l) => l.description.trim())
      .map((l) => ({
        product_id: l.product_id ? Number(l.product_id) : null,
        variant_id: l.variant_id ? Number(l.variant_id) : null,
        description: l.description.trim(),
        quantity: Math.max(0.01, Number(l.quantity) || 0),
        unit_cost: Math.max(0, Number(l.unit_cost) || 0),
      }));
    if (!payloadLines.length) {
      setError("En az bir satır gerekli");
      return;
    }
    if (purchase?.status === "confirmed") {
      if (
        !window.confirm(
          "Onaylı alış güncellenecek: stok farkı uygulanır, tedarikçi cari borç tutarı yenilenir.\nDevam?",
        )
      ) {
        return;
      }
    }
    setBusy(true);
    try {
      const updated = await apiFetch<PurchaseDetail>(`/api/purchases/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          purchase_date: purchaseDate || null,
          notes: notes.trim() || null,
          tax_amount: Number(taxAmount) || 0,
          lines: payloadLines,
        }),
      });
      setPurchase(updated);
      setEditing(false);
      setOkMsg("Alış güncellendi");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    } finally {
      setBusy(false);
    }
  }

  async function confirmPurchase() {
    if (!window.confirm("Satın almayı onaylamak stok ve tedarikçi borcunu günceller. Devam?")) return;
    setBusy(true);
    setError("");
    setOkMsg("");
    try {
      await apiFetch(`/api/purchases/${id}/confirm`, { method: "POST" });
      await load();
      setOkMsg("Alış onaylandı · stok↑ + tedarikçi borç");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Onay hatası");
    } finally {
      setBusy(false);
    }
  }

  async function cancelPurchase() {
    if (!purchase) return;
    if (isBh) {
      setError("BizimHesap aktarım kayıtları iptal edilemez");
      return;
    }
    const msg =
      purchase.status === "confirmed"
        ? "Seçili alış iptal edilecek: stok tersine çevrilecek, tedarikçi cari + bağlı kasa/banka hareketleri kaldırılacak.\nDevam edilsin mi?"
        : "Taslağı iptal etmek istiyor musunuz?";
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError("");
    setOkMsg("");
    try {
      await apiFetch(`/api/purchases/${id}/cancel`, { method: "POST" });
      setEditing(false);
      await load();
      setOkMsg("Alış iptal edildi");
    } catch (e) {
      setError(e instanceof Error ? e.message : "İptal hatası");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!window.confirm("Satın almayı silmek istiyor musunuz?")) return;
    try {
      await apiFetch(`/api/purchases/${id}`, { method: "DELETE" });
      router.push("/purchases");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Silme hatası");
    }
  }

  if (!purchase && !error) return <div className="text-slate-500">Yükleniyor…</div>;
  if (!purchase) {
    return (
      <div>
        <p className="text-red-600 mb-4">{error}</p>
        <Link href="/purchases" className="text-baykus-600 hover:underline">
          ← Listeye dön
        </Link>
      </div>
    );
  }

  const statusLabel = PURCHASE_STATUS_LABELS[purchase.status] || purchase.status;
  const lineQty = purchase.lines.reduce((s, l) => s + Number(l.quantity || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs text-baykus-muted mb-1">
            <Link href="/purchases" className="text-baykus-primary hover:underline">
              Alış Hareketleri
            </Link>
            <span className="mx-1">›</span>
            <span className="font-medium">{purchase.purchase_number}</span>
            <span className="mx-1">›</span>
            <span>Detay</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">{purchase.purchase_number}</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            <Link
              href={`/suppliers/${purchase.supplier_id}`}
              className="text-baykus-primary hover:underline"
            >
              {purchase.supplier_name}
            </Link>
            {" · "}
            {formatTrDate(purchase.purchase_date)}
            {" · "}
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                purchase.status === "confirmed"
                  ? "bg-emerald-100 text-emerald-800"
                  : purchase.status === "cancelled"
                    ? "bg-red-100 text-red-800"
                    : "bg-amber-100 text-amber-900"
              }`}
            >
              {statusLabel}
            </span>
            {isBh && (
              <span className="ml-2 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                BizimHesap aktarım
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {purchase.status === "draft" && !editing && (
            <>
              <button
                disabled={busy}
                onClick={confirmPurchase}
                className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                Onayla (stok↑ + borç)
              </button>
              <button
                onClick={onDelete}
                className="rounded-lg border border-red-200 text-red-700 px-4 py-2 text-sm"
              >
                Sil
              </button>
            </>
          )}
          {purchase.status === "confirmed" && !editing && (
            <>
              <Link
                href={`/suppliers/${purchase.supplier_id}#supplier-pay-form`}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                style={{ background: "#198754" }}
              >
                Ödeme Yap
              </Link>
              <Link
                href={`/suppliers/payables?fis=1&supplier_id=${purchase.supplier_id}`}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                style={{ background: "#7c3aed" }}
              >
                Borç Fişi
              </Link>
            </>
          )}
          {canEdit && !editing && (
            <button
              type="button"
              disabled={busy}
              onClick={startEdit}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
            >
              Düzenle
            </button>
          )}
          {editing && (
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
            >
              Düzenlemeyi İptal
            </button>
          )}
          {canCancel && !editing && (
            <button
              type="button"
              disabled={busy}
              onClick={cancelPurchase}
              className="rounded-lg border border-red-200 text-red-700 px-4 py-2 text-sm disabled:opacity-60"
            >
              İptal Et
            </button>
          )}
          {isBh && (
            <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 self-center">
              BH aktarım — düzenleme/iptal kapalı
            </span>
          )}
          <Link
            href={`/suppliers/${purchase.supplier_id}`}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
          >
            Tedarikçi Kartı
          </Link>
          <Link
            href={`/suppliers/${purchase.supplier_id}#supplier-ekstre`}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
          >
            Hesap Ekstresi
          </Link>
          <button
            type="button"
            onClick={() => {
              void (async () => {
                try {
                  await printPdfFromApi(`/api/purchases/${id}/pdf`);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Yazdırma hatası");
                }
              })();
            }}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
          >
            Yazdır
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}
      {okMsg && (
        <div className="rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm">{okMsg}</div>
      )}

      {editing ? (
        <form onSubmit={saveEdit} className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm grid sm:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-500">Tedarikçi:</span>{" "}
              <span className="font-medium">{purchase.supplier_name}</span>
              {purchase.status === "confirmed" && (
                <span className="ml-2 text-xs text-amber-700">(onaylıda değiştirilemez)</span>
              )}
            </div>
            <label className="text-sm">
              <span className="text-slate-500">Belge tarihi</span>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="text-slate-500">Not</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2 min-h-[64px]"
              />
            </label>
            <label className="text-sm">
              <span className="text-slate-500">KDV / vergi</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={taxAmount}
                onChange={(e) => setTaxAmount(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
            <div className="text-sm flex flex-col justify-end">
              <div className="text-slate-500">Ara toplam / Genel</div>
              <div className="font-semibold tabular-nums">
                {formatMoney(editSubtotal)} · {formatMoney(editTotal)}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 font-semibold text-sm flex items-center justify-between">
              <span>Alış kalemleri (düzenle)</span>
              <button
                type="button"
                className="text-xs rounded-lg border px-2 py-1 hover:bg-slate-50"
                onClick={() => setLines((rows) => [...rows, emptyLine()])}
              >
                + Satır
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Ürün</th>
                    <th className="px-3 py-2">Varyant</th>
                    <th className="px-3 py-2">Açıklama</th>
                    <th className="px-3 py-2 text-right">Miktar</th>
                    <th className="px-3 py-2 text-right">Birim maliyet</th>
                    <th className="px-3 py-2 text-right">Satır</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, idx) => {
                    const detail = productDetails[Number(l.product_id)];
                    const variants = detail?.variants || [];
                    const rowTotal = Number(l.quantity || 0) * Number(l.unit_cost || 0);
                    return (
                      <tr key={l.key} className="border-t border-slate-100 align-top">
                        <td className="px-3 py-2 min-w-[160px]">
                          <LiveSearchSelect
                            value={l.product_id}
                            onChange={(id) => void onProductChange(idx, id)}
                            options={productSearch.options}
                            fetchMatches={productSearch.fetchMatches}
                            placeholder="Ürün ara…"
                            inputClassName="w-full rounded border px-2 py-1.5 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2 min-w-[120px]">
                          <select
                            className="w-full rounded border px-2 py-1.5 text-xs"
                            value={l.variant_id}
                            disabled={!l.product_id || variants.length === 0}
                            onChange={(e) => onVariantChange(idx, e.target.value)}
                          >
                            <option value="">—</option>
                            {variants.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 min-w-[180px]">
                          <input
                            className="w-full rounded border px-2 py-1.5 text-xs"
                            value={l.description}
                            onChange={(e) => setLine(idx, { description: e.target.value })}
                            required
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            className="w-24 rounded border px-2 py-1.5 text-xs text-right"
                            value={l.quantity}
                            onChange={(e) => setLine(idx, { quantity: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="w-28 rounded border px-2 py-1.5 text-xs text-right"
                            value={l.unit_cost}
                            onChange={(e) => setLine(idx, { unit_cost: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {formatMoney(rowTotal)}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            className="text-xs text-red-600 hover:underline"
                            onClick={() =>
                              setLines((rows) =>
                                rows.length <= 1 ? [emptyLine()] : rows.filter((_, i) => i !== idx),
                              )
                            }
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
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {busy ? "Kaydediliyor…" : "Kaydet"}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
            >
              Vazgeç
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl bg-[#2563eb] text-white p-3 shadow-sm">
              <div className="text-[11px] font-semibold opacity-90">Toplam</div>
              <div className="text-lg font-bold tabular-nums">
                {formatMoney(Number(purchase.total_amount))}
              </div>
            </div>
            <div className="rounded-xl border bg-white p-3 shadow-sm">
              <div className="text-[11px] text-slate-500 font-semibold">Ara toplam / KDV</div>
              <div className="text-sm font-semibold mt-1 tabular-nums">
                {formatMoney(Number(purchase.subtotal))} + {formatMoney(Number(purchase.tax_amount))}
              </div>
            </div>
            <div className="rounded-xl border bg-white p-3 shadow-sm">
              <div className="text-[11px] text-slate-500 font-semibold">Kalem / Adet</div>
              <div className="text-lg font-bold mt-1">
                {purchase.lines.length} kalem · {lineQty} adet
              </div>
            </div>
            <div className="rounded-xl border bg-white p-3 shadow-sm">
              <div className="text-[11px] text-slate-500 font-semibold">Onay</div>
              <div className="text-sm font-semibold mt-1">
                {purchase.confirmed_at
                  ? String(purchase.confirmed_at).slice(0, 16).replace("T", " ")
                  : purchase.status === "draft"
                    ? "Henüz onaylanmadı"
                    : statusLabel}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-sm grid sm:grid-cols-2 gap-2">
            <div>
              <span className="text-slate-500">Tedarikçi:</span>{" "}
              <Link
                href={`/suppliers/${purchase.supplier_id}`}
                className="text-baykus-primary hover:underline"
              >
                {purchase.supplier_name}
              </Link>
            </div>
            <div>
              <span className="text-slate-500">Belge tarihi:</span> {formatTrDate(purchase.purchase_date)}
            </div>
            <div>
              <span className="text-slate-500">Oluşturma:</span>{" "}
              {formatTrDateTime(purchase.created_at)}
            </div>
            <div>
              <span className="text-slate-500">Güncelleme:</span>{" "}
              {purchase.updated_at
                ? String(purchase.updated_at).slice(0, 16).replace("T", " ")
                : "—"}
            </div>
            {purchase.notes && (
              <div className="sm:col-span-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-amber-950">
                <span className="text-xs font-semibold text-amber-800">Not: </span>
                {purchase.notes}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 font-semibold text-sm">
              Alış kalemleri
            </div>
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Açıklama</th>
                  <th className="px-4 py-3">Ürün / varyant</th>
                  <th className="px-4 py-3 text-right">Miktar</th>
                  <th className="px-4 py-3 text-right">Birim maliyet</th>
                  <th className="px-4 py-3 text-right">Satır toplam</th>
                </tr>
              </thead>
              <tbody>
                {purchase.lines.map((l, idx) => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 text-slate-400">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium">{l.description}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {l.product_id ? (
                        <Link
                          href={`/products/${l.product_id}`}
                          className="text-baykus-primary hover:underline"
                        >
                          {l.product_name || `Ürün #${l.product_id}`}
                        </Link>
                      ) : (
                        l.product_name || "—"
                      )}
                      {l.variant_name ? ` / ${l.variant_name}` : ""}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{Number(l.quantity)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMoney(Number(l.unit_cost))}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {formatMoney(Number(l.line_total))}
                    </td>
                  </tr>
                ))}
                {purchase.lines.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                      Kalem yok
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                  <td colSpan={3} className="px-4 py-3 text-right text-slate-600">
                    Ara toplam
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{lineQty}</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(Number(purchase.subtotal))}
                  </td>
                </tr>
                <tr className="bg-slate-50">
                  <td colSpan={5} className="px-4 py-2 text-right text-slate-500 text-sm">
                    KDV / vergi
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-sm">
                    {formatMoney(Number(purchase.tax_amount))}
                  </td>
                </tr>
                <tr className="bg-slate-100 font-bold">
                  <td colSpan={5} className="px-4 py-3 text-right">
                    Genel toplam
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-base">
                    {formatMoney(Number(purchase.total_amount))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {purchase.status === "draft" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden">
              Taslak — onaylandığında ürün stokları artar ve tedarikçi cari borcuna işlenir.
            </div>
          )}
          {purchase.status === "confirmed" && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 print:hidden">
              Onaylı alış — <strong>Düzenle</strong> kalem/tutar günceller (stok + cari);{" "}
              <strong>İptal Et</strong> stok ve tedarikçi cari + kasa/banka hareketlerini tersine
              çevirir.
            </div>
          )}
          {purchase.status === "cancelled" && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 print:hidden">
              Bu alış iptal edilmiş — stok ve cari etkileri geri alınmıştır.
            </div>
          )}
        </>
      )}
    </div>
  );
}
