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
import StatusFooter from "@/components/StatusFooter";

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
    <div className="space-y-2 pb-2">
      <div className="bk-sticky-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-baykus-text leading-tight">Finans</h1>
          <p className="text-baykus-muted text-[11px]">Kasa + banka özeti · bugünkü hareketler</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/finance/cash" className="bk-btn bk-btn-ghost text-xs">Kasa</Link>
          <Link href="/finance/banks" className="bk-btn bk-btn-ghost text-xs">Banka</Link>
          <Link href="/finance/expenses" className="bk-btn bk-btn-ghost text-xs">Giderler</Link>
          <Link href="/finance/assets" className="bk-btn bk-btn-ghost text-xs">Sabit kıymetler</Link>
          <Link href="/finance/loans" className="bk-btn bk-btn-ghost text-xs">Kredi / Taksit</Link>
          <button type="button" onClick={load} className="bk-btn bk-btn-primary text-xs">Yenile</button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}
      {loading && !data && <p className="text-baykus-muted text-sm">Yükleniyor…</p>}

      {data && (
        <>
          <div className="bk-kpi-strip">
            <div className="bk-kpi-card" style={{ backgroundColor: "#198754" }}>
              <span className="bk-kpi-icon">💵</span>
              <div className="min-w-0 flex-1 text-right">
                <div className="bk-kpi-label">Toplam kasa</div>
                <div className="bk-kpi-value truncate">{formatMoney(Number(data.total_cash))}</div>
              </div>
            </div>
            <div className="bk-kpi-card" style={{ backgroundColor: "#2563eb" }}>
              <span className="bk-kpi-icon">🏦</span>
              <div className="min-w-0 flex-1 text-right">
                <div className="bk-kpi-label">Toplam banka</div>
                <div className="bk-kpi-value truncate">{formatMoney(Number(data.total_bank))}</div>
              </div>
            </div>
            <div className="bk-kpi-card" style={{ backgroundColor: "#7c3aed" }}>
              <span className="bk-kpi-icon">Σ</span>
              <div className="min-w-0 flex-1 text-right">
                <div className="bk-kpi-label">Likidite</div>
                <div className="bk-kpi-value truncate">{formatMoney(Number(data.total_liquidity))}</div>
              </div>
            </div>
            <div className="bk-kpi-card" style={{ backgroundColor: "#f59e0b" }}>
              <span className="bk-kpi-icon">↻</span>
              <div className="min-w-0 flex-1 text-right">
                <div className="bk-kpi-label">Bugün hareket</div>
                <div className="bk-kpi-value">{data.today_movements_count}</div>
                {data.receivables != null && (
                  <div className="text-[10px] opacity-90">Alacak {formatMoney(Number(data.receivables))}</div>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 mb-6">
            <div className="rounded-xl border border-baykus-line bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-baykus-text mb-3">Bugün — Kasa</h2>
              <div className="flex gap-6 text-sm">
                <div>
                  <div className="text-xs text-baykus-muted">Giriş</div>
                  <div className="font-semibold text-emerald-700 tabular-nums">
                    {formatMoney(Number(data.today_cash_in))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-baykus-muted">Çıkış</div>
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
            <div className="rounded-xl border border-baykus-line bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-baykus-text mb-3">Bugün — Banka</h2>
              <div className="flex gap-6 text-sm">
                <div>
                  <div className="text-xs text-baykus-muted">Giriş</div>
                  <div className="font-semibold text-emerald-700 tabular-nums">
                    {formatMoney(Number(data.today_bank_in))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-baykus-muted">Çıkış</div>
                  <div className="font-semibold text-red-700 tabular-nums">
                    {formatMoney(Number(data.today_bank_out))}
                  </div>
                </div>
              </div>
              <ul className="mt-4 space-y-1 text-sm">
                {data.bank_accounts.map((a) => (
                  <li key={a.id} className="flex justify-between">
                    <Link href={`/finance/banks/${a.id}`} className="text-baykus-primary hover:underline">
                      {a.name}
                    </Link>
                    <span className="tabular-nums font-medium">{formatMoney(Number(a.balance))}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="bk-table-wrap">
            <div className="px-3 py-2 border-b border-baykus-line bg-[#151b26] text-white text-xs font-bold">
              Son hareketler
            </div>
            <table className="bk-table">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Kaynak</th>
                  <th>Hesap</th>
                  <th>Tip</th>
                  <th>Not</th>
                  <th className="text-right">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_movements.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-slate-400 py-6">
                      Hareket yok
                    </td>
                  </tr>
                )}
                {data.recent_movements.map((m) => (
                  <tr key={`${m.source}-${m.id}`}>
                    <td className="whitespace-nowrap">{m.movement_date}</td>
                    <td>{m.source === "cash" ? "Kasa" : "Banka"}</td>
                    <td>{m.account_name || "—"}</td>
                    <td>{typeLabel(m.source, m.movement_type)}</td>
                    <td className="text-baykus-muted max-w-xs truncate">{m.note || "—"}</td>
                    <td
                      className={`text-right tabular-nums font-medium ${
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

      <StatusFooter onRefresh={load} />
    </div>
  );
}
