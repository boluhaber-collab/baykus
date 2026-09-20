"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch, formatMoney } from "@/lib/api";

type CostItem = {
  id: number;
  category: string;
  name: string;
  unit: string | null;
  unit_cost: number;
  note: string | null;
  active: boolean;
};

const empty = { category: "", name: "", unit: "adet", unit_cost: "", note: "", active: true };

export default function CostsPage() {
  const [items, setItems] = useState<CostItem[]>([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setItems(await apiFetch<CostItem[]>("/api/tools/costs"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const body = {
      category: form.category.trim(),
      name: form.name.trim(),
      unit: form.unit || "adet",
      unit_cost: Number(form.unit_cost) || 0,
      note: form.note || null,
      active: form.active,
    };
    try {
      if (editId) {
        await apiFetch(`/api/tools/costs/${editId}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiFetch("/api/tools/costs", { method: "POST", body: JSON.stringify(body) });
      }
      setForm(empty);
      setEditId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    }
  }

  async function remove(id: number) {
    if (!confirm("Kalemi sil?")) return;
    try {
      await apiFetch(`/api/tools/costs/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silme hatası");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Maliyet Yönetimi</h2>
          <p className="text-xs text-baykus-muted">Genel maliyet kalemleri (DTF dışında)</p>
        </div>
        <Link href="/tools/dtf" className="bk-btn bk-btn-ghost text-xs">
          DTF maliyet
        </Link>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <form onSubmit={submit} className="rounded border bg-white p-3 grid md:grid-cols-3 gap-2 text-sm">
        <label>
          Kategori
          <input required className="bk-input mt-0.5" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        </label>
        <label>
          Ad
          <input required className="bk-input mt-0.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          Birim
          <input className="bk-input mt-0.5" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
        </label>
        <label>
          Birim maliyet
          <input required type="number" step="0.0001" className="bk-input mt-0.5" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} />
        </label>
        <label>
          Not
          <input className="bk-input mt-0.5" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </label>
        <div className="flex items-end gap-2">
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Aktif
          </label>
          <button type="submit" className="bk-btn bk-btn-primary text-xs ml-auto">
            {editId ? "Güncelle" : "Ekle"}
          </button>
        </div>
      </form>

      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Kategori</th>
              <th>Ad</th>
              <th>Birim</th>
              <th className="text-right">Maliyet</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className={c.active ? undefined : "opacity-50"}>
                <td>{c.category}</td>
                <td>{c.name}</td>
                <td>{c.unit || "—"}</td>
                <td className="text-right tabular-nums">{formatMoney(Number(c.unit_cost))}</td>
                <td className="text-right space-x-2 text-xs">
                  <button
                    type="button"
                    className="text-baykus-primary hover:underline"
                    onClick={() => {
                      setEditId(c.id);
                      setForm({
                        category: c.category,
                        name: c.name,
                        unit: c.unit || "adet",
                        unit_cost: String(c.unit_cost),
                        note: c.note || "",
                        active: c.active,
                      });
                    }}
                  >
                    Düzenle
                  </button>
                  <button type="button" className="text-red-600 hover:underline" onClick={() => remove(c.id)}>
                    Sil
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-baykus-muted py-8">
                  Kalem yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
