"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  BANK_TYPE_LABELS,
  BankAccount,
  BankMovement,
  apiFetch,
  formatMoney,
} from "@/lib/api";

const BANK_TYPES = [
  { value: "deposit", label: "Yatırma / Havale giriş" },
  { value: "withdrawal", label: "Çekim" },
  { value: "fee", label: "Masraf" },
];

export default function BankDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const [account, setAccount] = useState<BankAccount | null>(null);
  const [movements, setMovements] = useState<BankMovement[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [formType, setFormType] = useState("deposit");
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formCategory, setFormCategory] = useState("");
  const [formNote, setFormNote] = useState("");

  // Transfer form
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferToCash, setTransferToCash] = useState(true);
  const [transferToBankId, setTransferToBankId] = useState("");
  const [allBanks, setAllBanks] = useState<BankAccount[]>([]);
  const [transferNote, setTransferNote] = useState("");

  const load = useCallback(async () => {
    if (!Number.isFinite(id)) return;
    setError("");
    try {
      const [acc, movs, banks] = await Promise.all([
        apiFetch<BankAccount>(`/api/finance/banks/${id}`),
        apiFetch<BankMovement[]>(`/api/finance/banks/${id}/movements`),
        apiFetch<BankAccount[]>("/api/finance/banks?active=true"),
      ]);
      setAccount(acc);
      setMovements(movs);
      setAllBanks(banks.filter((b) => b.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/finance/banks/${id}/movements`, {
        method: "POST",
        body: JSON.stringify({
          movement_type: formType,
          amount: Number(formAmount),
          movement_date: formDate || null,
          category: formCategory.trim() || null,
          note: formNote.trim() || null,
        }),
      });
      setFormAmount("");
      setFormCategory("");
      setFormNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    } finally {
      setBusy(false);
    }
  }

  async function onTransfer(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/finance/transfers", {
        method: "POST",
        body: JSON.stringify({
          amount: Number(transferAmount),
          from_cash: false,
          from_bank_account_id: id,
          to_cash: transferToCash,
          to_bank_account_id: transferToCash ? null : Number(transferToBankId),
          note: transferNote.trim() || "Transfer",
        }),
      });
      setTransferAmount("");
      setTransferNote("");
      setShowTransfer(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer hatası");
    } finally {
      setBusy(false);
    }
  }

  if (!Number.isFinite(id)) {
    return <p className="text-red-600">Geçersiz hesap</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <div className="text-sm text-slate-500 mb-1">
            <Link href="/finance/banks" className="hover:underline">
              Banka
            </Link>{" "}
            / Detay
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{account?.name || "…"}</h1>
          {account?.iban && (
            <p className="text-slate-500 text-sm font-mono mt-0.5">{account.iban}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowTransfer((v) => !v)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Transfer
          </button>
          <Link
            href="/finance/cash"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Kasa
          </Link>
        </div>
      </div>

      {account && (
        <div className="mb-6 rounded-xl border border-sky-200 bg-sky-50 px-5 py-4 flex flex-wrap gap-8">
          <div>
            <div className="text-xs text-sky-800">Güncel bakiye</div>
            <div className="text-2xl font-bold text-sky-900 tabular-nums">
              {formatMoney(Number(account.balance))}
            </div>
          </div>
          <div>
            <div className="text-xs text-sky-800">Açılış bakiyesi</div>
            <div className="text-lg font-semibold text-sky-900 tabular-nums">
              {formatMoney(Number(account.opening_balance))}
            </div>
          </div>
          <div>
            <div className="text-xs text-sky-800">Para birimi</div>
            <div className="text-lg font-semibold text-sky-900">{account.currency}</div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}

      {showTransfer && (
        <form
          onSubmit={onTransfer}
          className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="sm:col-span-2 lg:col-span-4 font-semibold text-amber-900">
            Bu hesaptan transfer
          </div>
          <div>
            <label className="block text-xs text-amber-800 mb-1">Tutar *</label>
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
              className="w-full rounded-lg border border-amber-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-amber-800 mb-1">Hedef</label>
            <select
              value={transferToCash ? "cash" : transferToBankId}
              onChange={(e) => {
                if (e.target.value === "cash") {
                  setTransferToCash(true);
                  setTransferToBankId("");
                } else {
                  setTransferToCash(false);
                  setTransferToBankId(e.target.value);
                }
              }}
              className="w-full rounded-lg border border-amber-300 px-3 py-2 text-sm"
            >
              <option value="cash">Ana Kasa</option>
              {allBanks.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-amber-800 mb-1">Not</label>
            <input
              value={transferNote}
              onChange={(e) => setTransferNote(e.target.value)}
              className="w-full rounded-lg border border-amber-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-amber-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Transfer et
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <form
          onSubmit={onSubmit}
          className="lg:col-span-1 rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"
        >
          <h2 className="font-semibold text-slate-800">Yeni banka hareketi</h2>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Tip</label>
            <select
              value={formType}
              onChange={(e) => setFormType(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {BANK_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Tutar (₺)</label>
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Tarih</label>
            <input
              type="date"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Kategori</label>
            <input
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Not</label>
            <textarea
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-baykus-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {busy ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </form>

        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 font-semibold text-slate-800">
            Hareketler
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3">Tarih</th>
                <th className="px-4 py-3">Tip</th>
                <th className="px-4 py-3">Not</th>
                <th className="px-4 py-3 text-right">Tutar</th>
                <th className="px-4 py-3 text-right">Bakiye</th>
              </tr>
            </thead>
            <tbody>
              {movements.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    Hareket yok
                  </td>
                </tr>
              )}
              {movements.map((m) => (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 whitespace-nowrap">{m.movement_date}</td>
                  <td className="px-4 py-2.5">
                    {BANK_TYPE_LABELS[m.movement_type] || m.movement_type}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 max-w-xs truncate">
                    {m.note || "—"}
                    {m.customer_name ? ` · ${m.customer_name}` : ""}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                      m.direction === "in" ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    {m.direction === "in" ? "+" : "−"}
                    {formatMoney(Number(m.amount))}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                    {m.running_balance != null ? formatMoney(Number(m.running_balance)) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
