"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Row = {
  id: number;
  product_name: string;
  size: string | null;
  minutes: number;
  notes: string | null;
};

export default function SublimationTimesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ product_name: "", size: "", minutes: "10", notes: "" });
  const [editId, setEditId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      setRows(await apiFetch<Row[]>("/api/production/sublimation"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    const body = {
      product_name: form.product_name.trim(),
      size: form.size.trim() || null,
      minutes: Number(form.minutes) || 0,
      notes: form.notes.trim() || null,
    };
    try {
      if (editId) {
        await apiFetch(`/api/production/sublimation/${editId}`, { method: "PUT", body: JSON.stringify(body) });
        setMsg("Süre güncellendi");
      } else {
        await apiFetch("/api/production/sublimation", { method: "POST", body: JSON.stringify(body) });
        setMsg("Süre eklendi");
      }
      setForm({ product_name: "", size: "", minutes: "10", notes: "" });
      setEditId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    }
  }

  async function remove(id: number) {
    if (!confirm("Silinsin mi?")) return;
    await apiFetch(`/api/production/sublimation/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold">Sublimasyon Baskı Süreleri</h2>
        <p className="text-xs text-baykus-muted">Ürün / beden bazlı baskı süreleri (dakika) · masaüstü paneli</p>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{msg}</div>}

      <form onSubmit={onSubmit} className="bk-card p-3 grid md:grid-cols-5 gap-2 text-sm">
        <input className="bk-input" placeholder="Ürün adı" required value={form.product_name}
          onChange={(e) => setForm({ ...form, product_name: e.target.value })} />
        <input className="bk-input" placeholder="Beden (S/M/L…)" value={form.size}
          onChange={(e) => setForm({ ...form, size: e.target.value })} />
        <input className="bk-input" type="number" min={0} step="0.5" placeholder="Dakika" value={form.minutes}
          onChange={(e) => setForm({ ...form, minutes: e.target.value })} />
        <input className="bk-input" placeholder="Not" value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <button type="submit" className="bk-btn bk-btn-primary">{editId ? "Güncelle" : "Ekle"}</button>
      </form>

      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Ürün</th><th>Beden</th><th>Süre (dk)</th><th>Not</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="font-medium">{r.product_name}</td>
                <td>{r.size || "—"}</td>
                <td className="tabular-nums">{r.minutes}</td>
                <td className="text-baykus-muted text-xs">{r.notes || "—"}</td>
                <td className="text-right space-x-2">
                  <button type="button" className="text-baykus-primary text-xs hover:underline"
                    onClick={() => {
                      setEditId(r.id);
                      setForm({
                        product_name: r.product_name,
                        size: r.size || "",
                        minutes: String(r.minutes),
                        notes: r.notes || "",
                      });
                    }}>Düzenle</button>
                  <button type="button" className="text-red-600 text-xs hover:underline" onClick={() => remove(r.id)}>Sil</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="text-center text-baykus-muted py-8">Kayıt yok</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
