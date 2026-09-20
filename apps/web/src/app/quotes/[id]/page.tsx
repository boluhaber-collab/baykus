"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Customer,
  Product,
  QuoteDetail,
  QUOTE_STATUSES,
  apiFetch,
  downloadPdf,
  formatMoney,
  quoteStatusBadgeClass,
} from "@/lib/api";

type EditLine = {
  key: string;
  product_id: string;
  description: string;
  quantity: string;
  size: string;
  color: string;
  print_type: string;
  unit_price: string;
};

function toEditLines(quote: QuoteDetail): EditLine[] {
  return (quote.lines || []).map((l) => ({
    key: String(l.id ?? Math.random().toString(36).slice(2)),
    product_id: l.product_id != null ? String(l.product_id) : "",
    description: l.description || "",
    quantity: String(l.quantity ?? 1),
    size: l.size || "",
    color: l.color || "",
    print_type: l.print_type || "",
    unit_price: String(l.unit_price ?? 0),
  }));
}

function emptyLine(): EditLine {
  return {
    key: Math.random().toString(36).slice(2),
    product_id: "",
    description: "",
    quantity: "1",
    size: "",
    color: "",
    print_type: "",
    unit_price: "0",
  };
}

export default function QuoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [status, setStatus] = useState("Taslak");
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [discount, setDiscount] = useState("0");
  const [lines, setLines] = useState<EditLine[]>([emptyLine()]);

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await apiFetch<QuoteDetail>(`/api/quotes/${id}`);
      setQuote(data);
      setCustomerId(data.customer_id != null ? String(data.customer_id) : "");
      setStatus(data.status);
      setNotes(data.notes || "");
      setValidUntil(data.valid_until ? String(data.valid_until).slice(0, 10) : "");
      setDiscount(String(data.discount_amount ?? 0));
      setLines(toEditLines(data).length ? toEditLines(data) : [emptyLine()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [id]);

  useEffect(() => {
    if (Number.isFinite(id)) load();
  }, [id, load]);

  useEffect(() => {
    if (!editing) return;
    Promise.all([
      apiFetch<Customer[]>("/api/customers"),
      apiFetch<Product[]>("/api/products"),
    ])
      .then(([c, p]) => {
        setCustomers(c);
        setProducts(p);
      })
      .catch((e) => setError(e.message));
  }, [editing]);

  function startEdit() {
    if (!quote) return;
    setCustomerId(quote.customer_id != null ? String(quote.customer_id) : "");
    setStatus(quote.status);
    setNotes(quote.notes || "");
    setValidUntil(quote.valid_until ? String(quote.valid_until).slice(0, 10) : "");
    setDiscount(String(quote.discount_amount ?? 0));
    setLines(toEditLines(quote).length ? toEditLines(quote) : [emptyLine()]);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setError("");
    if (quote) {
      setLines(toEditLines(quote).length ? toEditLines(quote) : [emptyLine()]);
    }
  }

  async function saveEdit(e: FormEvent) {
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
    setBusy("save");
    try {
      const updated = await apiFetch<QuoteDetail>(`/api/quotes/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          customer_id: customerId ? Number(customerId) : null,
          status,
          notes: notes || null,
          valid_until: validUntil || null,
          discount_amount: Number(discount) || 0,
          lines: payloadLines,
        }),
      });
      setQuote(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    } finally {
      setBusy("");
    }
  }

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
  const canEdit = canConvert;

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
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${quoteStatusBadgeClass(quote.status)}`}
            >
              {quote.status}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!!busy} onClick={pdf} className="rounded-lg border px-4 py-2 text-sm">
            PDF İndir
          </button>
          {canEdit && !editing && (
            <button
              type="button"
              disabled={!!busy}
              onClick={startEdit}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Düzenle
            </button>
          )}
          {editing && (
            <button type="button" onClick={cancelEdit} className="rounded-lg border px-4 py-2 text-sm">
              Düzenlemeyi İptal
            </button>
          )}
          {canConvert && !editing && (
            <button
              type="button"
              disabled={!!busy}
              onClick={convert}
              className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm"
            >
              Siparişe Dönüştür
            </button>
          )}
          {canConvert && !editing && (
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

      {editing ? (
        <form onSubmit={saveEdit} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4 rounded-xl border bg-white p-4 shadow-sm">
            <label className="text-sm">
              <span className="text-slate-500">Müşteri</span>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              >
                <option value="">— Seçin —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-slate-500">Durum</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              >
                {QUOTE_STATUSES.filter((s) => s !== "Siparişe Dönüştü").map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-slate-500">Geçerlilik</span>
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="text-slate-500">İskonto (TL)</span>
              <input
                type="number"
                step="0.01"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="text-slate-500">Notlar</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">Satırlar</h2>
              <button
                type="button"
                onClick={() => setLines((prev) => [...prev, emptyLine()])}
                className="text-sm text-baykus-600"
              >
                + Satır
              </button>
            </div>
            {lines.map((line) => (
              <div key={line.key} className="grid md:grid-cols-6 gap-2 border-t pt-3">
                <select
                  value={line.product_id}
                  onChange={(e) => {
                    const pid = e.target.value;
                    const prod = products.find((p) => String(p.id) === pid);
                    setLines((prev) =>
                      prev.map((l) =>
                        l.key === line.key
                          ? {
                              ...l,
                              product_id: pid,
                              description: prod?.name || l.description,
                              unit_price: prod ? String(prod.base_price ?? 0) : l.unit_price,
                            }
                          : l,
                      ),
                    );
                  }}
                  className="rounded-lg border px-2 py-1.5 text-sm md:col-span-2"
                >
                  <option value="">Ürün (opsiyonel)</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Açıklama"
                  value={line.description}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) => (l.key === line.key ? { ...l, description: e.target.value } : l)),
                    )
                  }
                  className="rounded-lg border px-2 py-1.5 text-sm md:col-span-2"
                  required
                />
                <input
                  type="number"
                  min={1}
                  value={line.quantity}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) => (l.key === line.key ? { ...l, quantity: e.target.value } : l)),
                    )
                  }
                  className="rounded-lg border px-2 py-1.5 text-sm"
                />
                <input
                  type="number"
                  step="0.01"
                  value={line.unit_price}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) => (l.key === line.key ? { ...l, unit_price: e.target.value } : l)),
                    )
                  }
                  className="rounded-lg border px-2 py-1.5 text-sm"
                />
                <input
                  placeholder="Beden"
                  value={line.size}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) => (l.key === line.key ? { ...l, size: e.target.value } : l)),
                    )
                  }
                  className="rounded-lg border px-2 py-1.5 text-sm"
                />
                <input
                  placeholder="Renk"
                  value={line.color}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) => (l.key === line.key ? { ...l, color: e.target.value } : l)),
                    )
                  }
                  className="rounded-lg border px-2 py-1.5 text-sm"
                />
                <input
                  placeholder="Baskı"
                  value={line.print_type}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) => (l.key === line.key ? { ...l, print_type: e.target.value } : l)),
                    )
                  }
                  className="rounded-lg border px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                  className="text-xs text-red-600"
                >
                  Sil
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy === "save"}
              className="rounded-lg bg-baykus-600 text-white px-4 py-2 text-sm"
            >
              Kaydet
            </button>
            <button type="button" onClick={cancelEdit} className="rounded-lg border px-4 py-2 text-sm">
              Vazgeç
            </button>
          </div>
        </form>
      ) : (
        <>
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
                    <td className="px-4 py-3 tabular-nums">
                      {formatMoney(Number(line.line_total || 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
