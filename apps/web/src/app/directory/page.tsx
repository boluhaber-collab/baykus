"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch, formatMoney } from "@/lib/api";

type Entry = {
  kind: string;
  id: number;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  code: string | null;
  href: string;
  balance: number | null;
};

type Contact = {
  id: number;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  notes: string | null;
};

const empty = { name: "", company: "", phone: "", email: "", city: "", notes: "" };

const TABS = [
  { key: "customer", label: "Müşteri" },
  { key: "supplier", label: "Tedarikçi" },
  { key: "contact", label: "Kişi / Diğer" },
] as const;

export default function DirectoryPage() {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("customer");
  const [items, setItems] = useState<Entry[]>([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      params.set("kind", tab);
      setItems(await apiFetch<Entry[]>(`/api/directory?${params}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [q, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  async function syncRefresh() {
    setSyncing(true);
    setMsg("");
    try {
      await load();
      setMsg("Müşteri / tedarikçi listesi senkron yenilendi (canlı kaynak).");
    } finally {
      setSyncing(false);
    }
  }

  function startEdit(e: Entry) {
    if (e.kind !== "contact") {
      window.location.href = e.href;
      return;
    }
    setEditId(e.id);
    setForm({
      name: e.name,
      company: e.company || "",
      phone: e.phone || "",
      email: e.email || "",
      city: e.city || "",
      notes: "",
    });
  }

  async function saveContact(ev: FormEvent) {
    ev.preventDefault();
    setError("");
    setMsg("");
    const body = {
      name: form.name.trim(),
      company: form.company || null,
      phone: form.phone || null,
      email: form.email || null,
      city: form.city || null,
      notes: form.notes || null,
    };
    try {
      if (editId) {
        await apiFetch(`/api/directory/contacts/${editId}`, { method: "PUT", body: JSON.stringify(body) });
        setMsg("Kişi güncellendi");
      } else {
        await apiFetch<Contact>("/api/directory/contacts", { method: "POST", body: JSON.stringify(body) });
        setMsg("Manuel kişi eklendi");
        setTab("contact");
      }
      setForm(empty);
      setEditId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    }
  }

  async function removeContact(id: number) {
    if (!confirm("Kişiyi sil?")) return;
    try {
      await apiFetch(`/api/directory/contacts/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silme hatası");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Fihrist</h2>
          <p className="text-xs text-baykus-muted">Müşteri / Tedarikçi sekmeleri · canlı senkron · arama / düzenle</p>
        </div>
        <button type="button" className="bk-btn bk-btn-primary text-xs" disabled={syncing} onClick={syncRefresh}>
          {syncing ? "…" : "Yenile / Senkron"}
        </button>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{msg}</div>}

      <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-t border border-b-0 ${
              tab === t.key ? "bg-white text-baykus-primary border-slate-300" : "bg-slate-100 text-slate-600 border-transparent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-sm">
          Ara
          <input
            className="bk-input mt-0.5 block min-w-[220px]"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ad, telefon, kod…"
          />
        </label>
      </div>

      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Ad</th>
              <th>Firma</th>
              <th>Telefon</th>
              <th>E-posta</th>
              <th>Şehir</th>
              <th className="text-right">Bakiye</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={`${e.kind}-${e.id}`}>
                <td>
                  <Link href={e.href} className="text-baykus-primary hover:underline font-medium">
                    {e.name}
                  </Link>
                  {e.code && <span className="ml-1 text-[10px] text-baykus-muted font-mono">{e.code}</span>}
                </td>
                <td>{e.company || "—"}</td>
                <td>{e.phone || "—"}</td>
                <td className="text-xs">{e.email || "—"}</td>
                <td>{e.city || "—"}</td>
                <td className="text-right tabular-nums">{e.balance != null ? formatMoney(e.balance) : "—"}</td>
                <td className="text-right text-xs whitespace-nowrap">
                  <button type="button" className="text-baykus-primary hover:underline mr-2" onClick={() => startEdit(e)}>
                    Düzenle
                  </button>
                  {e.kind === "contact" && (
                    <button type="button" className="text-red-600 hover:underline" onClick={() => removeContact(e.id)}>
                      Sil
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-baykus-muted py-8">
                  Kayıt yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {tab === "contact" && (
        <form onSubmit={saveContact} className="rounded border bg-white p-3 grid md:grid-cols-3 gap-2 text-sm">
          <div className="md:col-span-3 text-xs font-semibold text-baykus-muted">
            {editId ? "Kişi düzenle" : "Manuel kişi ekle"}
          </div>
          <label>
            Ad *
            <input required className="bk-input mt-0.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            Firma
            <input className="bk-input mt-0.5" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </label>
          <label>
            Telefon
            <input className="bk-input mt-0.5" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label>
            E-posta
            <input className="bk-input mt-0.5" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label>
            Şehir
            <input className="bk-input mt-0.5" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="bk-btn bk-btn-primary text-xs">
              {editId ? "Güncelle" : "Ekle"}
            </button>
            {editId && (
              <button
                type="button"
                className="bk-btn bk-btn-ghost text-xs"
                onClick={() => {
                  setEditId(null);
                  setForm(empty);
                }}
              >
                İptal
              </button>
            )}
          </div>
        </form>
      )}

      {tab !== "contact" && (
        <p className="text-[11px] text-baykus-muted">
          Müşteri / tedarikçi kartları kendi merkezlerinden düzenlenir — Düzenle ilgili kayda gider. Fihrist canlı senkron okur.
        </p>
      )}
    </div>
  );
}
