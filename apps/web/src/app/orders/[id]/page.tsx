"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import OrderForm, { OrderFormPayload } from "@/components/OrderForm";
import {
  DESIGN_STATUSES,
  ORDER_STATUSES,
  OrderDesignFile,
  OrderDetail,
  WhatsAppTemplate,
  apiFetch,
  downloadAuthFile,
  downloadPdf,
  formatMoney,
  statusBadgeClass,
  designStatusBadgeClass,
} from "@/lib/api";
import StatusFooter from "@/components/StatusFooter";
import SplitPaymentRows, {
  SplitPaymentRow,
  rowsSum,
  rowsToPayload,
} from "@/components/SplitPaymentRows";
import { dateToPaidAt, formatTrDate, formatTrDateTime, localToday } from "@/lib/dates";

function todayISO(): string {
  return localToday();
}

function fmtDt(v?: string | null): string {
  return formatTrDateTime(v, "");
}

export default function OrderDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [editing, setEditing] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [designFiles, setDesignFiles] = useState<OrderDesignFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [payRows, setPayRows] = useState<SplitPaymentRow[]>([]);
  const [payNotes, setPayNotes] = useState("");
  const [payDate, setPayDate] = useState(() => localToday());
  const [postCari, setPostCari] = useState(true);
  const [postFinance, setPostFinance] = useState(true);
  const [payBusy, setPayBusy] = useState(false);
  const [payResetKey, setPayResetKey] = useState(0);

  // Design approval block
  const [designStatus, setDesignStatus] = useState("Bekliyor");
  const [designNotes, setDesignNotes] = useState("");
  const [designApprovedDate, setDesignApprovedDate] = useState(todayISO());
  const [designBusy, setDesignBusy] = useState(false);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [waBusy, setWaBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await apiFetch<OrderDetail>(`/api/orders/${id}`);
      setOrder(data);
      setPayResetKey((k) => k + 1);
      setDesignStatus(data.design_status || "Bekliyor");
      setDesignNotes(data.design_notes || "");
      setDesignApprovedDate(
        data.design_approved_at
          ? String(data.design_approved_at).slice(0, 10)
          : todayISO(),
      );
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
    apiFetch<WhatsAppTemplate[]>("/api/whatsapp/templates")
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, []);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    load();
  }, [id, load]);

  useEffect(() => {
    if (typeof window === "undefined" || !order) return;
    const wantPrint = new URLSearchParams(window.location.search).get("print") === "1";
    if (!wantPrint) return;
    const tmr = setTimeout(() => {
      void (async () => {
        try {
          const { printPdfFromApi } = await import("@/lib/printPdf");
          await printPdfFromApi(`/api/orders/${id}/work-order-pdf`);
        } catch {
          window.print();
        }
      })();
    }, 400);
    return () => clearTimeout(tmr);
  }, [order]);

  const designTemplates = useMemo(() => {
    return templates.filter(
      (t) =>
        t.category.toLocaleLowerCase("tr").includes("tasarım") ||
        t.name.toLocaleLowerCase("tr").includes("tasarim") ||
        t.name.toLocaleLowerCase("tr").includes("hazir") ||
        t.category.toLocaleLowerCase("tr").includes("ödeme") ||
        t.category.toLocaleLowerCase("tr").includes("teslim"),
    );
  }, [templates]);

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
      setOkMsg(`Durum: ${status}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Durum güncellenemedi");
    } finally {
      setStatusBusy(false);
    }
  }

  async function saveDesign(opts?: { markWhatsapp?: boolean; nextStatus?: string }) {
    setDesignBusy(true);
    setError("");
    setOkMsg("");
    try {
      const body: Record<string, unknown> = {
        design_status: opts?.nextStatus || designStatus,
        design_notes: designNotes || null,
        design_approved_at:
          (opts?.nextStatus || designStatus) === "Onaylandı" && designApprovedDate
            ? `${designApprovedDate}T12:00:00`
            : null,
        mark_whatsapp_sent: Boolean(opts?.markWhatsapp),
      };
      const updated = await apiFetch<OrderDetail>(`/api/orders/${id}/design`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setOrder(updated);
      setDesignStatus(updated.design_status || "Bekliyor");
      setDesignNotes(updated.design_notes || "");
      if (updated.design_approved_at) {
        setDesignApprovedDate(String(updated.design_approved_at).slice(0, 10));
      }
      setOkMsg(opts?.markWhatsapp ? "WhatsApp zaman damgası kaydedildi" : "Tasarım onay bilgileri kaydedildi");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tasarım kaydı başarısız");
    } finally {
      setDesignBusy(false);
    }
  }

  async function openWhatsApp(tpl: WhatsAppTemplate) {
    if (!order) return;
    const phone = order.customer_phone;
    if (!phone) {
      setError("Müşteri telefonu yok — WhatsApp açılamaz");
      return;
    }
    setWaBusy(true);
    setError("");
    try {
      // Auto-advance design status like desktop when using design templates
      const isDesignTpl =
        tpl.category.toLocaleLowerCase("tr").includes("tasarım") ||
        tpl.name.toLocaleLowerCase("tr").includes("tasarim");
      if (isDesignTpl && (designStatus === "Bekliyor" || designStatus === "Revize Edildi")) {
        setDesignStatus("Onay İstendi");
      }
      await saveDesign({
        markWhatsapp: isDesignTpl,
        nextStatus: isDesignTpl && (designStatus === "Bekliyor" || designStatus === "Revize Edildi")
          ? "Onay İstendi"
          : undefined,
      });

      const preview = await apiFetch<{ rendered_body: string; wa_link: string }>(
        "/api/whatsapp/preview",
        {
          method: "POST",
          body: JSON.stringify({
            template_id: tpl.id,
            phone,
            placeholders: {
              ad: order.customer_name || "Müşteri",
              siparis_no: order.order_number,
              tutar: String(order.remaining_amount ?? order.total_amount ?? ""),
              tarih: order.due_date ? String(order.due_date).slice(0, 10) : todayISO(),
              not: designNotes || "",
            },
          }),
        },
      );
      // Log history (best-effort)
      try {
        await apiFetch("/api/whatsapp/logs", {
          method: "POST",
          body: JSON.stringify({
            template_id: tpl.id,
            phone,
            rendered_body: preview.rendered_body,
            wa_link: preview.wa_link,
            customer_name: order.customer_name || null,
          }),
        });
      } catch {
        /* ignore */
      }
      window.open(preview.wa_link, "_blank", "noopener,noreferrer");
      setOkMsg(`WhatsApp: ${tpl.name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "WhatsApp önizleme hatası");
    } finally {
      setWaBusy(false);
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
      const payments = rowsToPayload(payRows);
      const amount = rowsSum(payRows);
      if (!(amount > 0) || !payments.length) {
        throw new Error("En az bir kasa/hesap tahsilat satırı girin.");
      }
      const updated = await apiFetch<OrderDetail>(`/api/orders/${id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount,
          method: payments.length > 1 ? "çoklu" : payments[0]!.method || "nakit",
          notes: payNotes.trim() || null,
          paid_at: dateToPaidAt(payDate),
          post_to_cari: postCari,
          post_to_finance: postFinance,
          payments,
        }),
      });
      setOrder(updated);
      setPayNotes("");
      setPayDate(localToday());
      setPayRows([]);
      setPayResetKey((k) => k + 1);
      setOkMsg("Tahsilat kaydedildi");
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
    <div className="space-y-2 pb-2">
      {/* Sticky header + toolbar */}
      <div className="bk-sticky-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] text-baykus-muted mb-0.5">
            <Link href="/orders" className="text-baykus-primary hover:underline">
              Sipariş Merkezi
            </Link>
            <span className="mx-1">/</span>
            <span className="font-medium text-baykus-text">{order.order_number}</span>
          </div>
          <h1 className="text-lg font-bold text-baykus-text leading-tight">
            {order.order_number}
            {order.customer_name ? ` | ${order.customer_name}` : ""}
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {order.customer_id ? (
              <Link href={`/customers/${order.customer_id}`} className="text-baykus-primary hover:underline">
                {order.customer_name || `Müşteri #${order.customer_id}`}
              </Link>
            ) : (
              "Müşteri yok"
            )}
            {order.customer_phone ? ` · ${order.customer_phone}` : ""}
            {" · "}
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(order.status)}`}>
              {order.status}
            </span>
            {order.channel ? ` · ${order.channel}` : ""}
          </p>
        </div>
        {/* Tek toolbar — durum, tasarım, WA, iş emri PDF, tahsilat, yazdır */}
        <div className="flex flex-wrap gap-2 items-center print:hidden">
          <label className="text-xs text-slate-500">Durum</label>
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
            onClick={() => document.getElementById("order-design")?.scrollIntoView({ behavior: "smooth" })}
            className="rounded-lg px-3 py-2 text-sm font-medium text-white"
            style={{ background: "#7c3aed" }}
          >
            Tasarım
          </button>
          <button
            type="button"
            disabled={!order.customer_phone || waBusy}
            onClick={() => {
              const tpl = designTemplates[0] || templates[0];
              if (tpl) void openWhatsApp(tpl);
              else document.getElementById("order-design")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
            style={{ background: "#15803d" }}
          >
            WhatsApp
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await downloadPdf(`/api/orders/${id}/work-order-pdf`, `${order.order_number}-is-emri.pdf`);
              } catch (e) {
                setError(e instanceof Error ? e.message : "PDF hatası");
              }
            }}
            className="rounded-lg bg-slate-800 text-white px-3 py-2 text-sm font-medium"
          >
            İş Emri PDF
          </button>
          <button
            type="button"
            onClick={() => document.getElementById("order-tahsilat")?.scrollIntoView({ behavior: "smooth" })}
            className="rounded-lg px-3 py-2 text-sm font-medium text-white"
            style={{ background: "#198754" }}
          >
            Tahsilat
          </button>
          <button
            type="button"
            onClick={() => {
              void (async () => {
                try {
                  const { printPdfFromApi } = await import("@/lib/printPdf");
                  await printPdfFromApi(`/api/orders/${id}/work-order-pdf`);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Yazdırma hatası");
                }
              })();
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            Yazdır
          </button>
          <Link
            href={`/orders/${id}/timeline`}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            Yaşam Çizgisi
          </Link>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {editing ? "Formu Kapat" : "Düzenle"}
          </button>
          {order.status !== "Sipariş İptali" && (
            <button
              type="button"
              onClick={softCancel}
              className="rounded-lg border border-red-200 text-red-700 px-3 py-2 text-sm"
            >
              İptal Et
            </button>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}
      {okMsg && <div className="rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm">{okMsg}</div>}

      {!editing && (
        <>
          {/* Summary cards */}
          <div className="bk-kpi-strip" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
            <div className="bk-kpi-card" style={{ backgroundColor: "#2563eb" }}>
              <span className="bk-kpi-icon">₺</span>
              <div className="min-w-0 flex-1 text-right">
                <div className="bk-kpi-label">Toplam</div>
                <div className="bk-kpi-value truncate">{formatMoney(Number(order.total_amount))}</div>
              </div>
            </div>
            <div className="bk-kpi-card" style={{ backgroundColor: "#16a34a" }}>
              <span className="bk-kpi-icon">✓</span>
              <div className="min-w-0 flex-1 text-right">
                <div className="bk-kpi-label">Kapora / Ödenen</div>
                <div className="bk-kpi-value truncate">{formatMoney(Number(order.paid_amount))}</div>
              </div>
            </div>
            <div
              className="bk-kpi-card"
              style={{ backgroundColor: Number(order.remaining_amount) > 0 ? "#dc2626" : "#64748b" }}
            >
              <span className="bk-kpi-icon">!</span>
              <div className="min-w-0 flex-1 text-right">
                <div className="bk-kpi-label">Kalan</div>
                <div className="bk-kpi-value truncate">{formatMoney(Number(order.remaining_amount))}</div>
              </div>
            </div>
            <div className="bk-kpi-card" style={{ backgroundColor: "#334155" }}>
              <span className="bk-kpi-icon">📅</span>
              <div className="min-w-0 flex-1 text-right">
                <div className="bk-kpi-label">Teslim Tarihi</div>
                <div className="bk-kpi-value truncate text-sm">
                  {formatTrDate(order.due_date)}
                </div>
              </div>
            </div>
          </div>

          {/* Design approval + WhatsApp — one screen block */}
          <div id="order-design" className="rounded-xl border border-violet-200 bg-[#faf5ff] p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-sm text-violet-950">Tasarım Onay Akışı</h2>
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${designStatusBadgeClass(designStatus)}`}>
                {designStatus}
              </span>
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-baykus-muted mb-1">Onay Durumu</label>
                <select
                  className="bk-input"
                  value={designStatus}
                  onChange={(e) => setDesignStatus(e.target.value)}
                >
                  {DESIGN_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-baykus-muted mb-1">Onay Tarihi</label>
                <input
                  type="date"
                  className="bk-input"
                  value={designApprovedDate}
                  onChange={(e) => setDesignApprovedDate(e.target.value)}
                />
              </div>
              <div className="text-xs text-baykus-muted flex flex-col justify-end pb-1">
                <div>WhatsApp: {order.design_whatsapp_at ? fmtDt(order.design_whatsapp_at) : "Henüz gönderilmedi"}</div>
                <div className="mt-0.5">Dosya: {designFiles.length} adet</div>
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-baykus-muted mb-1">Revizyon / Tasarım Notu</label>
              <textarea
                className="bk-input min-h-[72px]"
                value={designNotes}
                onChange={(e) => setDesignNotes(e.target.value)}
                placeholder="Revizyon notu…"
              />
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <button
                type="button"
                disabled={designBusy}
                onClick={() => saveDesign()}
                className="bk-btn text-xs text-white"
                style={{ backgroundColor: "#198754" }}
              >
                {designBusy ? "Kaydediliyor…" : "Tasarımı Kaydet"}
              </button>
              <label className="rounded-lg border px-3 py-1.5 text-xs cursor-pointer hover:bg-white bg-white/70">
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
              {designFiles.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="text-xs text-baykus-primary hover:underline"
                  onClick={() =>
                    downloadAuthFile(
                      `/api/orders/${id}/design-files/${f.id}/download`,
                      f.original_filename,
                    ).catch((e) => setError(e instanceof Error ? e.message : "İndirme hatası"))
                  }
                >
                  {f.original_filename}
                </button>
              ))}
            </div>
            <div className="border-t border-violet-200 pt-3">
              <div className="text-[11px] font-semibold text-baykus-muted mb-2">WhatsApp hızlı aksiyonlar</div>
              <div className="flex flex-wrap gap-2">
                {(designTemplates.length ? designTemplates : templates.slice(0, 4)).map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    disabled={waBusy || !order.customer_phone}
                    onClick={() => openWhatsApp(tpl)}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                    style={{ backgroundColor: "#15803d" }}
                    title={tpl.body}
                  >
                    {tpl.name.replace(/_/g, " ")}
                  </button>
                ))}
                {!order.customer_phone && (
                  <span className="text-xs text-amber-700">Telefon yok — müşteri kartına ekleyin</span>
                )}
                <Link href="/whatsapp" className="text-xs text-baykus-primary hover:underline self-center ml-auto">
                  Tüm taslaklar →
                </Link>
              </div>
            </div>
          </div>

          {/* Payment */}
          <div id="order-tahsilat">
          {Number(order.remaining_amount) > 0 ? (
            <form onSubmit={submitPayment} data-baykus-save className="rounded-xl border border-baykus-line bg-white p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm text-baykus-text">Tahsilat kaydet</h2>
                <span className="text-xs text-baykus-muted">
                  Kalan {formatMoney(Number(order.remaining_amount))}
                </span>
              </div>
              <div>
                <label className="block text-[11px] text-baykus-muted mb-1">Tarih</label>
                <input
                  type="date"
                  className="bk-input max-w-[11rem]"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                />
              </div>
              <SplitPaymentRows
                key={payResetKey}
                expectedTotal={Number(order.remaining_amount) || 0}
                mode="tahsilat"
                autoFill
                dense
                onChange={setPayRows}
              />
              <div>
                <label className="block text-[11px] text-baykus-muted mb-1">Not</label>
                <input className="bk-input" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} />
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
                <button type="submit" disabled={payBusy} className="bk-btn-primary ml-auto">
                  {payBusy ? "Kaydediliyor…" : "Tahsilat Kaydet"}
                </button>
              </div>
              {(order.payments || []).length > 0 && (
                <ul className="text-xs text-baykus-muted divide-y divide-baykus-line border-t border-baykus-line pt-2">
                  {order.payments.map((pay) => (
                    <li key={pay.id} className="py-1.5 flex justify-between gap-2">
                      <span>
                        {formatTrDate(pay.paid_at)} · {pay.method}
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
          ) : (
            <div className="rounded-xl border border-baykus-line bg-white p-4 shadow-sm text-sm text-slate-600">
              <h2 className="font-semibold text-sm text-baykus-text mb-2">Tahsilat</h2>
              <p className="text-emerald-700">Kalan bakiye yok — sipariş tahsilatı tamamlandı.</p>
              {(order.payments || []).length > 0 && (
                <ul className="text-xs text-baykus-muted divide-y divide-baykus-line border-t border-baykus-line mt-2 pt-2">
                  {order.payments.map((pay) => (
                    <li key={pay.id} className="py-1.5 flex justify-between gap-2">
                      <span>
                        {formatTrDate(pay.paid_at)} · {pay.method}
                        {pay.notes ? ` — ${pay.notes}` : ""}
                      </span>
                      <span className="tabular-nums font-medium text-emerald-700">
                        {formatMoney(Number(pay.amount))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          </div>

          {order.notes && (
            <div className="rounded-xl border bg-white p-4 shadow-sm text-sm text-slate-700">
              <div className="text-xs text-slate-500 mb-1">Notlar</div>
              {order.notes}
            </div>
          )}

          <div className="rounded-xl border border-baykus-line bg-white shadow-sm overflow-hidden">
            <div className="px-3 py-2 border-b border-baykus-line text-xs font-semibold text-baykus-text">
              Sipariş kalemleri
            </div>
            <div className="bk-table-wrap">
            <table className="bk-table">
              <thead>
                <tr>
                  <th>Ürün</th>
                  <th className="text-right">Adet</th>
                  <th>Beden</th>
                  <th>Renk</th>
                  <th>Baskı</th>
                  <th className="text-right">Birim</th>
                  <th className="text-right">İskonto</th>
                  <th className="text-right">Satır</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((l) => (
                  <tr key={l.id ?? `${l.description}-${l.quantity}`}>
                    <td className="font-medium">{l.description}</td>
                    <td className="text-right tabular-nums">{l.quantity}</td>
                    <td>{l.size || "—"}</td>
                    <td>{l.color || "—"}</td>
                    <td>{l.print_type || "—"}</td>
                    <td className="text-right tabular-nums">{formatMoney(Number(l.unit_price))}</td>
                    <td className="text-right tabular-nums">
                      {Number(l.discount_rate)
                        ? `%${l.discount_rate}`
                        : formatMoney(Number(l.discount_amount || 0))}
                    </td>
                    <td className="text-right tabular-nums font-medium">{formatMoney(Number(l.line_total || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          {order.status_history?.length > 0 && (
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm">Durum Geçmişi</h2>
                <Link href={`/orders/${id}/timeline`} className="text-xs text-baykus-primary hover:underline">
                  Tam yaşam çizgisi →
                </Link>
              </div>
              <ul className="space-y-2 text-sm text-slate-600">
                {order.status_history.slice(-8).map((h) => (
                  <li key={h.id} className="flex flex-wrap gap-2">
                    <span className="text-slate-400 whitespace-nowrap">
                      {formatTrDateTime(h.created_at)}
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
        </>
      )}

      {editing && (
        <OrderForm
          initial={order}
          submitLabel="Güncelle"
          onSubmit={handleUpdate}
          onCancel={() => setEditing(false)}
        />
      )}
      <StatusFooter onRefresh={load} />
    </div>
  );
}
