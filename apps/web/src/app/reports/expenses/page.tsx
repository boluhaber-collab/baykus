"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, downloadReportCsv, formatMoney } from "@/lib/api";

type Row = {
  id: number;
  date: string | null;
  category: string | null;
  amount: number;
  payment_method: string | null;
  note: string | null;
  posted: boolean;
};

export default function ExpenseReportsPage() {
  const now = new Date();
  const [from, setFrom] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
  const [to, setTo] = useState(now.toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<{ count: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [csvBusy, setCsvBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const p = new URLSearchParams({ date_from: from, date_to: to });
      const data = await apiFetch<{ summary: { count: number; total: number }; rows: Row[] }>(
        `/api/reports/expenses?${p}`,
      );
      setRows(data.rows);
      setSummary(data.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.category, r.note, r.payment_method].join(" ").toLowerCase().includes(needle),
    );
  }, [rows, q]);

  const byCat = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of filtered) {
      const k = r.category || "Diğer";
      m[k] = (m[k] || 0) + r.amount;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const filteredTotal = filtered.reduce((s, r) => s + r.amount, 0);

  async function exportCsv() {
    setCsvBusy(true);
    try {
      await downloadReportCsv(`/api/reports/expenses?date_from=${from}&date_to=${to}&format=csv`, "masraf-raporu.csv");
    } catch (e) {
      setError(e instanceof Error ? e.message : "CSV hatası");
    } finally {
      setCsvBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Masraf Raporları</h2>
          <p className="text-xs text-baykus-muted">Raporlar › Masraflar · filtre + CSV + özet</p>
        </div>
        <Link href="/finance/expenses" className="bk-btn text-xs text-white" style={{ background: "#dc2626" }}>
          Masraf gir
        </Link>
      </div>
      <div className="bk-filter-bar">
        <input type="date" className="bk-input" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="bk-input" value={to} onChange={(e) => setTo(e.target.value)} />
        <input className="bk-input max-w-[160px]" placeholder="Ara…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="bk-btn bk-btn-primary text-xs" onClick={load}>
          Filtrele
        </button>
        <button type="button" className="bk-btn bk-btn-ghost text-xs" disabled={csvBusy} onClick={exportCsv}>
          {csvBusy ? "…" : "CSV indir"}
        </button>
      </div>
      <div className="grid sm:grid-cols-3 gap-2">
        <div className="bk-card px-4 py-2">
          <div className="text-[11px] text-baykus-muted">Kayıt</div>
          <div className="font-bold">{filtered.length}</div>
        </div>
        <div className="bk-card px-4 py-2">
          <div className="text-[11px] text-baykus-muted">Toplam</div>
          <div className="font-bold tabular-nums">{formatMoney(filteredTotal || summary?.total || 0)}</div>
        </div>
        <div className="bk-card px-4 py-2">
          <div className="text-[11px] text-baykus-muted">Kategori dağılımı</div>
          <div className="text-xs mt-1 space-y-0.5 max-h-16 overflow-auto">
            {byCat.slice(0, 5).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <span className="truncate">{k}</span>
                <span className="tabular-nums">{formatMoney(v)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Kategori</th>
              <th>Ödeme</th>
              <th>Durum</th>
              <th>Not</th>
              <th className="text-right">Tutar</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className="text-xs">{r.date || "—"}</td>
                <td>{r.category || "—"}</td>
                <td className="text-xs">{r.payment_method || "—"}</td>
                <td className="text-xs">{r.posted ? "İşlenmiş" : "Bekliyor"}</td>
                <td className="text-xs text-baykus-muted">{r.note || "—"}</td>
                <td className="text-right tabular-nums">{formatMoney(r.amount)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-baykus-muted py-8">
                  Kayıt yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
