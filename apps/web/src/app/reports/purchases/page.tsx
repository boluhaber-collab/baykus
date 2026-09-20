"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, downloadReportCsv, formatMoney } from "@/lib/api";

type Row = { id: number; number: string; date: string | null; supplier: string | null; status: string; amount: number };

export default function PurchaseReportPage() {
  const now = new Date();
  const [from, setFrom] = useState(`${now.getFullYear()}-01-01`);
  const [to, setTo] = useState(now.toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<{ count: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [csvBusy, setCsvBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const p = new URLSearchParams({ date_from: from, date_to: to });
      const data = await apiFetch<{ summary: { count: number; total: number }; rows: Row[] }>(
        `/api/reports/purchases?${p}`,
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
    let list = rows;
    if (status) list = list.filter((r) => r.status === status);
    const needle = q.trim().toLocaleLowerCase("tr");
    if (needle) {
      list = list.filter((r) =>
        [r.number, r.supplier, r.status].join(" ").toLocaleLowerCase("tr").includes(needle),
      );
    }
    return list;
  }, [rows, q, status]);

  const filteredTotal = filtered.reduce((s, r) => s + r.amount, 0);

  async function exportCsv() {
    setCsvBusy(true);
    try {
      await downloadReportCsv(`/api/reports/purchases?date_from=${from}&date_to=${to}&format=csv`, "alis-raporu.csv");
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
          <h2 className="text-base font-bold">Alış Raporu</h2>
          <p className="text-xs text-baykus-muted">Raporlar › Alış · belge özeti + CSV</p>
        </div>
        <Link href="/purchases" className="bk-btn text-xs text-white" style={{ background: "#0f766e" }}>
          Alış listesi
        </Link>
      </div>
      <div className="bk-filter-bar">
        <input type="date" className="bk-input" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="bk-input" value={to} onChange={(e) => setTo(e.target.value)} />
        <select className="bk-input max-w-[140px]" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tüm durumlar</option>
          <option value="draft">Taslak</option>
          <option value="confirmed">Onaylı</option>
          <option value="cancelled">İptal</option>
        </select>
        <input className="bk-input max-w-[160px]" placeholder="Ara…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="bk-btn bk-btn-primary text-xs" onClick={load}>
          Filtrele
        </button>
        <button type="button" className="bk-btn bk-btn-ghost text-xs" disabled={csvBusy} onClick={exportCsv}>
          CSV
        </button>
        <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => window.print()}>
          Yazdır
        </button>
      </div>
      <div className="grid sm:grid-cols-3 gap-2 text-sm">
        <div className="bk-card px-4 py-2">
          <div className="text-[11px] text-baykus-muted">Belge</div>
          <div className="text-xl font-bold">{filtered.length || summary?.count || 0}</div>
        </div>
        <div className="bk-card px-4 py-2">
          <div className="text-[11px] text-baykus-muted">Toplam</div>
          <div className="text-xl font-bold tabular-nums">{formatMoney(filteredTotal || summary?.total || 0)}</div>
        </div>
        <div className="bk-card px-4 py-2">
          <div className="text-[11px] text-baykus-muted">Ort. belge</div>
          <div className="text-xl font-bold tabular-nums">
            {formatMoney(filtered.length ? filteredTotal / filtered.length : 0)}
          </div>
        </div>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Belge</th>
              <th>Tarih</th>
              <th>Tedarikçi</th>
              <th>Durum</th>
              <th className="text-right">Tutar</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/purchases/${r.id}`} className="text-baykus-primary hover:underline font-medium">
                    {r.number}
                  </Link>
                </td>
                <td className="text-xs">{r.date || "—"}</td>
                <td>{r.supplier || "—"}</td>
                <td className="text-xs">{r.status}</td>
                <td className="text-right tabular-nums">{formatMoney(r.amount)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-baykus-muted py-8">
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
