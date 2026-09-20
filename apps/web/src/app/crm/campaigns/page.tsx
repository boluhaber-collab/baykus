"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Campaign, apiFetch } from "@/lib/api";

export default function CampaignsPage() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    title: "",
    message_template: "",
    start_date: "",
    end_date: "",
    active: true,
  });

  const load = useCallback(async () => {
    setError("");
    try {
      setItems(await apiFetch<Campaign[]>("/api/crm/campaigns"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await apiFetch("/api/crm/campaigns", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          message_template: form.message_template,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          active: form.active,
        }),
      });
      setForm({ title: "", message_template: "", start_date: "", end_date: "", active: true });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    }
  }

  async function toggle(c: Campaign) {
    await apiFetch(`/api/crm/campaigns/${c.id}`, {
      method: "PUT",
      body: JSON.stringify({ active: !c.active }),
    });
    await load();
  }

  async function remove(id: number) {
    if (!confirm("Kampanyayı sil?")) return;
    await apiFetch(`/api/crm/campaigns/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Kampanyalar</h1>
        <p className="text-sm text-slate-500">Mesaj şablonu + tarih aralığı</p>
      </div>
      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}

      <form onSubmit={create} className="mb-6 rounded-xl border bg-white p-4 shadow-sm grid md:grid-cols-2 gap-3">
        <label className="text-sm md:col-span-2">
          <span className="text-slate-500">Başlık</span>
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        <label className="text-sm md:col-span-2">
          <span className="text-slate-500">Mesaj şablonu</span>
          <textarea required rows={3} value={form.message_template} onChange={(e) => setForm({ ...form, message_template: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="Merhaba {isim}, ..." />
        </label>
        <label className="text-sm">
          <span className="text-slate-500">Başlangıç</span>
          <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="text-slate-500">Bitiş</span>
          <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        <div className="md:col-span-2">
          <button type="submit" className="rounded-lg bg-baykus-700 text-white px-4 py-2 text-sm">Ekle</button>
        </div>
      </form>

      <div className="space-y-3">
        {items.map((c) => (
          <div key={c.id} className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">{c.title}</h2>
                <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{c.message_template}</p>
                <p className="text-xs text-slate-400 mt-2">
                  {c.start_date || "—"} → {c.end_date || "—"} · {c.active ? "aktif" : "pasif"}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => toggle(c)} className="text-sm text-baykus-700 hover:underline">
                  {c.active ? "Pasifleştir" : "Aktifleştir"}
                </button>
                <button onClick={() => remove(c.id)} className="text-sm text-red-600 hover:underline">Sil</button>
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-slate-500">Kampanya yok.</p>}
      </div>
    </div>
  );
}
