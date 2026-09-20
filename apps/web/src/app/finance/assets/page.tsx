"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Asset, apiFetch, formatMoney } from "@/lib/api";

const emptyForm = {
  name: "",
  category: "",
  purchase_date: "",
  cost: "",
  depreciation_method: "straight_line",
  useful_life_months: "60",
  note: "",
  active: true,
};

export default function AssetsPage() {
  const [items, setItems] = useState<Asset[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      setItems(await apiFetch<Asset[]>("/api/finance/assets"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit(a: Asset) {
    setEditId(a.id);
    setForm({
      name: a.name,
      category: a.category || "",
      purchase_date: a.purchase_date || "",
      cost: String(a.cost ?? ""),
      depreciation_method: a.depreciation_method || "none",
      useful_life_months: a.useful_life_months != null ? String(a.useful_life_months) : "",
      note: a.note || "",
      active: a.active,
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const body = {
      name: form.name.trim(),
      category: form.category || null,
      purchase_date: form.purchase_date || null,
      cost: Number(form.cost) || 0,
      depreciation_method: form.depreciation_method,
      useful_life_months: form.useful_life_months ? Number(form.useful_life_months) : null,
      note: form.note || null,
      active: form.active,
    };
    try {
      if (editId) {
        await apiFetch(`/api/finance/assets/${editId}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiFetch("/api/finance/assets", { method: "POST", body: JSON.stringify(body) });
      }
      setForm(emptyForm);
      setEditId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    }
  }

  async function remove(id: number) {
    if (!confirm("Bu kıymeti silmek istiyor musunuz?")) return;
    try {
      await apiFetch(`/api/finance/assets/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silme hatası");
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Sabit kıymetler</h1>
        <p className="text-sm text-slate-500">Finans — amortisman (düz çizgi) opsiyonel</p>
      </div>
      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}

      <form onSubmit={submit} className="mb-6 rounded-xl border bg-white p-4 shadow-sm grid md:grid-cols-3 gap-3">
        <label className="text-sm md:col-span-2">
          <span className="text-slate-500">Ad</span>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="text-slate-500">Kategori</span>
          <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="text-slate-500">Alış tarihi</span>
          <input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="text-slate-500">Maliyet</span>
          <input required type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="text-slate-500">Amortisman</span>
          <select value={form.depreciation_method} onChange={(e) => setForm({ ...form, depreciation_method: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2">
            <option value="none">Yok</option>
            <option value="straight_line">Düz çizgi</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="text-slate-500">Ömür (ay)</span>
          <input type="number" value={form.useful_life_months} onChange={(e) => setForm({ ...form, useful_life_months: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        <label className="text-sm md:col-span-2">
          <span className="text-slate-500">Not</span>
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        <label className="text-sm flex items-end gap-2 pb-2">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          <span>Aktif</span>
        </label>
        <div className="md:col-span-3 flex gap-2">
          <button type="submit" className="rounded-lg bg-baykus-700 text-white px-4 py-2 text-sm hover:bg-baykus-800">
            {editId ? "Güncelle" : "Ekle"}
          </button>
          {editId && (
            <button type="button" onClick={() => { setEditId(null); setForm(emptyForm); }} className="rounded-lg border px-4 py-2 text-sm">
              İptal
            </button>
          )}
        </div>
      </form>

      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2">Ad</th>
              <th className="px-4 py-2">Kategori</th>
              <th className="px-4 py-2">Alış</th>
              <th className="px-4 py-2 text-right">Maliyet</th>
              <th className="px-4 py-2 text-right">Defter</th>
              <th className="px-4 py-2">Amort.</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2 font-medium">{a.name}</td>
                <td className="px-4 py-2">{a.category || "—"}</td>
                <td className="px-4 py-2">{a.purchase_date || "—"}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatMoney(Number(a.cost))}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {a.book_value != null ? formatMoney(Number(a.book_value)) : "—"}
                </td>
                <td className="px-4 py-2 text-xs">{a.depreciation_method === "straight_line" ? "Düz çizgi" : "Yok"}</td>
                <td className="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                  <button onClick={() => startEdit(a)} className="text-baykus-700 hover:underline">Düzenle</button>
                  <button onClick={() => remove(a.id)} className="text-red-600 hover:underline">Sil</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Kayıt yok</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
