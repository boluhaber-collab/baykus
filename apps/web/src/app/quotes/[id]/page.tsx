"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  QuoteDetail,
  apiFetch,
  downloadPdf,
  formatMoney,
  quoteStatusBadgeClass,
} from "@/lib/api";

export default function QuoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await apiFetch<QuoteDetail>(`/api/quotes/${id}`);
      setQuote(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [id]);

  useEffect(() => {
    if (Number.isFinite(id)) load();
  }, [id, load]);

  async function convert() {
    if (!confirm("Teklifi siparişe dönüştürmek istiyor musunuz?")) return;
    setBusy("convert");
    setError("");
    try {
      const res = await apiFetch<{ order_id: number; order_number: string }>(
        `/api/quotes/${id}/convert`,
        { method: "POST" },
      );
      await load();
      if (confirm(`Sipariş ${res.order_number} oluşturuldu. Siparişe gitmek ister misiniz?`)) {
        router.push(`/orders/${res.order_id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dönüşüm hatası");
    } finally {
      setBusy("");
    }
  }

  async function cancelQuote() {
    if (!confirm("Teklifi reddedildi olarak işaretlensin mi?")) return;
    setBusy("cancel");
    try {
      await apiFetch(`/api/quotes/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "İptal hatası");
    } finally {
      setBusy("");
    }
  }

  async function pdf() {
    setBusy("pdf");
    try {
      await downloadPdf(`/api/quotes/${id}/pdf`, `${quote?.quote_number || "teklif"}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF hatası");
    } finally {
      setBusy("");
    }
  }

  if (!quote && !error) return <div className="text-slate-500">Yükleniyor…</div>;
  if (!quote) {
    return (
      <div>
        <p className="text-red-600 mb-4">{error}</p>
        <Link href="/quotes" className="text-baykus-600 hover:underline">
          ← Listeye dön
        </Link>
      </div>
    );
  }

  const canConvert =
    !quote.is_cancelled &&
    quote.status !== "Siparişe Dönüştü" &&
    quote.status !== "Reddedildi";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/quotes" className="text-sm text-baykus-600 hover:underline">
            ← Teklifler
          </Link>
          <h1 className="text-2xl font-bold mt-2">{quote.quote_number}</h1>
          <p className="text-slate-500 text-sm">
            {quote.customer_name || "Müşteri yok"} ·{" "}
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${quoteStatusBadgeClass(quote.status)}`}>
              {quote.status}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!!busy}
            onClick={pdf}
            className="rounded-lg border px-4 py-2 text-sm"
          >
            PDF İndir
          </button>
          {canConvert && (
            <button
              type="button"
              disabled={!!busy}
              onClick={convert}
              className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm"
            >
              Siparişe Dönüştür
            </button>
          )}
          {canConvert && (
            <button
              type="button"
              disabled={!!busy}
              onClick={cancelQuote}
              className="rounded-lg border border-red-200 text-red-700 px-4 py-2 text-sm"
            >
              Reddet / İptal
            </button>
          )}
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}

      {quote.converted_order_id && (
        <div className="mb-4 rounded-lg bg-violet-50 text-violet-800 px-4 py-2 text-sm">
          Siparişe dönüştü:{" "}
          <Link href={`/orders/${quote.converted_order_id}`} className="underline font-medium">
            Sipariş #{quote.converted_order_id}
          </Link>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Toplam</div>
          <div className="text-lg font-semibold">{formatMoney(Number(quote.total_amount))}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">İskonto</div>
          <div className="text-lg font-semibold">{formatMoney(Number(quote.discount_amount))}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Geçerlilik</div>
          <div className="text-lg font-semibold">{quote.valid_until || "—"}</div>
        </div>
      </div>

      {quote.notes && (
        <div className="mb-6 rounded-xl border bg-white p-4 shadow-sm text-sm text-slate-700">
          <div className="text-xs text-slate-500 mb-1">Notlar</div>
          {quote.notes}
        </div>
      )}

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3">Açıklama</th>
              <th className="px-4 py-3">Adet</th>
              <th className="px-4 py-3">Beden/Renk</th>
              <th className="px-4 py-3">Baskı</th>
              <th className="px-4 py-3">Birim</th>
              <th className="px-4 py-3">Tutar</th>
            </tr>
          </thead>
          <tbody>
            {(quote.lines || []).map((line) => (
              <tr key={line.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{line.description}</td>
                <td className="px-4 py-3">{line.quantity}</td>
                <td className="px-4 py-3">
                  {[line.size, line.color].filter(Boolean).join(" / ") || "—"}
                </td>
                <td className="px-4 py-3">{line.print_type || "—"}</td>
                <td className="px-4 py-3 tabular-nums">{formatMoney(Number(line.unit_price))}</td>
                <td className="px-4 py-3 tabular-nums">{formatMoney(Number(line.line_total || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
