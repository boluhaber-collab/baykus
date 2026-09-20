"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  BANK_TYPE_LABELS,
  CASH_TYPE_LABELS,
  FinanceSummary,
  apiFetch,
  formatMoney,
} from "@/lib/api";

export default function FinanceOverviewPage() {
  const [data, setData] = useState<FinanceSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const s = await apiFetch<FinanceSummary>("/api/finance/summary");
      setData(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function typeLabel(source: string, t: string) {
    if (source === "cash") return CASH_TYPE_LABELS[t] || t;
    return BANK_TYPE_LABELS[t] || t;
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Finans</h1>
          <p className="text-slate-500 text-sm">Kasa + banka özeti · bugünkü hareketler</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/finance/cash"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Kasa
          </Link>
          <Link
            href="/finance/banks"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Banka
          </Link>
          <Link
            href="/finance/expenses"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Giderler
          </Link>
          <button
            onClick={load}
            className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm"
          >
            Yenile
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}
      {loading && !data && <p className="text-slate-500 text-sm">Yükleniyor…</p>}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
              <div className="text-xs text-emerald-800">Toplam kasa</div>
              <div className="text-xl font-bold text-emerald-900 tabular-nums">
                {formatMoney(Number(data.total_cash))}
              </div>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-5 py-4">
              <div className="text-xs text-sky-800">Toplam banka</div>
              <div className="text-xl font-bold text-sky-900 tabular-nums">
                {formatMoney(Number(data.total_bank))}
              </div>
            </div>
            <div className="rounded-xl border border-violet-200 bg-violet-50 px-5 py-4">
              <div className="text-xs text-violet-800">Likidite</div>
              <div className="text-xl font-bold text-violet-900 tabular-nums">
                {formatMoney(Number(data.total_liquidity))}
              </div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
              <div className="text-xs text-amber-800">Bugün hareket</div>
              <div className="text-xl font-bold text-amber-900">{data.today_movements_count}</div>
              {data.receivables != null && (
                <div className="text-xs text-amber-700 mt-1">
                  Açık alacak: {formatMoney(Number(data.receivables))}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 mb-6">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-800 mb-3">Bugün — Kasa</h2>
              <div className="flex gap-6 text-sm">
                <div>
                  <div className="text-xs text-slate-500">Giriş</div>
                  <div className="font-semibold text-emerald-700 tabular-nums">
                    {formatMoney(Number(data.today_cash_in))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Çıkış</div>
                  <div className="font-semibold text-red-700 tabular-nums">
                    {formatMoney(Number(data.today_cash_out))}
                  </div>
                </div>
              </div>
              <ul className="mt-4 space-y-1 text-sm">
                {data.cash_registers.map((r) => (
                  <li key={r.id} className="flex justify-between">
                    <span>{r.name}</span>
                    <span className="tabular-nums font-medium">{formatMoney(Number(r.balance))}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-800 mb-3">Bugün — Banka</h2>
              <div className="flex gap-6 text-sm">
                <div>
                  <div className="text-xs text-slate-500">Giriş</div>
                  <div className="font-semibold text-emerald-700 tabular-nums">
                    {formatMoney(Number(data.today_bank_in))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Çıkış</div>
                  <div className="font-semibold text-red-700 tabular-nums">
                    {formatMoney(Number(data.today_bank_out))}
                  </div>
                </div>
              </div>
              <ul className="mt-4 space-y-1 text-sm">
                {data.bank_accounts.map((a) => (
                  <li key={a.id} className="flex justify-between">
                    <Link href={`/finance/banks/${a.id}`} className="text-baykus-700 hover:underline">
                      {a.name}
                    </Link>
                    <span className="tabular-nums font-medium">{formatMoney(Number(a.balance))}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 font-semibold text-slate-800">
              Son hareketler
            </div>
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3">Tarih</th>
                  <th className="px-4 py-3">Kaynak</th>
                  <th className="px-4 py-3">Hesap</th>
                  <th className="px-4 py-3">Tip</th>
                  <th className="px-4 py-3">Not</th>
                  <th className="px-4 py-3 text-right">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_movements.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                      Hareket yok
                    </td>
                  </tr>
                )}
                {data.recent_movements.map((m) => (
                  <tr key={`${m.source}-${m.id}`} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 whitespace-nowrap">{m.movement_date}</td>
                    <td className="px-4 py-2.5">{m.source === "cash" ? "Kasa" : "Banka"}</td>
                    <td className="px-4 py-2.5">{m.account_name || "—"}</td>
                    <td className="px-4 py-2.5">{typeLabel(m.source, m.movement_type)}</td>
                    <td className="px-4 py-2.5 text-slate-500 max-w-xs truncate">{m.note || "—"}</td>
                    <td
                      className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                        m.direction === "in" ? "text-emerald-700" : "text-red-700"
                      }`}
                    >
                      {m.direction === "in" ? "+" : "−"}
                      {formatMoney(Number(m.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
