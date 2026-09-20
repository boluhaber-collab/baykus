"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { BankAccount, apiFetch, formatMoney } from "@/lib/api";

export default function BanksPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [iban, setIban] = useState("");
  const [opening, setOpening] = useState("0");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await apiFetch<BankAccount[]>("/api/finance/banks");
      setAccounts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/finance/banks", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          iban: iban.trim() || null,
          currency: "TRY",
          opening_balance: Number(opening || 0),
          is_active: true,
          notes: notes.trim() || null,
        }),
      });
      setName("");
      setIban("");
      setOpening("0");
      setNotes("");
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    } finally {
      setBusy(false);
    }
  }

  const total = accounts.reduce((s, a) => s + Number(a.balance), 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Banka Hesapları</h1>
          <p className="text-slate-500 text-sm">Hesap listesi · bakiye · hareketler</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/finance"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Finans özeti
          </Link>
          <Link
            href="/finance/cash"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Kasa
          </Link>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-baykus-600 text-white px-4 py-2 text-sm font-medium"
          >
            {showForm ? "Formu kapat" : "+ Yeni hesap"}
          </button>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-5 py-4 inline-block">
        <div className="text-xs text-sky-800">Toplam banka bakiyesi</div>
        <div className="text-xl font-bold text-sky-900 tabular-nums">{formatMoney(total)}</div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}

      {showForm && (
        <form
          onSubmit={onCreate}
          className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div>
            <label className="block text-xs text-slate-500 mb-1">Hesap adı *</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Ziraat İşletme"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">IBAN</label>
            <input
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="TR…"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Açılış bakiyesi</label>
            <input
              type="number"
              step="0.01"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Not</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-baykus-600 text-white px-5 py-2 text-sm font-medium disabled:opacity-50"
            >
              {busy ? "Kaydediliyor…" : "Hesabı kaydet"}
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3">Hesap</th>
              <th className="px-4 py-3">IBAN</th>
              <th className="px-4 py-3">Para birimi</th>
              <th className="px-4 py-3">Durum</th>
              <th className="px-4 py-3 text-right">Açılış</th>
              <th className="px-4 py-3 text-right">Bakiye</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Hesap yok
                </td>
              </tr>
            )}
            {accounts.map((a) => (
              <tr key={a.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">
                  <Link href={`/finance/banks/${a.id}`} className="text-baykus-700 hover:underline">
                    {a.name}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{a.iban || "—"}</td>
                <td className="px-4 py-3">{a.currency}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      a.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {a.is_active ? "Aktif" : "Pasif"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatMoney(Number(a.opening_balance))}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">
                  {formatMoney(Number(a.balance))}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/finance/banks/${a.id}`}
                    className="text-baykus-600 hover:underline text-sm"
                  >
                    Detay
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
