"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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

const empty = { category: "Kupa", name: "", unit: "adet", unit_cost: "", note: "", active: true };

export default function CostsPage() {
  const [items, setItems] = useState<CostItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [summary, setSummary] = useState<{ count: number; total: number; by_category: { category: string; total: number }[] } | null>(null);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<number | null>(null);
  const [filterCat, setFilterCat] = useState("");
  const [quickCat, setQuickCat] = useState("Kupa");
  const [quick, setQuick] = useState(
    Array.from({ length: 5 }, () => ({ name: "", unit_cost: "" })),
  );
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (filterCat) params.set("category", filterCat);
      const [list, cats, sum] = await Promise.all([
        apiFetch<CostItem[]>(`/api/tools/costs?${params}`),
        apiFetch<{ categories: string[] }>("/api/tools/costs/categories"),
        apiFetch<{ count: number; total: number; by_category: { category: string; total: number }[] }>("/api/tools/costs/summary"),
      ]);
      setItems(list);
      setCategories(cats.categories || []);
      setSummary(sum);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [filterCat]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => items, [items]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
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
        setMsg("Kalem güncellendi");
      } else {
        await apiFetch("/api/tools/costs", { method: "POST", body: JSON.stringify(body) });
        setMsg("Kalem eklendi");
      }
      setForm({ ...empty, category: form.category });
      setEditId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    }
  }

  async function saveQuick(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    const payload = {
      category: quickCat,
      items: quick
        .filter((q) => q.name.trim())
        .map((q) => ({ name: q.name.trim(), unit_cost: Number(q.unit_cost) || 0, unit: "adet" })),
    };
    if (!payload.items.length) {
      setError("En az bir kalem adı girin");
      return;
    }
    try {
      await apiFetch("/api/tools/costs/bulk", { method: "POST", body: JSON.stringify(payload) });
      setMsg(`${payload.items.length} kalem eklendi (${quickCat})`);
      setQuick(Array.from({ length: 5 }, () => ({ name: "", unit_cost: "" })));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Toplu kayıt hatası");
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
          <p className="text-xs text-baykus-muted">Fiyat / Maliyet › kategori kalemleri · DTF aktarımı destekli</p>
        </div>
        <div className="flex gap-2">
          <Link href="/tools/dtf" className="bk-btn bk-btn-ghost text-xs">
            DTF maliyet
          </Link>
          <Link href="/tools/last-purchase-prices" className="bk-btn bk-btn-ghost text-xs">
            Son alış
          </Link>
        </div>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{msg}</div>}

      {summary && (
        <div className="grid sm:grid-cols-3 gap-2">
          <div className="bk-card px-3 py-2">
            <div className="text-[11px] text-baykus-muted">Aktif kalem</div>
            <div className="text-xl font-bold">{summary.count}</div>
          </div>
          <div className="bk-card px-3 py-2">
            <div className="text-[11px] text-baykus-muted">Toplam tutar</div>
            <div className="text-xl font-bold tabular-nums">{formatMoney(summary.total)}</div>
          </div>
          <div className="bk-card px-3 py-2">
            <div className="text-[11px] text-baykus-muted">Kategori</div>
            <div className="text-xl font-bold">{summary.by_category.length}</div>
          </div>
        </div>
      )}

      <fieldset className="rounded border bg-white px-3 py-3">
        <legend className="px-1 text-xs font-semibold">5 Kalemlik Hızlı Maliyet Girişi</legend>
        <form onSubmit={saveQuick} className="space-y-2 text-sm">
          <label className="inline-block">
            <span className="text-[11px] text-baykus-muted">Kategori</span>
            <select className="bk-input mt-0.5" value={quickCat} onChange={(e) => setQuickCat(e.target.value)}>
              {(categories.length ? categories : ["Kupa", "Tişört", "Şapka", "Sweatshirt", "DTF", "UV DTF"]).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <div className="grid md:grid-cols-5 gap-2">
            {quick.map((row, i) => (
              <div key={i} className="space-y-1">
                <input
                  className="bk-input"
                  placeholder={`Kalem ${i + 1}`}
                  value={row.name}
                  onChange={(e) => {
                    const next = [...quick];
                    next[i] = { ...next[i], name: e.target.value };
                    setQuick(next);
                  }}
                />
                <input
                  className="bk-input"
                  type="number"
                  step="0.01"
                  placeholder="Tutar"
                  value={row.unit_cost}
                  onChange={(e) => {
                    const next = [...quick];
                    next[i] = { ...next[i], unit_cost: e.target.value };
                    setQuick(next);
                  }}
                />
              </div>
            ))}
          </div>
          <button type="submit" className="bk-btn text-white text-xs" style={{ background: "#c2410c" }}>
            Hızlı Kaydet
          </button>
        </form>
      </fieldset>

      <form onSubmit={submit} className="rounded border bg-white p-3 grid md:grid-cols-3 gap-2 text-sm">
        <label>
          Kategori
          <select
            required
            className="bk-input mt-0.5"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {(categories.length ? categories : ["Kupa"]).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
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
          Tutar
          <input
            required
            type="number"
            step="0.0001"
            className="bk-input mt-0.5"
            value={form.unit_cost}
            onChange={(e) => setForm({ ...form, unit_cost: e.target.value })}
          />
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

      <div className="bk-filter-bar">
        <select className="bk-input w-auto" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
          <option value="">Tüm kategoriler</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={load}>
          Yenile
        </button>
      </div>

      {summary && summary.by_category.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {summary.by_category.map((c) => (
            <button
              key={c.category}
              type="button"
              onClick={() => setFilterCat(c.category)}
              className="rounded border px-2 py-1 bg-white hover:bg-slate-50"
            >
              {c.category}: <strong className="tabular-nums">{formatMoney(c.total)}</strong>
            </button>
          ))}
        </div>
      )}

      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Kategori</th>
              <th>Maliyet Kalemi</th>
              <th>Birim</th>
              <th className="text-right">Tutar</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className={c.active ? undefined : "opacity-50"}>
                <td>{c.category}</td>
                <td>
                  {c.name}
                  {c.note && <div className="text-[10px] text-baykus-muted">{c.note}</div>}
                </td>
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
            {filtered.length === 0 && (
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
