"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Asset, apiFetch, formatMoney, getApiBase, getToken } from "@/lib/api";

const STATUSES = ["Aktif", "Bakımda", "Arızalı", "Satıldı", "Hurda"] as const;

const emptyForm = {
  name: "",
  category: "",
  serial_no: "",
  purchase_date: "",
  cost: "",
  current_value: "",
  status: "Aktif",
  maintenance_date: "",
  depreciation_method: "none",
  useful_life_months: "",
  note: "",
  active: true,
};

export default function AssetsPage() {
  const [items, setItems] = useState<Asset[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("Tümü");

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (statusFilter && statusFilter !== "Tümü") params.set("status", statusFilter);
      const qs = params.toString();
      setItems(await apiFetch<Asset[]>(`/api/finance/assets${qs ? `?${qs}` : ""}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [q, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    let value = 0;
    let soon = 0;
    for (const a of items) {
      value += Number(a.current_value ?? a.cost ?? 0);
      if (a.maintenance_due_soon) soon += 1;
    }
    return { count: items.length, value, soon };
  }, [items]);

  function startEdit(a: Asset) {
    setEditId(a.id);
    setForm({
      name: a.name,
      category: a.category || "",
      serial_no: a.serial_no || "",
      purchase_date: a.purchase_date || "",
      cost: String(a.cost ?? ""),
      current_value: a.current_value != null ? String(a.current_value) : "",
      status: a.status || "Aktif",
      maintenance_date: a.maintenance_date || "",
      depreciation_method: a.depreciation_method || "none",
      useful_life_months: a.useful_life_months != null ? String(a.useful_life_months) : "",
      note: a.note || "",
      active: a.active,
    });
  }

  function clearForm() {
    setEditId(null);
    setForm(emptyForm);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const body = {
      name: form.name.trim(),
      category: form.category || null,
      serial_no: form.serial_no || null,
      purchase_date: form.purchase_date || null,
      cost: Number(form.cost) || 0,
      current_value: form.current_value !== "" ? Number(form.current_value) : Number(form.cost) || 0,
      status: form.status,
      maintenance_date: form.maintenance_date || null,
      depreciation_method: form.depreciation_method,
      useful_life_months: form.useful_life_months ? Number(form.useful_life_months) : null,
      note: form.note || null,
      active: form.status === "Satıldı" || form.status === "Hurda" ? false : form.active,
    };
    try {
      if (editId) {
        await apiFetch(`/api/finance/assets/${editId}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiFetch("/api/finance/assets", { method: "POST", body: JSON.stringify(body) });
      }
      clearForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    }
  }

  async function remove(id: number) {
    if (!confirm("Seçili demirbaş silinsin mi?")) return;
    try {
      await apiFetch(`/api/finance/assets/${id}`, { method: "DELETE" });
      if (editId === id) clearForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silme hatası");
    }
  }

  async function downloadPdf() {
    try {
      const res = await fetch(`${getApiBase()}/api/finance/assets/report/pdf`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error(`PDF ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "demirbas_raporu.pdf";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF hatası");
    }
  }

  function rowClass(a: Asset) {
    if (a.status === "Satıldı" || a.status === "Hurda") return "bg-slate-100";
    if (a.status === "Arızalı") return "bg-red-50";
    if (a.maintenance_due_soon) return "bg-amber-50";
    return "";
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Demirbaşlar</h2>
          <p className="text-xs text-baykus-muted">Finans › Demirbaşlar · CRUD + rapor</p>
        </div>
        <button type="button" className="bk-btn text-xs text-white" style={{ background: "#d39e00" }} onClick={downloadPdf}>
          PDF Rapor
        </button>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="flex flex-wrap gap-4 text-sm">
        <span className="font-semibold">Toplam Demirbaş: {summary.count}</span>
        <span className="font-semibold text-teal-800">Güncel Değer: {formatMoney(summary.value)}</span>
        <span className="font-semibold text-red-700">Yaklaşan Bakım: {summary.soon}</span>
      </div>

      <form onSubmit={submit} className="bk-card p-3 grid md:grid-cols-4 gap-2 text-sm">
        <div className="md:col-span-4 text-xs font-semibold text-baykus-muted">Demirbaş Ekle / Güncelle</div>
        <label>
          Demirbaş Adı *
          <input required className="bk-input mt-0.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          Kategori
          <input className="bk-input mt-0.5" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        </label>
        <label>
          Seri No
          <input className="bk-input mt-0.5" value={form.serial_no} onChange={(e) => setForm({ ...form, serial_no: e.target.value })} />
        </label>
        <label>
          Alış Tarihi
          <input type="date" className="bk-input mt-0.5" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} />
        </label>
        <label>
          Alış Tutarı
          <input required type="number" step="0.01" className="bk-input mt-0.5" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
        </label>
        <label>
          Güncel Değer
          <input type="number" step="0.01" className="bk-input mt-0.5" value={form.current_value} onChange={(e) => setForm({ ...form, current_value: e.target.value })} />
        </label>
        <label>
          Bakım Tarihi
          <input type="date" className="bk-input mt-0.5" value={form.maintenance_date} onChange={(e) => setForm({ ...form, maintenance_date: e.target.value })} />
        </label>
        <label>
          Durum
          <select className="bk-input mt-0.5" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="md:col-span-2">
          Not
          <input className="bk-input mt-0.5" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </label>
        <label>
          Amortisman
          <select className="bk-input mt-0.5" value={form.depreciation_method} onChange={(e) => setForm({ ...form, depreciation_method: e.target.value })}>
            <option value="none">Yok</option>
            <option value="straight_line">Düz çizgi</option>
          </select>
        </label>
        <label>
          Ömür (ay)
          <input type="number" className="bk-input mt-0.5" value={form.useful_life_months} onChange={(e) => setForm({ ...form, useful_life_months: e.target.value })} />
        </label>
        <div className="md:col-span-4 flex flex-wrap gap-2">
          <button type="submit" className="bk-btn bk-btn-primary text-xs">
            Kaydet / Güncelle
          </button>
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={clearForm}>
            Temizle
          </button>
          {editId && (
            <button type="button" className="bk-btn text-xs text-white bg-red-600" onClick={() => remove(editId)}>
              Sil
            </button>
          )}
        </div>
      </form>

      <div className="bk-filter-bar">
        <input className="bk-input max-w-[220px]" placeholder="Ara…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="bk-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option>Tümü</option>
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={load}>
          Yenile
        </button>
      </div>

      <div className="bk-table-wrap">
        <table className="bk-table text-sm">
          <thead>
            <tr>
              <th>Demirbaş Adı</th>
              <th>Kategori</th>
              <th>Seri No</th>
              <th>Alış Tarihi</th>
              <th className="text-right">Alış Tutarı</th>
              <th className="text-right">Güncel Değer</th>
              <th>Durum</th>
              <th>Bakım</th>
              <th>Not</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id} className={rowClass(a)}>
                <td className="font-medium">{a.name}</td>
                <td>{a.category || "—"}</td>
                <td className="font-mono text-xs">{a.serial_no || "—"}</td>
                <td>{a.purchase_date || "—"}</td>
                <td className="text-right tabular-nums">{formatMoney(Number(a.cost))}</td>
                <td className="text-right tabular-nums">{formatMoney(Number(a.current_value ?? a.cost))}</td>
                <td>{a.status || "—"}</td>
                <td>{a.maintenance_date || "—"}</td>
                <td className="text-xs max-w-[140px] truncate">{a.note || ""}</td>
                <td className="text-right whitespace-nowrap">
                  <button type="button" className="text-baykus-primary hover:underline text-xs mr-2" onClick={() => startEdit(a)}>
                    Düzenle
                  </button>
                  <button type="button" className="text-red-600 hover:underline text-xs" onClick={() => remove(a.id)}>
                    Sil
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center text-baykus-muted py-8">
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
