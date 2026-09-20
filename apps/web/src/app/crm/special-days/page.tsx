"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Customer, SpecialDay, apiFetch } from "@/lib/api";

const TYPES = ["doğum günü", "yıldönümü", "kampanya", "diğer"];

export default function SpecialDaysPage() {
  const [items, setItems] = useState<SpecialDay[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    event_date: "",
    day_type: "doğum günü",
    customer_id: "",
    note: "",
  });

  const load = useCallback(async () => {
    setError("");
    try {
      const [s, c] = await Promise.all([
        apiFetch<SpecialDay[]>("/api/crm/special-days?active=true"),
        apiFetch<Customer[]>("/api/customers"),
      ]);
      setItems(s);
      setCustomers(c);
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
      await apiFetch("/api/crm/special-days", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          event_date: form.event_date,
          day_type: form.day_type,
          customer_id: form.customer_id ? Number(form.customer_id) : null,
          note: form.note || null,
          active: true,
        }),
      });
      setForm({ name: "", event_date: "", day_type: "doğum günü", customer_id: "", note: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    }
  }

  async function remove(id: number) {
    if (!confirm("Silmek istiyor musunuz?")) return;
    await apiFetch(`/api/crm/special-days/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Özel günler</h1>
        <p className="text-sm text-slate-500">Doğum günü, yıldönümü, kampanya — müşteriye bağlı olabilir</p>
      </div>
      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}

      <form onSubmit={create} className="mb-6 rounded-xl border bg-white p-4 shadow-sm grid md:grid-cols-3 gap-3">
        <label className="text-sm md:col-span-2">
          <span className="text-slate-500">Ad</span>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="text-slate-500">Tarih</span>
          <input required type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="text-slate-500">Tür</span>
          <select value={form.day_type} onChange={(e) => setForm({ ...form, day_type: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2">
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-slate-500">Müşteri (opsiyonel)</span>
          <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2">
            <option value="">—</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-slate-500">Not</span>
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        <div className="md:col-span-3">
          <button type="submit" className="rounded-lg bg-baykus-700 text-white px-4 py-2 text-sm">Ekle</button>
        </div>
      </form>

      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2">Ad</th>
              <th className="px-4 py-2">Tür</th>
              <th className="px-4 py-2">Tarih</th>
              <th className="px-4 py-2">Müşteri</th>
              <th className="px-4 py-2 text-right">Kalan gün</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-t hover:bg-slate-50">
                <td className="px-4 py-2 font-medium">{i.name}</td>
                <td className="px-4 py-2">{i.day_type}</td>
                <td className="px-4 py-2">{i.event_date}</td>
                <td className="px-4 py-2">{i.customer_name || "—"}</td>
                <td className="px-4 py-2 text-right tabular-nums">{i.days_until ?? "—"}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => remove(i.id)} className="text-red-600 hover:underline">Sil</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Kayıt yok</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
