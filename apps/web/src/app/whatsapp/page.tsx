"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { WhatsAppLog, WhatsAppTemplate, apiFetch } from "@/lib/api";

const CATEGORIES = [
  "hazır sipariş",
  "ödeme hatırlatma",
  "tasarım onayı",
  "teslimat",
  "kampanya",
];

export default function WhatsAppPage() {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [logs, setLogs] = useState<WhatsAppLog[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [phone, setPhone] = useState("905321112233");
  const [placeholders, setPlaceholders] = useState({
    ad: "Ali Yılmaz",
    siparis_no: "SIP-2026-001",
    tutar: "1.250,00",
    tarih: "25.09.2026",
  });
  const [preview, setPreview] = useState<{ rendered_body: string; wa_link: string } | null>(null);
  const [form, setForm] = useState({ name: "", category: CATEGORIES[0], body: "" });

  const load = useCallback(async () => {
    setError("");
    try {
      const [t, l] = await Promise.all([
        apiFetch<WhatsAppTemplate[]>("/api/whatsapp/templates"),
        apiFetch<WhatsAppLog[]>("/api/whatsapp/logs"),
      ]);
      setTemplates(t);
      setLogs(l);
      if (t.length && selectedId === "") setSelectedId(t[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [selectedId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createTemplate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    try {
      await apiFetch("/api/whatsapp/templates", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ name: "", category: CATEGORIES[0], body: "" });
      setMsg("Şablon kaydedildi");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    }
  }

  async function doPreview() {
    setError("");
    try {
      const res = await apiFetch<{ rendered_body: string; wa_link: string }>("/api/whatsapp/preview", {
        method: "POST",
        body: JSON.stringify({
          template_id: selectedId || null,
          phone,
          placeholders,
        }),
      });
      setPreview(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Önizleme hatası");
    }
  }

  async function saveLogAndOpen() {
    if (!preview) return;
    setError("");
    try {
      await apiFetch("/api/whatsapp/logs", {
        method: "POST",
        body: JSON.stringify({
          template_id: selectedId || null,
          phone,
          rendered_body: preview.rendered_body,
          wa_link: preview.wa_link,
          customer_name: placeholders.ad,
        }),
      });
      window.open(preview.wa_link, "_blank");
      await load();
      setMsg("Gönderim günlüğe yazıldı (yerel) — wa.me açıldı");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Günlük hatası");
    }
  }

  async function removeTemplate(id: number) {
    if (!confirm("Şablon silinsin mi?")) return;
    await apiFetch(`/api/whatsapp/templates/${id}`, { method: "DELETE" });
    await load();
  }

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">WhatsApp Şablonları</h1>
      <p className="text-slate-500 text-sm mb-6">
        Şablon CRUD · placeholder · wa.me önizleme · yerel gönderim günlüğü
      </p>
      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}
      {msg && <div className="mb-4 rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm">{msg}</div>}

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <div className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
          <h2 className="font-semibold">Şablonlar</h2>
          {templates.length === 0 ? (
            <p className="text-sm text-slate-500">Şablon yok</p>
          ) : (
            <ul className="space-y-2">
              {templates.map((t) => (
                <li
                  key={t.id}
                  className={`rounded-lg border p-3 text-sm cursor-pointer ${
                    selectedId === t.id ? "border-baykus-500 bg-baykus-50" : "border-slate-200"
                  }`}
                  onClick={() => setSelectedId(t.id)}
                >
                  <div className="flex justify-between gap-2">
                    <div>
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-slate-500">{t.category}</div>
                    </div>
                    <button
                      type="button"
                      className="text-red-600 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        void removeTemplate(t.id);
                      }}
                    >
                      Sil
                    </button>
                  </div>
                  <p className="mt-1 text-slate-600 line-clamp-2">{t.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
          <h2 className="font-semibold">Yeni şablon</h2>
          <form onSubmit={createTemplate} className="space-y-3">
            <input
              className={input}
              placeholder="Ad"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <select
              className={input}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <textarea
              className={input}
              rows={4}
              placeholder="Merhaba {ad}, {siparis_no} için {tutar} TL — {tarih}"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              required
            />
            <button type="submit" className="rounded-lg bg-baykus-600 text-white px-4 py-2 text-sm">
              Kaydet
            </button>
          </form>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-5 shadow-sm mb-8 space-y-3">
        <h2 className="font-semibold">Önizleme / wa.me</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Telefon</label>
            <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          {(["ad", "siparis_no", "tutar", "tarih"] as const).map((key) => (
            <div key={key}>
              <label className="text-xs text-slate-500">{`{${key}}`}</label>
              <input
                className={input}
                value={placeholders[key]}
                onChange={(e) => setPlaceholders({ ...placeholders, [key]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void doPreview()} className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm">
            Önizle
          </button>
          {preview && (
            <button
              type="button"
              onClick={() => void saveLogAndOpen()}
              className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm"
            >
              Günlüğe yaz + wa.me aç
            </button>
          )}
        </div>
        {preview && (
          <div className="rounded-lg bg-slate-50 border p-3 text-sm space-y-2">
            <div className="whitespace-pre-wrap">{preview.rendered_body}</div>
            <a href={preview.wa_link} target="_blank" rel="noreferrer" className="text-baykus-700 break-all underline text-xs">
              {preview.wa_link}
            </a>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b font-semibold text-sm">Gönderim günlüğü (yerel)</div>
        {logs.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Kayıt yok</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-2">Tarih</th>
                <th className="px-4 py-2">Şablon</th>
                <th className="px-4 py-2">Telefon</th>
                <th className="px-4 py-2">Müşteri</th>
                <th className="px-4 py-2">Link</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="px-4 py-2 whitespace-nowrap">
                    {new Date(l.created_at).toLocaleString("tr-TR")}
                  </td>
                  <td className="px-4 py-2">{l.template_name || "—"}</td>
                  <td className="px-4 py-2">{l.phone}</td>
                  <td className="px-4 py-2">{l.customer_name || "—"}</td>
                  <td className="px-4 py-2">
                    <a href={l.wa_link} target="_blank" rel="noreferrer" className="text-baykus-600 underline">
                      aç
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
