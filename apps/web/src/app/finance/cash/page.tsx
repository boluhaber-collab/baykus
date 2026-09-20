"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  CASH_TYPE_LABELS,
  CashMovement,
  CashRegister,
  apiFetch,
  formatMoney,
} from "@/lib/api";

const CASH_TYPES = [
  { value: "tahsilat", label: "Tahsilat" },
  { value: "odeme", label: "Ödeme" },
  { value: "gider", label: "Gider" },
];

export default function CashPage() {
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const todayStr = new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);

  const [formType, setFormType] = useState("tahsilat");
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formCategory, setFormCategory] = useState("");
  const [formNote, setFormNote] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set("movement_type", typeFilter);
      if (fromDate) params.set("from_date", fromDate);
      if (toDate) params.set("to_date", toDate);
      const qs = params.toString();
      const [regs, movs] = await Promise.all([
        apiFetch<CashRegister[]>("/api/finance/cash"),
        apiFetch<CashMovement[]>(`/api/finance/cash/movements${qs ? `?${qs}` : ""}`),
      ]);
      setRegisters(regs);
      setMovements(movs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [typeFilter, fromDate, toDate]);

  useEffect(() => {
    load();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/finance/cash/movements", {
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

  const main = registers[0];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Günlük Kasa</h1>
          <p className="text-slate-500 text-sm">Bugün varsayılan · açılış bakiyesi + günlük nakit hareketleri</p>
        </div>
        <div className="flex gap-2">
          <Link href="/finance" className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
            Finans özeti
          </Link>
          <Link href="/finance/banks" className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
            Banka
          </Link>
        </div>
      </div>

      {main && (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 flex flex-wrap gap-8">
          <div>
            <div className="text-xs text-emerald-800">{main.name}</div>
            <div className="text-2xl font-bold text-emerald-900 tabular-nums">
              {formatMoney(Number(main.balance))}
            </div>
          </div>
          <div>
            <div className="text-xs text-emerald-800">Açılış bakiyesi</div>
            <div className="text-lg font-semibold text-emerald-900 tabular-nums">
              {formatMoney(Number(main.opening_balance))}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-3 mb-6">
        <form
          onSubmit={onSubmit}
          className="lg:col-span-1 rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"
        >
          <h2 className="font-semibold text-slate-800">Yeni kasa hareketi</h2>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Tip</label>
            <select
              value={formType}
              onChange={(e) => setFormType(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {CASH_TYPES.map((t) => (
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
            <label className="block text-xs text-slate-500 mb-1">Kategori (gider vb.)</label>
            <input
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              placeholder="Ofis, kira, tedarikçi…"
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

        <div className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Tip</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Tümü</option>
                {CASH_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
                <option value="transfer_in">Transfer giriş</option>
                <option value="transfer_out">Transfer çıkış</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Başlangıç</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Bitiş</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3">Tarih</th>
                  <th className="px-4 py-3">Tip</th>
                  <th className="px-4 py-3">Kategori</th>
                  <th className="px-4 py-3">Not</th>
                  <th className="px-4 py-3 text-right">Tutar</th>
                  <th className="px-4 py-3 text-right">Bakiye</th>
                </tr>
              </thead>
              <tbody>
                {movements.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                      Hareket yok
                    </td>
                  </tr>
                )}
                {movements.map((m) => (
                  <tr key={m.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 whitespace-nowrap">{m.movement_date}</td>
                    <td className="px-4 py-2.5">{CASH_TYPE_LABELS[m.movement_type] || m.movement_type}</td>
                    <td className="px-4 py-2.5 text-slate-500">{m.category || "—"}</td>
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
    </div>
  );
}
