"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import OrderForm, { OrderFormPayload } from "@/components/OrderForm";
import {
  ORDER_STATUSES,
  OrderDesignFile,
  OrderDetail,
  apiFetch,
  downloadAuthFile,
  downloadPdf,
  formatMoney,
  statusBadgeClass,
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

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await apiFetch<OrderDetail>(`/api/orders/${id}`);
      setOrder(data);
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
          <Link href="/orders" className="text-sm text-baykus-600 hover:underline">
            ← Siparişler
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">{order.order_number}</h1>
          <p className="text-slate-500 text-sm">
            {order.customer_name || "Müşteri yok"} ·{" "}
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
