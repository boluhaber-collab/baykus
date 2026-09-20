"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, formatMoney } from "@/lib/api";

type CustomerOpt = { id: number; name: string; company: string | null; balance: number };
type Move = { id: number; date: string | null; type: string; debit: number; credit: number; balance: number; note: string | null };

export default function CariStatementsPage() {
  const [customers, setCustomers] = useState<CustomerOpt[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [rows, setRows] = useState<Move[]>([]);
  const [summary, setSummary] = useState<{ customer_name?: string; closing_balance?: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<{ customers: CustomerOpt[] }>("/api/reports/cari-statements")
      .then((d) => setCustomers(d.customers || []))
      .catch((e) => setError(e instanceof Error ? e.message : "Yükleme hatası"));
  }, []);

  const load = useCallback(async () => {
    if (!customerId) return;
    setError("");
    try {
      const data = await apiFetch<{ summary: { customer_name: string; closing_balance: number }; rows: Move[] }>(
        `/api/reports/cari-statements?customer_id=${customerId}`,
      );
      setRows(data.rows);
      setSummary(data.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [customerId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold">Cari Dökümler</h2>
        <p className="text-xs text-baykus-muted">Müşteri seçin · ekstre tablo + CSV (PDF masaüstü çıktısı webde CSV)</p>
      </div>
      <div className="bk-filter-bar">
        <select className="bk-input min-w-[220px]" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">Müşteri seçin…</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ""}</option>
          ))}
        </select>
        <button type="button" className="bk-btn bk-btn-primary" onClick={load} disabled={!customerId}>Getir</button>
        {customerId && (
          <a className="bk-btn bk-btn-ghost text-xs" href={`/api/reports/cari-statements?customer_id=${customerId}&format=csv`}>CSV indir</a>
        )}
      </div>
      {summary?.customer_name && (
        <div className="bk-card px-4 py-3 flex flex-wrap gap-6 text-sm">
          <div><span className="text-baykus-muted text-xs">Müşteri</span><div className="font-semibold">{summary.customer_name}</div></div>
          <div><span className="text-baykus-muted text-xs">Kapanış bakiyesi</span><div className="font-bold tabular-nums">{formatMoney(summary.closing_balance || 0)}</div></div>
        </div>
      )}
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead><tr><th>Tarih</th><th>Tip</th><th className="text-right">Borç</th><th className="text-right">Alacak</th><th className="text-right">Bakiye</th><th>Not</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="text-xs">{r.date || "—"}</td>
                <td className="text-xs">{r.type}</td>
                <td className="text-right tabular-nums">{formatMoney(r.debit)}</td>
                <td className="text-right tabular-nums">{formatMoney(r.credit)}</td>
                <td className="text-right tabular-nums font-medium">{formatMoney(r.balance)}</td>
                <td className="text-xs text-baykus-muted">{r.note || "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="text-center text-baykus-muted py-8">{customerId ? "Hareket yok" : "Önce müşteri seçin"}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
