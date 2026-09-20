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

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/purchases" className="text-sm text-baykus-600 hover:underline">
            ← Satın Alma
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">{purchase.purchase_number}</h1>
          <p className="text-slate-500 text-sm">
            <Link href={`/suppliers/${purchase.supplier_id}`} className="hover:underline">
              {purchase.supplier_name}
            </Link>
            {" · "}
            {purchase.purchase_date}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {purchase.status === "draft" && (
            <>
              <button
                disabled={busy}
                onClick={confirmPurchase}
                className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm disabled:opacity-60"
              >
                Onayla
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
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Durum</div>
          <div className="font-semibold mt-1">{PURCHASE_STATUS_LABELS[purchase.status] || purchase.status}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Ara toplam / vergi</div>
          <div className="font-semibold mt-1 tabular-nums">
            {formatMoney(Number(purchase.subtotal))} + {formatMoney(Number(purchase.tax_amount))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Toplam</div>
          <div className="text-xl font-bold mt-1 tabular-nums">{formatMoney(Number(purchase.total_amount))}</div>
        </div>
      </div>

      {purchase.notes && (
        <div className="mb-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">{purchase.notes}</div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3">Açıklama</th>
              <th className="px-4 py-3">Ürün / varyant</th>
              <th className="px-4 py-3 text-right">Miktar</th>
              <th className="px-4 py-3 text-right">Birim</th>
              <th className="px-4 py-3 text-right">Toplam</th>
            </tr>
          </thead>
          <tbody>
            {purchase.lines.map((l) => (
              <tr key={l.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{l.description}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">
                  {l.product_name || "—"}
                  {l.variant_name ? ` / ${l.variant_name}` : ""}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{Number(l.quantity)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatMoney(Number(l.unit_cost))}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">
                  {formatMoney(Number(l.line_total))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
