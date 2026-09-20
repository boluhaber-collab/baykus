"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Expense, ExpenseCategory, apiFetch, formatMoney } from "@/lib/api";

export default function ExpensesPage() {
  const [items, setItems] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [catName, setCatName] = useState("");
  const [form, setForm] = useState({
    category_id: "",
    amount: "",
    expense_date: new Date().toISOString().slice(0, 10),
    payment_method: "nakit",
    note: "",
    post_immediately: true,
  });

  const load = useCallback(async () => {
    setError("");
    try {
      const [e, c] = await Promise.all([
        apiFetch<Expense[]>("/api/finance/expenses"),
        apiFetch<ExpenseCategory[]>("/api/finance/expenses/categories"),
      ]);
      setItems(e);
      setCategories(c);
      if (!form.category_id && c.length) {
        setForm((f) => ({ ...f, category_id: String(c[0].id) }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yükleme hatası");
    }
  }, [form.category_id]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    try {
      await apiFetch("/api/finance/expenses/categories", {
        method: "POST",
        body: JSON.stringify({ name: catName }),
      });
      setCatName("");
      setMsg("Kategori eklendi");
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
          payment_method: form.payment_method,
          note: form.note || null,
          post_immediately: form.post_immediately,
        }),
      });
      setForm((f) => ({ ...f, amount: "", note: "" }));
      setMsg("Gider kaydedildi");
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

  const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

  return (
    <div>
      <div className="mb-6">
        <Link href="/finance" className="text-sm text-baykus-600 hover:underline">
          ← Finans
        </Link>
        <h1 className="text-2xl font-bold mt-2">Giderler</h1>
        <p className="text-slate-500 text-sm">Kategori · kayıt · kasa/banka işleme</p>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}
      {msg && <div className="mb-4 rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm">{msg}</div>}

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <form onSubmit={addExpense} className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
          <h2 className="font-semibold">Yeni gider</h2>
          <select
            className={inputCls}
            value={form.category_id}
            onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            required
          >
            <option value="">Kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            className={inputCls}
            type="number"
            min={0.01}
            step="0.01"
            placeholder="Tutar"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            required
          />
          <input
            className={inputCls}
            type="date"
            value={form.expense_date}
            onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
            required
          />
          <select
            className={inputCls}
            value={form.payment_method}
            onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
          >
            <option value="nakit">Nakit (Kasa)</option>
            <option value="banka">Banka</option>
          </select>
          <input
            className={inputCls}
            placeholder="Not"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.post_immediately}
              onChange={(e) => setForm({ ...form, post_immediately: e.target.checked })}
            />
            Hemen kasa/bankaya işle
          </label>
          <button type="submit" className="rounded-lg bg-baykus-600 text-white px-4 py-2 text-sm">
            Kaydet
          </button>
        </form>

        <form onSubmit={addCategory} className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
          <h2 className="font-semibold">Gider kategorisi</h2>
          <input
            className={inputCls}
            placeholder="Kategori adı"
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
            required
          />
          <button type="submit" className="rounded-lg border px-4 py-2 text-sm">
            Kategori Ekle
          </button>
          <ul className="text-sm text-slate-600 space-y-1">
            {categories.map((c) => (
              <li key={c.id}>• {c.name}</li>
            ))}
          </ul>
        </form>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3">Tarih</th>
              <th className="px-4 py-3">Kategori</th>
              <th className="px-4 py-3">Tutar</th>
              <th className="px-4 py-3">Ödeme</th>
              <th className="px-4 py-3">Durum</th>
              <th className="px-4 py-3">Not</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  Gider kaydı yok
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-4 py-3">{row.expense_date}</td>
                  <td className="px-4 py-3">{row.category_name || "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{formatMoney(Number(row.amount))}</td>
                  <td className="px-4 py-3">{row.payment_method}</td>
                  <td className="px-4 py-3">
                    {row.is_posted ? (
                      <span className="text-emerald-700">İşlendi</span>
                    ) : (
                      <span className="text-amber-700">Bekliyor</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{row.note || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {!row.is_posted && (
                      <button
                        type="button"
                        className="text-baykus-600 hover:underline"
                        onClick={() => void postExpense(row.id)}
                      >
                        İşle
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
