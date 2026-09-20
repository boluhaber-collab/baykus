"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, downloadReportCsv, formatMoney, getApiBase, getToken } from "@/lib/api";

type CustomerOpt = { id: number; name: string; company: string | null; balance: number };
type Move = { id: number; date: string | null; type: string; debit: number; credit: number; balance: number; note: string | null };

export default function CariStatementsPage() {
  const [customers, setCustomers] = useState<CustomerOpt[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [rows, setRows] = useState<Move[]>([]);
  const [summary, setSummary] = useState<{ customer_name?: string; closing_balance?: number } | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [csvBusy, setCsvBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    // Support deep link ?customer_id=
    if (typeof window !== "undefined") {
      const id = new URLSearchParams(window.location.search).get("customer_id");
      if (id) setCustomerId(id);
    }
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

  useEffect(() => {
    void load();
  }, [load]);

  const filteredCustomers = q.trim()
    ? customers.filter((c) => [c.name, c.company].join(" ").toLowerCase().includes(q.trim().toLowerCase()))
    : customers;

  const debitSum = rows.reduce((s, r) => s + r.debit, 0);
  const creditSum = rows.reduce((s, r) => s + r.credit, 0);

  async function exportCsv() {
    if (!customerId) return;
    setCsvBusy(true);
    try {
      await downloadReportCsv(
        `/api/reports/cari-statements?customer_id=${customerId}&format=csv`,
        `cari-dokum-${customerId}.csv`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "CSV hatası");
    } finally {
      setCsvBusy(false);
    }
  }

  async function exportPdf() {
    if (!customerId) return;
    setPdfBusy(true);
    try {
      const res = await fetch(
        `${getApiBase()}/api/reports/cari-statements?customer_id=${customerId}&format=pdf`,
        { headers: { Authorization: `Bearer ${getToken()}` } },
      );
      if (!res.ok) throw new Error(`PDF ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `cari-dokum-${customerId}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF hatası");
    } finally {
      setPdfBusy(false);
    }
  }

  function openPrintable() {
    if (!customerId) return;
    const url = `${getApiBase()}/api/reports/cari-statements?customer_id=${customerId}&format=html`;
    // open with token via blob fetch
    void (async () => {
      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
        if (!res.ok) throw new Error(`HTML ${res.status}`);
        const html = await res.text();
        const w = window.open("", "_blank");
        if (w) {
          w.document.write(html);
          w.document.close();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Yazdır sayfası hatası");
      }
    })();
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-bold">Cari Dökümler</h2>
        <p className="text-xs text-baykus-muted">Raporlar › Cari Döküm · CSV + basit PDF + yazdırılabilir HTML (masaüstü ReportLab twin değil)</p>
      </div>
      <div className="bk-filter-bar">
        <input
          className="bk-input max-w-[160px]"
          placeholder="Müşteri ara…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="bk-input min-w-[220px]" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">Müşteri seçin…</option>
          {filteredCustomers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.company ? ` (${c.company})` : ""} · {formatMoney(c.balance)}
            </option>
          ))}
        </select>
        <button type="button" className="bk-btn bk-btn-primary text-xs" onClick={load} disabled={!customerId}>
          Getir
        </button>
        <button type="button" className="bk-btn bk-btn-ghost text-xs" disabled={!customerId || csvBusy} onClick={exportCsv}>
          {csvBusy ? "…" : "CSV indir"}
        </button>
        <button type="button" className="bk-btn bk-btn-ghost text-xs" disabled={!customerId || pdfBusy} onClick={exportPdf}>
          {pdfBusy ? "…" : "PDF indir"}
        </button>
        <button type="button" className="bk-btn bk-btn-ghost text-xs" disabled={!customerId} onClick={openPrintable}>
          Yazdır / HTML
        </button>
      </div>

      {summary?.customer_name && (
        <div className="grid sm:grid-cols-4 gap-2">
          <div className="bk-card px-3 py-2">
            <div className="text-[11px] text-baykus-muted">Müşteri</div>
            <div className="font-semibold text-sm">{summary.customer_name}</div>
          </div>
          <div className="bk-card px-3 py-2">
            <div className="text-[11px] text-baykus-muted">Borç toplam</div>
            <div className="font-bold tabular-nums">{formatMoney(debitSum)}</div>
          </div>
          <div className="bk-card px-3 py-2">
            <div className="text-[11px] text-baykus-muted">Alacak toplam</div>
            <div className="font-bold tabular-nums text-emerald-700">{formatMoney(creditSum)}</div>
          </div>
          <div className="bk-card px-3 py-2">
            <div className="text-[11px] text-baykus-muted">Kapanış bakiyesi</div>
            <div className="font-bold tabular-nums text-amber-800">{formatMoney(summary.closing_balance || 0)}</div>
          </div>
        </div>
      )}

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Tip</th>
              <th className="text-right">Borç</th>
              <th className="text-right">Alacak</th>
              <th className="text-right">Bakiye</th>
              <th>Not</th>
            </tr>
          </thead>
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
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-baykus-muted py-8">
                  {customerId ? "Hareket yok" : "Önce müşteri seçin"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
