"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import OrderForm, { OrderFormPayload } from "@/components/OrderForm";
import { PageHeader, StatusBadge, Card } from "@/components/ui";
import {
  ORDER_STATUSES,
  OrderDesignFile,
  OrderDetail,
  apiFetch,
  downloadAuthFile,
  downloadPdf,
  formatMoney,
  statusBadgeClass,
  BankAccount,
} from "@/lib/api";

export default function OrderDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [designFiles, setDesignFiles] = useState<OrderDesignFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("nakit");
  const [payNotes, setPayNotes] = useState("");
  const [postCari, setPostCari] = useState(true);
  const [postFinance, setPostFinance] = useState(false);
  const [financeMethod, setFinanceMethod] = useState<"cash" | "bank">("cash");
  const [bankId, setBankId] = useState("");
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [payBusy, setPayBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await apiFetch<OrderDetail>(`/api/orders/${id}`);
      setOrder(data);
      setPayAmount(data.remaining_amount ? String(data.remaining_amount) : "");
      try {
        const files = await apiFetch<OrderDesignFile[]>(`/api/orders/${id}/design-files`);
        setDesignFiles(files);
      } catch {
        setDesignFiles([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [id]);

  useEffect(() => {
    apiFetch<BankAccount[]>("/api/finance/banks?active=true")
      .then(setBanks)
      .catch(() => setBanks([]));
  }, []);

  async function uploadDesign(file: File) {
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      await apiFetch(`/api/orders/${id}/design-files`, { method: "POST", body: fd });
      const files = await apiFetch<OrderDesignFile[]>(`/api/orders/${id}/design-files`);
      setDesignFiles(files);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    load();
  }, [id, load]);

  async function changeStatus(status: string) {
    if (!order || status === order.status) return;
    setStatusBusy(true);
    setError("");
    try {
      const updated = await apiFetch<OrderDetail>(`/api/orders/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setOrder(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Durum güncellenemedi");
    } finally {
      setStatusBusy(false);
    }
  }

  async function handleUpdate(payload: OrderFormPayload) {
    const updated = await apiFetch<OrderDetail>(`/api/orders/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    setOrder(updated);
    setEditing(false);
  }

  async function softCancel() {
    if (!confirm("Siparişi iptal etmek istiyor musunuz?")) return;
    await apiFetch(`/api/orders/${id}?soft=true`, { method: "DELETE" });
    await load();
  }

  async function submitPayment(e: FormEvent) {
    e.preventDefault();
    setPayBusy(true);
    setError("");
    try {
      const updated = await apiFetch<OrderDetail>(`/api/orders/${id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: Number(payAmount),
          method: payMethod,
          notes: payNotes.trim() || null,
          post_to_cari: postCari,
          post_to_finance: postFinance,
          finance_method: postFinance ? financeMethod : null,
          bank_account_id: postFinance && financeMethod === "bank" && bankId ? Number(bankId) : null,
        }),
      });
      setOrder(updated);
      setPayAmount(updated.remaining_amount ? String(updated.remaining_amount) : "");
      setPayNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tahsilat kaydı başarısız");
    } finally {
      setPayBusy(false);
    }
  }

  if (!order && !error) {
    return <div className="text-slate-500">Yükleniyor…</div>;
  }

  if (!order) {
    return (
      <div>
        <p className="text-red-600 mb-4">{error}</p>
        <Link href="/orders" className="text-baykus-600 hover:underline">
          ← Listeye dön
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs text-baykus-muted mb-1">
            <Link href="/orders" className="text-baykus-primary hover:underline">Siparişler</Link>
            <span className="mx-1">/</span>
            <span className="font-medium text-baykus-text">{order.order_number}</span>
          </div>
          <h1 className="text-2xl font-bold text-baykus-text mt-1">{order.order_number}</h1>
          <p className="text-slate-500 text-sm">
            {order.customer_id ? (
              <Link href={`/customers/${order.customer_id}`} className="text-baykus-primary hover:underline">
                {order.customer_name || `Müşteri #${order.customer_id}`}
              </Link>
            ) : (
              "Müşteri yok"
            )} ·{" "}
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(order.status)}`}
            >
              {order.status}
            </span>
            {order.channel ? ` · ${order.channel}` : ""}
            {order.design_status ? ` · Tasarım: ${order.design_status}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <label className="text-xs text-slate-500">Durum değiştir</label>
          <select
            disabled={statusBusy}
            value={order.status}
            onChange={(e) => changeStatus(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={async () => {
              try {
                await downloadPdf(`/api/orders/${id}/work-order-pdf`, `${order.order_number}-is-emri.pdf`);
              } catch (e) {
                setError(e instanceof Error ? e.message : "PDF hatası");
              }
            }}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
          >
            İş Emri PDF
          </button>
          <Link
            href={`/orders/${id}/timeline`}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Yaşam Çizgisi
          </Link>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
          >
            {editing ? "Formu Kapat" : "Düzenle"}
          </button>
          {order.status !== "Sipariş İptali" && (
            <button
              type="button"
              onClick={softCancel}
              className="rounded-lg border border-red-200 text-red-700 px-4 py-2 text-sm"
            >
              İptal Et
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}

      {!editing && (
        <div className="space-y-6">
          <div className="grid md:grid-cols-4 gap-4">
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-500">Toplam</div>
              <div className="text-lg font-semibold">{formatMoney(Number(order.total_amount))}</div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-500">Ödenen / Kapora</div>
              <div className="text-lg font-semibold">{formatMoney(Number(order.paid_amount))}</div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-500">Kalan</div>
              <div className="text-lg font-semibold">
                {formatMoney(Number(order.remaining_amount))}
              </div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-500">Teslim Tarihi</div>
              <div className="text-lg font-semibold">
                {order.due_date ? String(order.due_date).slice(0, 10) : "—"}
              </div>
            </div>
          </div>

          {Number(order.remaining_amount) > 0 && (
            <form onSubmit={submitPayment} className="rounded-xl border border-baykus-line bg-white p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm text-baykus-text">Tahsilat kaydet</h2>
                <span className="text-xs text-baykus-muted">
                  Kalan {formatMoney(Number(order.remaining_amount))}
                </span>
              </div>
              <div className="grid md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] text-baykus-muted mb-1">Tutar (₺)</label>
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    required
                    className="bk-input"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-baykus-muted mb-1">Yöntem</label>
                  <select className="bk-input" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                    <option value="nakit">Nakit</option>
                    <option value="havale">Havale / EFT</option>
                    <option value="kredi_karti">Kredi kartı</option>
                    <option value="cek">Çek</option>
                    <option value="diger">Diğer</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[11px] text-baykus-muted mb-1">Not</label>
                  <input className="bk-input" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-baykus-text">
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={postCari} onChange={(e) => setPostCari(e.target.checked)} />
                  Cariye işle
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={postFinance} onChange={(e) => setPostFinance(e.target.checked)} />
                  Kasa / bankaya işle
                </label>
                {postFinance && (
                  <>
                    <select
                      className="bk-input w-auto py-1"
                      value={financeMethod}
                      onChange={(e) => setFinanceMethod(e.target.value as "cash" | "bank")}
                    >
                      <option value="cash">Kasa</option>
                      <option value="bank">Banka</option>
                    </select>
                    {financeMethod === "bank" && (
                      <select
                        className="bk-input w-auto py-1 min-w-[160px]"
                        value={bankId}
                        onChange={(e) => setBankId(e.target.value)}
                        required
                      >
                        <option value="">Banka seçin</option>
                        {banks.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </>
                )}
                <button type="submit" disabled={payBusy} className="bk-btn-primary ml-auto">
                  {payBusy ? "Kaydediliyor…" : "Tahsilat Kaydet"}
                </button>
              </div>
              {(order.payments || []).length > 0 && (
                <ul className="text-xs text-baykus-muted divide-y divide-baykus-line border-t border-baykus-line pt-2">
                  {order.payments.map((pay) => (
                    <li key={pay.id} className="py-1.5 flex justify-between gap-2">
                      <span>
                        {String(pay.paid_at).slice(0, 10)} · {pay.method}
                        {pay.notes ? ` — ${pay.notes}` : ""}
                      </span>
                      <span className="tabular-nums font-medium text-emerald-700">
                        {formatMoney(Number(pay.amount))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </form>
          )}

          {order.notes && (
            <div className="rounded-xl border bg-white p-4 shadow-sm text-sm text-slate-700">
              <div className="text-xs text-slate-500 mb-1">Notlar</div>
              {order.notes}
            </div>
          )}

          <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3">Ürün</th>
                  <th className="px-4 py-3">Adet</th>
                  <th className="px-4 py-3">Beden</th>
                  <th className="px-4 py-3">Renk</th>
                  <th className="px-4 py-3">Baskı</th>
                  <th className="px-4 py-3">Birim</th>
                  <th className="px-4 py-3">İskonto</th>
                  <th className="px-4 py-3">Satır</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((l) => (
                  <tr key={l.id ?? `${l.description}-${l.quantity}`} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium">{l.description}</td>
                    <td className="px-4 py-3">{l.quantity}</td>
                    <td className="px-4 py-3">{l.size || "—"}</td>
                    <td className="px-4 py-3">{l.color || "—"}</td>
                    <td className="px-4 py-3">{l.print_type || "—"}</td>
                    <td className="px-4 py-3">{formatMoney(Number(l.unit_price))}</td>
                    <td className="px-4 py-3">
                      {Number(l.discount_rate)
                        ? `%${l.discount_rate}`
                        : formatMoney(Number(l.discount_amount || 0))}
                    </td>
                    <td className="px-4 py-3">{formatMoney(Number(l.line_total || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="font-semibold text-sm">Tasarım Dosyaları</h2>
              <label className="rounded-lg border px-3 py-1.5 text-xs cursor-pointer hover:bg-slate-50">
                {uploading ? "Yükleniyor…" : "+ Dosya yükle"}
                <input
                  type="file"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadDesign(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {designFiles.length === 0 ? (
              <p className="text-sm text-slate-400">Henüz dosya yok</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {designFiles.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
                    <span className="text-slate-700">
                      {f.original_filename}{" "}
                      <span className="text-xs text-slate-400">
                        ({Math.round((f.size_bytes || 0) / 1024)} KB)
                      </span>
                    </span>
                    <button
                      type="button"
                      className="text-baykus-600 hover:underline text-xs"
                      onClick={() =>
                        downloadAuthFile(
                          `/api/orders/${id}/design-files/${f.id}/download`,
                          f.original_filename,
                        ).catch((e) => setError(e instanceof Error ? e.message : "İndirme hatası"))
                      }
                    >
                      İndir
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {order.status_history?.length > 0 && (
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <h2 className="font-semibold text-sm mb-3">Durum Geçmişi</h2>
              <ul className="space-y-2 text-sm text-slate-600">
                {order.status_history.map((h) => (
                  <li key={h.id} className="flex flex-wrap gap-2">
                    <span className="text-slate-400 whitespace-nowrap">
                      {new Date(h.created_at).toLocaleString("tr-TR")}
                    </span>
                    <span>
                      {h.from_status ? `${h.from_status} → ` : ""}
                      <strong>{h.to_status}</strong>
                      {h.note ? ` — ${h.note}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {editing && (
        <OrderForm
          initial={order}
          submitLabel="Güncelle"
          onSubmit={handleUpdate}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}
