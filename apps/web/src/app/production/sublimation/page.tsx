"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Row = {
  id: number;
  product_name: string;
  size: string | null;
  minutes: number;
  duration_text: string | null;
  notes: string | null;
};

export default function SublimationTimesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [form, setForm] = useState({
    product_name: "",
    duration_text: "",
    minutes: "",
    notes: "",
  });
  const [editId, setEditId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      setRows(await apiFetch<Row[]>(`/api/production/sublimation?${params}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    const body = {
      product_name: form.product_name.trim(),
      size: null,
      minutes: Number(form.minutes) || 0,
      duration_text: form.duration_text.trim() || null,
      notes: form.notes.trim() || null,
    };
    if (!body.product_name) {
      setError("Ürün / çeşit adı girin");
      return;
    }
    if (!body.duration_text && !body.minutes) {
      setError("Baskı süresi girin");
      return;
    }
    try {
      if (editId) {
        await apiFetch(`/api/production/sublimation/${editId}`, { method: "PUT", body: JSON.stringify(body) });
        setMsg("Süre güncellendi");
      } else {
        await apiFetch("/api/production/sublimation", { method: "POST", body: JSON.stringify(body) });
        setMsg("Süre eklendi");
      }
      setForm({ product_name: "", duration_text: "", minutes: "", notes: "" });
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

  function clearForm() {
    setForm({ product_name: "", duration_text: "", minutes: "", notes: "" });
    setEditId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Sublimasyon Baskı Süreleri</h2>
          <p className="text-xs text-baykus-muted">Üretim / Atölye › Ürün · Baskı Süresi · Diğer Talimatlar</p>
        </div>
        <Link href="/production" className="bk-btn bk-btn-ghost text-xs">
          Atölyeye Dön
        </Link>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{msg}</div>}

      <fieldset className="rounded border bg-white px-3 py-3">
        <legend className="px-1 text-xs font-semibold">Ürün / Talimat Ekle veya Güncelle</legend>
        <form onSubmit={onSubmit} className="grid md:grid-cols-2 gap-3 text-sm">
          <label>
            <span className="text-[11px] text-baykus-muted">Ürün / Çeşit *</span>
            <input
              className="bk-input mt-0.5"
              required
              value={form.product_name}
              onChange={(e) => setForm({ ...form, product_name: e.target.value })}
              placeholder="Örn. Polyester kupa / A4 transfer"
            />
          </label>
          <label>
            <span className="text-[11px] text-baykus-muted">Baskı Süresi *</span>
            <input
              className="bk-input mt-0.5"
              value={form.duration_text}
              onChange={(e) => setForm({ ...form, duration_text: e.target.value })}
              placeholder="Örn. 45 sn / 180°C"
            />
          </label>
          <label className="md:col-span-2">
            <span className="text-[11px] text-baykus-muted">Diğer Talimatlar</span>
            <textarea
              className="bk-input mt-0.5"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Basınç, soğutma, film tipi…"
            />
          </label>
          <label>
            <span className="text-[11px] text-baykus-muted">Dakika (opsiyonel sayı)</span>
            <input
              className="bk-input mt-0.5"
              type="number"
              min={0}
              step="0.5"
              value={form.minutes}
              onChange={(e) => setForm({ ...form, minutes: e.target.value })}
            />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="bk-btn text-white text-xs" style={{ background: "#198754" }}>
              {editId ? "Kaydet / Güncelle" : "Kaydet / Güncelle"}
            </button>
            <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={clearForm}>
              Temizle
            </button>
          </div>
        </form>
      </fieldset>

      <div className="bk-filter-bar">
        <input
          className="bk-input max-w-xs"
          placeholder="Liste ara…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={load}>
          Ara
        </button>
        <span className="text-xs text-baykus-muted ml-auto">{rows.length} kayıt</span>
      </div>

      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Ürün</th>
              <th>Baskı Süresi</th>
              <th>Diğer Talimatlar</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={editId === r.id ? "bg-sky-50" : undefined}
                onClick={() => {
                  setEditId(r.id);
                  setForm({
                    product_name: r.product_name,
                    duration_text: r.duration_text || (r.minutes ? `${r.minutes} dk` : ""),
                    minutes: r.minutes ? String(r.minutes) : "",
                    notes: r.notes || "",
                  });
                }}
              >
                <td className="font-medium">{r.product_name}</td>
                <td>{r.duration_text || (r.minutes ? `${r.minutes} dk` : "—")}</td>
                <td className="text-baykus-muted text-xs max-w-md">
                  {(r.notes || "—").replace(/\n/g, " / ")}
                </td>
                <td className="text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="text-baykus-primary text-xs hover:underline"
                    onClick={() => {
                      setEditId(r.id);
                      setForm({
                        product_name: r.product_name,
                        duration_text: r.duration_text || (r.minutes ? `${r.minutes} dk` : ""),
                        minutes: r.minutes ? String(r.minutes) : "",
                        notes: r.notes || "",
                      });
                    }}
                  >
                    Düzenle
                  </button>
                  <button type="button" className="text-red-600 text-xs hover:underline" onClick={() => remove(r.id)}>
                    Sil
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-baykus-muted py-8">
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
