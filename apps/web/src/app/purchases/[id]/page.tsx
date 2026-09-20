"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  PURCHASE_STATUS_LABELS,
  PurchaseDetail,
  apiFetch,
  formatMoney,
} from "@/lib/api";

export default function PurchaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [purchase, setPurchase] = useState<PurchaseDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await apiFetch<PurchaseDetail>(`/api/purchases/${id}`);
      setPurchase(data);
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
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [purchase]);

  async function confirmPurchase() {
    if (!window.confirm("Satın almayı onaylamak stok ve tedarikçi borcunu günceller. Devam?")) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/purchases/${id}/confirm`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Onay hatası");
    } finally {
      setBusy(false);
    }
  }

  async function cancelPurchase() {
    if (!window.confirm("Taslağı iptal etmek istiyor musunuz?")) return;
    setBusy(true);
    try {
      await apiFetch(`/api/purchases/${id}/cancel`, { method: "POST" });
      await load();
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
              Satın Alma
            </Link>
            <span className="mx-1">›</span>
            <span className="font-medium">{purchase.purchase_number}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">{purchase.purchase_number}</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            <Link href={`/suppliers/${purchase.supplier_id}`} className="text-baykus-primary hover:underline">
              {purchase.supplier_name}
            </Link>
            {" · "}
            {purchase.purchase_date}
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
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {purchase.status === "draft" && (
            <>
              <button
                disabled={busy}
                onClick={confirmPurchase}
                className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                Onayla (stok↑ + borç)
              </button>
              <button
                disabled={busy}
                onClick={cancelPurchase}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
              >
                İptal et
              </button>
              <button onClick={onDelete} className="rounded-lg border border-red-200 text-red-700 px-4 py-2 text-sm">
                Sil
              </button>
            </>
          )}
          {purchase.status === "confirmed" && (
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
            onClick={() => window.print()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
          >
            Yazdır
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl bg-[#2563eb] text-white p-3 shadow-sm">
          <div className="text-[11px] font-semibold opacity-90">Toplam</div>
          <div className="text-lg font-bold tabular-nums">{formatMoney(Number(purchase.total_amount))}</div>
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
          <Link href={`/suppliers/${purchase.supplier_id}`} className="text-baykus-primary hover:underline">
            {purchase.supplier_name}
          </Link>
        </div>
        <div>
          <span className="text-slate-500">Belge tarihi:</span> {purchase.purchase_date}
        </div>
        <div>
          <span className="text-slate-500">Oluşturma:</span>{" "}
          {purchase.created_at ? String(purchase.created_at).slice(0, 16).replace("T", " ") : "—"}
        </div>
        <div>
          <span className="text-slate-500">Güncelleme:</span>{" "}
          {purchase.updated_at ? String(purchase.updated_at).slice(0, 16).replace("T", " ") : "—"}
        </div>
        {purchase.notes && (
          <div className="sm:col-span-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-amber-950">
            <span className="text-xs font-semibold text-amber-800">Not: </span>
            {purchase.notes}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 font-semibold text-sm">Alış kalemleri</div>
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
                    <Link href={`/products/${l.product_id}`} className="text-baykus-primary hover:underline">
                      {l.product_name || `Ürün #${l.product_id}`}
                    </Link>
                  ) : (
                    l.product_name || "—"
                  )}
                  {l.variant_name ? ` / ${l.variant_name}` : ""}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{Number(l.quantity)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatMoney(Number(l.unit_cost))}</td>
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
              <td className="px-4 py-3 text-right tabular-nums">{formatMoney(Number(purchase.subtotal))}</td>
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
    </div>
  );
}
