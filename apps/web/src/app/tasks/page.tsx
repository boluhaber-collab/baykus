"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Task = {
  id: number;
  due_date: string;
  due_time: string | null;
  task_type: string;
  title: string;
  customer_name: string | null;
  phone: string | null;
  order_number: string | null;
  status: string;
  priority: string;
  note: string | null;
  completed_at: string | null;
};

const EMPTY = {
  due_date: new Date().toISOString().slice(0, 10),
  due_time: "",
  task_type: "Müşteri aranacak",
  title: "",
  customer_name: "",
  phone: "",
  order_number: "",
  priority: "Normal",
  note: "",
};

export default function TasksPage() {
  const [items, setItems] = useState<Task[]>([]);
  const [meta, setMeta] = useState<{ types: string[]; priorities: string[] }>({
    types: [
      "Müşteri aranacak",
      "Teklif takip edilecek",
      "Ödeme hatırlatılacak",
      "Ürün tedarik edilecek",
      "Tasarım onayı beklenecek",
      "Diğer",
    ],
    priorities: ["Normal", "Yüksek", "Düşük"],
  });
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"open" | "today" | "all" | "done">("open");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams({ filter });
      if (q.trim()) params.set("q", q.trim());
      setItems(await apiFetch<Task[]>(`/api/tasks?${params}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [filter, q]);

  useEffect(() => {
    void apiFetch<{ types: string[]; priorities: string[] }>("/api/tasks/meta")
      .then(setMeta)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function clearForm() {
    setForm(EMPTY);
    setEditId(null);
  }

  function fill(t: Task) {
    setEditId(t.id);
    setForm({
      due_date: t.due_date?.slice(0, 10) || EMPTY.due_date,
      due_time: t.due_time || "",
      task_type: t.task_type || "Diğer",
      title: t.title || "",
      customer_name: t.customer_name || "",
      phone: t.phone || "",
      order_number: t.order_number || "",
      priority: t.priority || "Normal",
      note: t.note || "",
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    if (!form.title.trim()) {
      setError("Başlık boş olamaz");
      return;
    }
    const body = {
      due_date: form.due_date,
      due_time: form.due_time.trim() || null,
      task_type: form.task_type,
      title: form.title.trim(),
      customer_name: form.customer_name.trim() || null,
      phone: form.phone.trim() || null,
      order_number: form.order_number.trim() || null,
      priority: form.priority,
      note: form.note.trim() || null,
    };
    try {
      if (editId) {
        await apiFetch(`/api/tasks/${editId}`, { method: "PUT", body: JSON.stringify(body) });
        setMsg("Görev güncellendi");
      } else {
        await apiFetch("/api/tasks", { method: "POST", body: JSON.stringify(body) });
        setMsg("Görev eklendi");
      }
      clearForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    }
  }

  async function setStatus(id: number, status: string) {
    await apiFetch(`/api/tasks/${id}`, { method: "PUT", body: JSON.stringify({ status }) });
    await load();
  }

  async function remove(id: number) {
    if (!confirm("Seçili görev silinsin mi?")) return;
    await apiFetch(`/api/tasks/${id}`, { method: "DELETE" });
    if (editId === id) clearForm();
    await load();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs text-baykus-muted mb-1">
            <Link href="/dashboard" className="text-baykus-primary hover:underline">
              Operasyon
            </Link>
            <span className="mx-1">/</span>
            <span className="font-medium text-baykus-text">Görevler</span>
          </div>
          <h1 className="text-xl font-bold">Görev / Hatırlatma Sistemi</h1>
          <p className="text-sm text-baykus-muted">Açık görevler · bugün · tamamlananlar</p>
        </div>
        <Link href="/dashboard" className="bk-btn bk-btn-ghost text-sm">
          Ana Sayfa
        </Link>
      </div>

      {error && <div className="mb-3 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}
      {msg && <div className="mb-3 rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm">{msg}</div>}

      <form onSubmit={onSubmit} className="bk-card p-4 mb-4 space-y-3">
        <div className="text-sm font-semibold text-baykus-text">Görev Ekle / Güncelle</div>
        <div className="grid md:grid-cols-4 gap-3">
          <label className="text-xs">
            Tarih
            <input
              type="date"
              className="bk-input w-full mt-1"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              required
            />
          </label>
          <label className="text-xs">
            Saat
            <input
              className="bk-input w-full mt-1"
              placeholder="14:30"
              value={form.due_time}
              onChange={(e) => setForm({ ...form, due_time: e.target.value })}
            />
          </label>
          <label className="text-xs">
            Tür
            <select
              className="bk-input w-full mt-1"
              value={form.task_type}
              onChange={(e) => setForm({ ...form, task_type: e.target.value })}
            >
              {meta.types.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            Öncelik
            <select
              className="bk-input w-full mt-1"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              {meta.priorities.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="text-xs md:col-span-2">
            Başlık
            <input
              className="bk-input w-full mt-1"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </label>
          <label className="text-xs">
            Müşteri
            <input
              className="bk-input w-full mt-1"
              value={form.customer_name}
              onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
            />
          </label>
          <label className="text-xs">
            Telefon
            <input
              className="bk-input w-full mt-1"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <label className="text-xs">
            Sipariş No
            <input
              className="bk-input w-full mt-1"
              value={form.order_number}
              onChange={(e) => setForm({ ...form, order_number: e.target.value })}
            />
          </label>
          <label className="text-xs md:col-span-3">
            Not
            <input
              className="bk-input w-full mt-1"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="bk-btn text-white text-sm" style={{ backgroundColor: "#198754" }}>
            {editId ? "Güncelle" : "Kaydet"}
          </button>
          <button type="button" onClick={clearForm} className="bk-btn bk-btn-ghost text-sm">
            Temizle
          </button>
        </div>
      </form>

      <div className="bk-filter-bar mb-3">
        <input
          className="bk-input max-w-[220px]"
          placeholder="Ara…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="bk-input max-w-[180px]"
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
        >
          <option value="open">Açık Görevler</option>
          <option value="today">Bugünkü Görevler</option>
          <option value="all">Tümü</option>
          <option value="done">Tamamlananlar</option>
        </select>
        <button type="button" onClick={load} className="bk-btn bk-btn-primary text-sm">
          Yenile
        </button>
      </div>

      <div className="bk-table-wrap bk-card">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Saat</th>
              <th>Tür</th>
              <th>Başlık</th>
              <th>Müşteri</th>
              <th>Durum</th>
              <th>Öncelik</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr
                key={t.id}
                className={
                  t.status === "Tamamlandı"
                    ? "bg-emerald-50/50"
                    : t.priority === "Yüksek"
                      ? "bg-red-50/60"
                      : undefined
                }
                onClick={() => fill(t)}
              >
                <td className="whitespace-nowrap">{t.due_date}</td>
                <td>{t.due_time || "—"}</td>
                <td className="text-xs">{t.task_type}</td>
                <td className="font-medium">{t.title}</td>
                <td>
                  {t.customer_name || "—"}
                  {t.phone ? <span className="block text-xs text-baykus-muted">{t.phone}</span> : null}
                </td>
                <td>{t.status}</td>
                <td>{t.priority}</td>
                <td className="text-right whitespace-nowrap space-x-2" onClick={(e) => e.stopPropagation()}>
                  {t.status !== "Tamamlandı" ? (
                    <button
                      type="button"
                      className="text-teal-700 hover:underline text-xs"
                      onClick={() => setStatus(t.id, "Tamamlandı")}
                    >
                      Tamamlandı
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="text-slate-600 hover:underline text-xs"
                      onClick={() => setStatus(t.id, "Açık")}
                    >
                      Açık Yap
                    </button>
                  )}
                  <button type="button" className="text-red-600 hover:underline text-xs" onClick={() => remove(t.id)}>
                    Sil
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-baykus-muted py-8">
                  Görev yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
