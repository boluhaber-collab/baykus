"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Loan, apiFetch, formatMoney } from "@/lib/api";

export default function LoansPage() {
  const [items, setItems] = useState<Loan[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({
    title: "",
    lender: "",
    principal_amount: "",
    interest_rate: "",
    start_date: new Date().toISOString().slice(0, 10),
    installment_count: "6",
    notes: "",
  });

  const load = useCallback(async () => {
    setError("");
    try {
      const qs = status ? `?status=${encodeURIComponent(status)}` : "";
      setItems(await apiFetch<Loan[]>(`/api/loans${qs}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createLoan(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const created = await apiFetch<Loan>("/api/loans", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          lender: form.lender || null,
          principal_amount: Number(form.principal_amount),
          interest_rate: form.interest_rate ? Number(form.interest_rate) : null,
          start_date: form.start_date,
          installment_count: Number(form.installment_count) || 1,
          notes: form.notes || null,
        }),
      });
      window.location.href = `/finance/loans/${created.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Oluşturma hatası");
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Kredi / Taksit</h1>
          <p className="text-sm text-slate-500">Finans — taksit ödeme ve kasa/banka kaydı</p>
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">Tüm durumlar</option>
          <option value="aktif">aktif</option>
          <option value="kapandı">kapandı</option>
          <option value="iptal">iptal</option>
        </select>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}

      <form onSubmit={createLoan} className="mb-6 rounded-xl border bg-white p-4 shadow-sm grid md:grid-cols-3 gap-3">
        <label className="text-sm md:col-span-2">
          <span className="text-slate-500">Başlık</span>
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-500">Kredi veren</span>
          <input
            value={form.lender}
            onChange={(e) => setForm({ ...form, lender: e.target.value })}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-500">Anapara</span>
          <input
            required
            type="number"
            step="0.01"
            value={form.principal_amount}
            onChange={(e) => setForm({ ...form, principal_amount: e.target.value })}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-500">Faiz % (opsiyonel)</span>
          <input
            type="number"
            step="0.01"
            value={form.interest_rate}
            onChange={(e) => setForm({ ...form, interest_rate: e.target.value })}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-500">Başlangıç</span>
          <input
            type="date"
            required
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-500">Taksit sayısı</span>
          <input
            type="number"
            min={1}
            max={120}
            value={form.installment_count}
            onChange={(e) => setForm({ ...form, installment_count: e.target.value })}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <div className="md:col-span-3">
          <button type="submit" className="rounded-lg bg-baykus-600 text-white px-4 py-2 text-sm">
            Yeni kredi oluştur
          </button>
        </div>
      </form>

      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3">Başlık</th>
              <th className="px-4 py-3">Kredi veren</th>
              <th className="px-4 py-3">Anapara</th>
              <th className="px-4 py-3">Ödenen</th>
              <th className="px-4 py-3">Kalan</th>
              <th className="px-4 py-3">Taksit</th>
              <th className="px-4 py-3">Durum</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((l) => (
              <tr key={l.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">
                  <Link href={`/finance/loans/${l.id}`} className="text-baykus-700 hover:underline">
                    {l.title}
                  </Link>
                </td>
                <td className="px-4 py-3">{l.lender || "—"}</td>
                <td className="px-4 py-3">{formatMoney(Number(l.principal_amount))}</td>
                <td className="px-4 py-3">{formatMoney(Number(l.paid_amount))}</td>
                <td className="px-4 py-3">{formatMoney(Number(l.remaining_amount))}</td>
                <td className="px-4 py-3">
                  {l.paid_count}/{l.installment_count}
                </td>
                <td className="px-4 py-3">{l.status}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/finance/loans/${l.id}`} className="text-baykus-600 hover:underline">
                    Aç
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  Kredi yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
