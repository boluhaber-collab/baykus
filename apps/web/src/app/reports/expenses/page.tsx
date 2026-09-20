"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, formatMoney } from "@/lib/api";

type Row = { id: number; date: string | null; category: string | null; amount: number; payment_method: string | null; note: string | null; posted: boolean };

export default function ExpenseReportsPage() {
  const now = new Date();
  const [from, setFrom] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`);
  const [to, setTo] = useState(now.toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<{ count: number; total: number } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const p = new URLSearchParams({ date_from: from, date_to: to });
      const data = await apiFetch<{ summary: { count: number; total: number }; rows: Row[] }>(`/api/reports/expenses?${p}`);
      setRows(data.rows); setSummary(data.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold">Masraf Raporları</h2>
        <p className="text-xs text-baykus-muted">Gider dökümü · masaüstü Masraflar raporu</p>
      </div>
      <div className="bk-filter-bar">
        <input type="date" className="bk-input" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="bk-input" value={to} onChange={(e) => setTo(e.target.value)} />
        <button type="button" className="bk-btn bk-btn-primary" onClick={load}>Filtrele</button>
        <a className="bk-btn bk-btn-ghost text-xs" href={`/api/reports/expenses?date_from=${from}&date_to=${to}&format=csv`}>CSV</a>
      </div>
      {summary && (
        <div className="flex gap-4 text-sm">
          <div className="bk-card px-4 py-2"><div className="text-[11px] text-baykus-muted">Kayıt</div><div className="font-bold">{summary.count}</div></div>
          <div className="bk-card px-4 py-2"><div className="text-[11px] text-baykus-muted">Toplam</div><div className="font-bold tabular-nums">{formatMoney(summary.total)}</div></div>
        </div>
      )}
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead><tr><th>Tarih</th><th>Kategori</th><th>Ödeme</th><th>Not</th><th className="text-right">Tutar</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="text-xs">{r.date || "—"}</td>
                <td>{r.category || "—"}</td>
                <td className="text-xs">{r.payment_method || "—"}</td>
                <td className="text-xs text-baykus-muted">{r.note || "—"}</td>
                <td className="text-right tabular-nums">{formatMoney(r.amount)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="text-center text-baykus-muted py-8">Kayıt yok</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
