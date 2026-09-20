"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Customer, SpecialDay, apiFetch } from "@/lib/api";

const TYPES = ["doğum günü", "yıldönümü", "kampanya", "diğer"];

export default function SpecialDaysPage() {
  const [items, setItems] = useState<SpecialDay[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
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
      const params = upcomingOnly ? "?upcoming_days=30&active=true" : "?active=true";
      const [s, c] = await Promise.all([
        apiFetch<SpecialDay[]>(`/api/crm/special-days${params}`),
        apiFetch<Customer[]>("/api/customers"),
      ]);
      setItems(s);
      setCustomers(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [upcomingOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((i) =>
      [i.name, i.day_type, i.customer_name, i.note].filter(Boolean).join(" ").toLowerCase().includes(needle),
    );
  }, [items, q]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    try {
      const body = {
        name: form.name.trim(),
        event_date: form.event_date,
        day_type: form.day_type,
        customer_id: form.customer_id ? Number(form.customer_id) : null,
        note: form.note || null,
        active: true,
      };
      if (editId) {
        await apiFetch(`/api/crm/special-days/${editId}`, { method: "PUT", body: JSON.stringify(body) });
        setMsg("Özel gün güncellendi");
      } else {
        await apiFetch("/api/crm/special-days", { method: "POST", body: JSON.stringify(body) });
        setMsg("Özel gün eklendi");
      }
      setForm({ name: "", event_date: "", day_type: "doğum günü", customer_id: "", note: "" });
      setEditId(null);
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Özel Günler</h2>
          <p className="text-xs text-baykus-muted">Doğum günü, yıldönümü, kampanya — müşteriye bağlı</p>
        </div>
        <Link href="/crm/campaigns" className="bk-btn text-white text-xs" style={{ background: "#f59e0b" }}>
          Kampanya / Toplu WA
        </Link>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{msg}</div>}

      <form onSubmit={create} className="rounded border bg-white p-3 grid md:grid-cols-3 gap-3 text-sm">
        <label className="md:col-span-2">
          <span className="text-[11px] text-baykus-muted">Ad</span>
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="bk-input mt-0.5"
          />
        </label>
        <label>
          <span className="text-[11px] text-baykus-muted">Tarih</span>
          <input
            required
            type="date"
            value={form.event_date}
            onChange={(e) => setForm({ ...form, event_date: e.target.value })}
            className="bk-input mt-0.5"
          />
        </label>
        <label>
          <span className="text-[11px] text-baykus-muted">Tür</span>
          <select
            value={form.day_type}
            onChange={(e) => setForm({ ...form, day_type: e.target.value })}
            className="bk-input mt-0.5"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-[11px] text-baykus-muted">Müşteri (opsiyonel)</span>
          <select
            value={form.customer_id}
            onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
            className="bk-input mt-0.5"
          >
            <option value="">—</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-[11px] text-baykus-muted">Not</span>
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="bk-input mt-0.5" />
        </label>
        <div className="md:col-span-3 flex gap-2">
          <button type="submit" className="bk-btn bk-btn-primary text-xs">
            {editId ? "Güncelle" : "Ekle"}
          </button>
          {editId && (
            <button
              type="button"
              className="bk-btn bk-btn-ghost text-xs"
              onClick={() => {
                setEditId(null);
                setForm({ name: "", event_date: "", day_type: "doğum günü", customer_id: "", note: "" });
              }}
            >
              Vazgeç
            </button>
          )}
        </div>
      </form>

      <div className="bk-filter-bar">
        <input className="bk-input max-w-xs" placeholder="Ara…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={upcomingOnly} onChange={(e) => setUpcomingOnly(e.target.checked)} />
          Önümüzdeki 30 gün
        </label>
        <span className="text-xs text-baykus-muted ml-auto">{filtered.length} kayıt</span>
      </div>

      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Ad</th>
              <th>Tür</th>
              <th>Tarih</th>
              <th>Müşteri</th>
              <th className="text-right">Kalan gün</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={i.id} className={(i.days_until ?? 999) <= 7 ? "bg-amber-50" : undefined}>
                <td className="font-medium">
                  {i.name}
                  {i.note && <div className="text-[10px] text-baykus-muted">{i.note}</div>}
                </td>
                <td>{i.day_type}</td>
                <td>{i.event_date}</td>
                <td>
                  {i.customer_id ? (
                    <Link href={`/customers/${i.customer_id}`} className="text-baykus-primary hover:underline">
                      {i.customer_name || `#${i.customer_id}`}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="text-right tabular-nums font-semibold">{i.days_until ?? "—"}</td>
                <td className="text-right space-x-2 text-xs">
                  <button
                    type="button"
                    className="text-baykus-primary hover:underline"
                    onClick={() => {
                      setEditId(i.id);
                      setForm({
                        name: i.name,
                        event_date: i.event_date,
                        day_type: i.day_type,
                        customer_id: i.customer_id ? String(i.customer_id) : "",
                        note: i.note || "",
                      });
                    }}
                  >
                    Düzenle
                  </button>
                  <button type="button" onClick={() => remove(i.id)} className="text-red-600 hover:underline">
                    Sil
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-baykus-muted py-8">
                  Kayıt yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
