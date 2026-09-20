"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, formatMoney } from "@/lib/api";

type Candidate = {
  id: number;
  order_number: string;
  customer_id?: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  status: string;
  design_status?: string | null;
  total_amount: number;
  remaining?: number;
  delivery_date: string | null;
  products?: string;
  takip_turu: string;
  template_hint?: string;
  neden?: string;
  priority?: number;
};

type Template = { id: number; name: string; category: string; body: string };

type Track = {
  candidates: Candidate[];
  templates: Template[];
  ready_orders: Candidate[];
  payment_due: Candidate[];
  design_approval: Candidate[];
  counts: { ready: number; payment_due: number; design_approval: number; candidates?: number };
  note?: string;
};

const TYPES = ["Tümü", "Hazır Sipariş", "Ödeme Hatırlatma", "Tasarım Onayı"] as const;

function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 11) digits = "90" + digits.slice(1);
  return digits;
}

function renderBody(body: string, c: Candidate): string {
  const map: Record<string, string> = {
    musteri: c.customer_name || "",
    siparis_no: c.order_number,
    kalan: formatMoney(c.remaining || 0),
    toplam: formatMoney(c.total_amount || 0),
    durum: c.status || "",
    teslim: c.delivery_date || "",
    urun: c.products || "",
  };
  let text = body;
  for (const [k, v] of Object.entries(map)) {
    text = text.replaceAll(`{${k}}`, v).replaceAll(`{{${k}}}`, v);
  }
  return text;
}

export default function WhatsAppTrackPage() {
  const [data, setData] = useState<Track | null>(null);
  const [error, setError] = useState("");
  const [tur, setTur] = useState<(typeof TYPES)[number]>("Tümü");
  const [q, setQ] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<number | "">("");
  const [preview, setPreview] = useState("");
  const [waLink, setWaLink] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await apiFetch<Track>("/api/whatsapp/track"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const candidates = useMemo(() => {
    let rows = data?.candidates || [];
    if (tur !== "Tümü") rows = rows.filter((r) => r.takip_turu === tur);
    if (q.trim()) {
      const needle = q.trim().toLocaleLowerCase("tr");
      rows = rows.filter((r) =>
        [r.takip_turu, r.order_number, r.customer_name, r.customer_phone, r.status, r.neden, r.products]
          .join(" ")
          .toLocaleLowerCase("tr")
          .includes(needle),
      );
    }
    return rows;
  }, [data, tur, q]);

  const selected = useMemo(() => {
    if (!selectedKey) return null;
    return candidates.find((c) => `${c.takip_turu}-${c.id}` === selectedKey) || null;
  }, [candidates, selectedKey]);

  const counts = useMemo(() => {
    const all = data?.candidates || [];
    return {
      listed: candidates.length,
      ready: all.filter((c) => c.takip_turu === "Hazır Sipariş").length,
      pay: all.filter((c) => c.takip_turu === "Ödeme Hatırlatma").length,
      design: all.filter((c) => c.takip_turu === "Tasarım Onayı").length,
    };
  }, [data, candidates]);

  function pickTemplateFor(c: Candidate): Template | null {
    const tpls = data?.templates || [];
    if (templateId !== "") {
      return tpls.find((t) => t.id === templateId) || null;
    }
    const hint = (c.template_hint || c.takip_turu || "").toLowerCase();
    return (
      tpls.find((t) => t.name.toLowerCase().includes(hint.split(" ")[0] || "")) ||
      tpls.find((t) => (t.category || "").toLowerCase().includes("takip") || (t.category || "").toLowerCase().includes("sipariş")) ||
      tpls[0] ||
      null
    );
  }

  function buildPreview(c: Candidate) {
    const tpl = pickTemplateFor(c);
    const body =
      tpl?.body ||
      `Merhaba {musteri}, siparişiniz {siparis_no} hakkında bilgilendirme. Kalan: {kalan}. Baykuş Baskı`;
    const rendered = renderBody(body, c);
    setPreview(rendered);
    const phone = c.customer_phone ? normalizePhone(c.customer_phone) : "";
    setWaLink(phone ? `https://wa.me/${phone}?text=${encodeURIComponent(rendered)}` : "");
  }

  useEffect(() => {
    if (selected) buildPreview(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, templateId, data?.templates]);

  async function logOpen(c: Candidate) {
    if (!waLink) return;
    try {
      await apiFetch("/api/whatsapp/logs", {
        method: "POST",
        body: JSON.stringify({
          template_id: typeof templateId === "number" ? templateId : pickTemplateFor(c)?.id ?? null,
          phone: c.customer_phone,
          rendered_body: preview,
          wa_link: waLink,
          customer_name: c.customer_name,
        }),
      });
    } catch {
      /* non-blocking */
    }
    window.open(waLink, "_blank", "noopener,noreferrer");
  }

  function rowColor(turu: string) {
    if (turu === "Hazır Sipariş") return "border-l-4 border-l-green-600";
    if (turu === "Ödeme Hatırlatma") return "border-l-4 border-l-red-600";
    if (turu === "Tasarım Onayı") return "border-l-4 border-l-blue-600";
    return "";
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">WhatsApp Takip Merkezi</h2>
          <p className="text-xs text-baykus-muted">Aday listesi · şablon · wa.me (Selenium yok)</p>
        </div>
        <div className="flex gap-2">
          <Link href="/whatsapp" className="bk-btn bk-btn-ghost text-xs">
            Taslakları Düzenle
          </Link>
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={load}>
            Yenile
          </button>
        </div>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {data?.note && <div className="text-[11px] text-amber-800 bg-amber-50 rounded px-2 py-1">{data.note}</div>}

      <div className="bk-filter-bar items-end">
        <label className="text-xs">
          Takip Türü
          <select className="bk-input mt-0.5 block" value={tur} onChange={(e) => setTur(e.target.value as typeof tur)}>
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Ara
          <input className="bk-input mt-0.5 block min-w-[200px]" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="text-xs">
          Şablon
          <select
            className="bk-input mt-0.5 block min-w-[180px]"
            value={templateId === "" ? "" : String(templateId)}
            onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Otomatik (hint)</option>
            {(data?.templates || []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <div className="text-[11px] text-baykus-muted ml-auto">
          Listelenen: {counts.listed} | Hazır: {counts.ready} | Ödeme: {counts.pay} | Tasarım: {counts.design}
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-3">
        <div className="lg:col-span-3 bk-table-wrap max-h-[520px] overflow-auto">
          <table className="bk-table text-xs">
            <thead>
              <tr>
                <th>Tür</th>
                <th>Sipariş</th>
                <th>Müşteri</th>
                <th>Telefon</th>
                <th>Durum</th>
                <th className="text-right">Kalan</th>
                <th>Neden</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => {
                const key = `${c.takip_turu}-${c.id}`;
                return (
                  <tr
                    key={key}
                    className={`cursor-pointer hover:bg-slate-50 ${rowColor(c.takip_turu)} ${selectedKey === key ? "bg-sky-50" : ""}`}
                    onClick={() => setSelectedKey(key)}
                  >
                    <td>{c.takip_turu}</td>
                    <td className="font-medium">{c.order_number}</td>
                    <td>{c.customer_name || "—"}</td>
                    <td>{c.customer_phone || "—"}</td>
                    <td>{c.status}</td>
                    <td className="text-right tabular-nums">
                      {c.remaining != null && c.remaining > 0 ? formatMoney(c.remaining) : ""}
                    </td>
                    <td className="max-w-[160px] truncate">{c.neden || ""}</td>
                  </tr>
                );
              })}
              {candidates.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-baykus-muted py-8">
                    Aday yok
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="lg:col-span-2 space-y-2">
          <div className="bk-card p-3 space-y-2 text-sm">
            <div className="text-xs font-semibold text-baykus-muted">Seçili aday / mesaj</div>
            {!selected && <p className="text-xs text-baykus-muted">Soldan bir satır seçin.</p>}
            {selected && (
              <>
                <div className="text-xs">
                  <strong>{selected.order_number}</strong> · {selected.customer_name || "—"}
                  <div className="text-baykus-muted">{selected.takip_turu}</div>
                </div>
                <textarea className="bk-input w-full text-xs" rows={6} value={preview} onChange={(e) => setPreview(e.target.value)} />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="bk-btn text-xs text-white"
                    style={{ background: "#15803d" }}
                    disabled={!waLink}
                    onClick={() => logOpen(selected)}
                  >
                    WhatsApp&apos;ta Aç
                  </button>
                  <button type="button" className="bk-btn text-xs text-white" style={{ background: "#1f6feb" }} onClick={() => buildPreview(selected)}>
                    Mesajı Önizle
                  </button>
                  <Link href={`/orders/${selected.id}`} className="bk-btn bk-btn-ghost text-xs">
                    Sipariş Detayı
                  </Link>
                  {selected.customer_id && (
                    <Link href={`/customers/${selected.customer_id}`} className="bk-btn bk-btn-ghost text-xs">
                      Müşteri Kartı
                    </Link>
                  )}
                </div>
                {!selected.customer_phone && (
                  <p className="text-[11px] text-red-700">Telefon eksik — wa.me açılamaz.</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
