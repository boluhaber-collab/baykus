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

export default function DirectoryPage() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [items, setItems] = useState<Entry[]>([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (kind) params.set("kind", kind);
      const qs = params.toString();
      setItems(await apiFetch<Entry[]>(`/api/directory${qs ? `?${qs}` : ""}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [q, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addContact(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    try {
      await apiFetch<Contact>("/api/directory/contacts", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          company: form.company || null,
          phone: form.phone || null,
          email: form.email || null,
          city: form.city || null,
          notes: form.notes || null,
        }),
      });
      setForm(empty);
      setMsg("Manuel kişi eklendi");
      setKind("contact");
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

  const kindLabel: Record<string, string> = {
    customer: "Müşteri",
    supplier: "Tedarikçi",
    contact: "Kişi",
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold">Fihrist</h2>
        <p className="text-xs text-baykus-muted">Müşteri + tedarikçi + manuel kişiler</p>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{msg}</div>}

      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-sm">
          Ara
          <input className="bk-input mt-0.5 block min-w-[200px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ad, telefon, kod…" />
        </label>
        <label className="text-sm">
          Tür
          <select className="bk-input mt-0.5 block" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">Tümü</option>
            <option value="customer">Müşteri</option>
            <option value="supplier">Tedarikçi</option>
            <option value="contact">Manuel kişi</option>
          </select>
        </label>
        <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => void load()}>
          Yenile
        </button>
      </div>

      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Tür</th>
              <th>Ad</th>
              <th>Firma</th>
              <th>Telefon</th>
              <th>Şehir</th>
              <th className="text-right">Bakiye</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={`${e.kind}-${e.id}`}>
                <td className="text-xs">{kindLabel[e.kind] || e.kind}</td>
                <td>
                  <Link href={e.href} className="text-baykus-primary hover:underline font-medium">
                    {e.name}
                  </Link>
                  {e.code && <span className="ml-1 text-[10px] text-baykus-muted font-mono">{e.code}</span>}
                </td>
                <td>{e.company || "—"}</td>
                <td>{e.phone || "—"}</td>
                <td>{e.city || "—"}</td>
                <td className="text-right tabular-nums">
                  {e.balance != null ? formatMoney(e.balance) : "—"}
                </td>
                <td className="text-right text-xs">
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

      <form onSubmit={addContact} className="rounded border bg-white p-3 grid md:grid-cols-3 gap-2 text-sm">
        <div className="md:col-span-3 text-xs font-semibold text-baykus-muted">Manuel kişi ekle</div>
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
        <div className="flex items-end">
          <button type="submit" className="bk-btn bk-btn-primary text-xs">
            Ekle
          </button>
        </div>
      </form>
    </div>
  );
}
