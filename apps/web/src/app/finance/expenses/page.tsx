"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Expense, ExpenseCategory, apiFetch, formatMoney } from "@/lib/api";

const PERIODS = [
  { key: "30", label: "Son 30 Gün", days: 30 },
  { key: "92", label: "Son 3 Ay", days: 92 },
  { key: "184", label: "Son 6 Ay", days: 184 },
  { key: "year", label: "Bu Yıl", days: null },
  { key: "all", label: "Tümü", days: null },
] as const;

const STATUS_CHIPS = ["Tümü", "Ödenmiş", "Ödenecek", "Gecikmiş"] as const;

function periodFrom(key: string): string | "" {
  const today = new Date();
  if (key === "all") return "";
  if (key === "year") return `${today.getFullYear()}-01-01`;
  const p = PERIODS.find((x) => x.key === key);
  if (!p || p.days == null) return "";
  const d = new Date(today);
  d.setDate(d.getDate() - p.days);
  return d.toISOString().slice(0, 10);
}

export default function ExpensesPage() {
  const [items, setItems] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [period, setPeriod] = useState("92");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_CHIPS)[number]>("Tümü");
  const [q, setQ] = useState("");
  const [showCat, setShowCat] = useState(false);
  const [catName, setCatName] = useState("");
  const [form, setForm] = useState({
    category_id: "",
    amount: "",
    expense_date: new Date().toISOString().slice(0, 10),
    due_date: "",
    document_no: "",
    payment_method: "nakit",
    note: "",
    post_immediately: true,
  });

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      const from = periodFrom(period);
      if (from) params.set("date_from", from);
      if (statusFilter !== "Tümü") params.set("status_filter", statusFilter);
      if (q.trim()) params.set("q", q.trim());
      const [e, c] = await Promise.all([
        apiFetch<Expense[]>(`/api/finance/expenses?${params}`),
        apiFetch<ExpenseCategory[]>("/api/finance/expenses/categories"),
      ]);
      setItems(e);
      setCategories(c);
      setForm((f) => (!f.category_id && c.length ? { ...f, category_id: String(c[0].id) } : f));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yükleme hatası");
    }
  }, [period, statusFilter, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = useMemo(() => items.reduce((s, i) => s + Number(i.amount), 0), [items]);

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    try {
      await apiFetch("/api/finance/expenses/categories", {
        method: "POST",
        body: JSON.stringify({ name: catName }),
      });
      setCatName("");
      setMsg("Masraf kalemi eklendi");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kategori hatası");
    }
  }

  async function addExpense(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    try {
      await apiFetch("/api/finance/expenses", {
        method: "POST",
        body: JSON.stringify({
          category_id: Number(form.category_id),
          amount: Number(form.amount),
          expense_date: form.expense_date,
          due_date: form.due_date || null,
          document_no: form.document_no || null,
          payment_method: form.payment_method,
          note: form.note || null,
          post_immediately: form.post_immediately,
        }),
      });
      setForm((f) => ({ ...f, amount: "", note: "", document_no: "", due_date: "" }));
      setMsg("Masraf kaydedildi");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gider kaydı başarısız");
    }
  }

  async function postExpense(id: number) {
    try {
      await apiFetch(`/api/finance/expenses/${id}/post`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "İşleme hatası");
    }
  }

  async function removeExpense(id: number) {
    if (!confirm("Silinsin mi?")) return;
    try {
      await apiFetch(`/api/finance/expenses/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silme hatası");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Masraflar</h2>
          <p className="text-xs text-baykus-muted">Finans › Masraflar · kalem · vade · kasa/banka işleme</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/finance" className="bk-btn bk-btn-ghost text-xs">
            ← Finans
          </Link>
          <Link href="/reports/expenses" className="bk-btn bk-btn-ghost text-xs">
            Masraf raporu
          </Link>
          <button
            type="button"
            className="bk-btn text-xs text-white"
            style={{ background: "#198754" }}
            onClick={() => setShowCat((v) => !v)}
          >
            ✎ Masraf Kalemleri
          </button>
        </div>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{msg}</div>}

      {showCat && (
        <form onSubmit={addCategory} className="bk-card p-3 flex flex-wrap gap-2 text-sm">
          <input
            required
            className="bk-input max-w-xs"
            placeholder="Yeni kalem adı"
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
          />
          <button type="submit" className="bk-btn bk-btn-primary text-xs">
            Kalem ekle
          </button>
          <span className="text-xs text-baykus-muted self-center">
            {categories.length} kalem: {categories.map((c) => c.name).join(", ") || "—"}
          </span>
        </form>
      )}

      <form onSubmit={addExpense} className="bk-card p-3 grid md:grid-cols-4 gap-2 text-sm">
        <div className="md:col-span-4 font-semibold text-sm flex items-center gap-2">
          <span
            className="inline-flex rounded px-2 py-1 text-xs text-white"
            style={{ background: "#dc2626" }}
          >
            + Yeni Masraf Gir
          </span>
        </div>
        <select
          className="bk-input"
          value={form.category_id}
          onChange={(e) => setForm({ ...form, category_id: e.target.value })}
          required
        >
          <option value="">Masraf kalemi</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          required
          type="number"
          min="0.01"
          step="0.01"
          className="bk-input"
          placeholder="Tutar"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
        />
        <input
          type="date"
          className="bk-input"
          value={form.expense_date}
          onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
        />
        <input
          type="date"
          className="bk-input"
          value={form.due_date}
          onChange={(e) => setForm({ ...form, due_date: e.target.value })}
          title="Vade"
        />
        <input
          className="bk-input"
          placeholder="Belge No"
          value={form.document_no}
          onChange={(e) => setForm({ ...form, document_no: e.target.value })}
        />
        <select
          className="bk-input"
          value={form.payment_method}
          onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
        >
          <option value="nakit">Kasa (Nakit)</option>
          <option value="banka">Banka</option>
        </select>
        <input
          className="bk-input md:col-span-2"
          placeholder="Not"
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
        />
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={form.post_immediately}
            onChange={(e) => setForm({ ...form, post_immediately: e.target.checked })}
          />
          Hemen işle (kasa/banka)
        </label>
        <button type="submit" className="bk-btn bk-btn-primary text-xs">
          Kaydet
        </button>
      </form>

      <div className="bk-filter-bar">
        <select className="bk-input max-w-[140px]" value={period} onChange={(e) => setPeriod(e.target.value)}>
          {PERIODS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1">
          {STATUS_CHIPS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded px-2 py-1 text-[11px] font-medium border ${
                statusFilter === s ? "border-baykus-primary ring-1 ring-baykus-primary" : "border-slate-200"
              } ${
                s === "Gecikmiş"
                  ? "bg-red-50 text-red-800"
                  : s === "Ödenecek"
                    ? "bg-amber-50 text-amber-900"
                    : s === "Ödenmiş"
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-white"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <input
          className="bk-input max-w-[200px] ml-auto"
          placeholder="Ara…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="text-xs font-semibold text-slate-700">
        Listelenen: {items.length} masraf | Toplam: {formatMoney(total)}
      </div>

      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>İşlem Tarihi</th>
              <th>Belge No</th>
              <th>Vadesi</th>
              <th>Masraf</th>
              <th>Hesap</th>
              <th className="text-right">Tutar</th>
              <th>Ödeme</th>
              <th>Durumu</th>
              <th>Not</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => {
              const st = e.status_label || (e.is_posted ? "Ödenmiş" : "Ödenecek");
              return (
                <tr
                  key={e.id}
                  className={st === "Gecikmiş" ? "bg-red-50" : st === "Ödenecek" ? "bg-amber-50" : undefined}
                >
                  <td className="text-xs whitespace-nowrap">{e.expense_date}</td>
                  <td className="text-xs">{e.document_no || "—"}</td>
                  <td className="text-xs">{e.due_date || "—"}</td>
                  <td className="font-medium text-sm">{e.category_name || "—"}</td>
                  <td className="text-xs">{e.payment_method === "banka" ? "Banka" : "Kasa"}</td>
                  <td className="text-right tabular-nums font-semibold">{formatMoney(Number(e.amount))}</td>
                  <td className="text-xs">{e.payment_method}</td>
                  <td>
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        st === "Ödenmiş"
                          ? "bg-emerald-100 text-emerald-800"
                          : st === "Gecikmiş"
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {st}
                    </span>
                  </td>
                  <td className="text-xs text-baykus-muted max-w-[160px] truncate">{e.note || "—"}</td>
                  <td className="text-right text-xs whitespace-nowrap space-x-2">
                    {!e.is_posted && (
                      <>
                        <button
                          type="button"
                          className="text-emerald-700 font-semibold hover:underline"
                          onClick={() => postExpense(e.id)}
                        >
                          İşle
                        </button>
                        <button type="button" className="text-red-600 hover:underline" onClick={() => removeExpense(e.id)}>
                          Sil
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center text-baykus-muted py-8">
                  Masraf yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
