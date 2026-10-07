"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Assumptions,
  Field,
  FilterBar,
  ReportHeader,
  ReportTable,
  SummaryCards,
  inputCls,
} from "@/components/reports/ReportChrome";
import StatusFooter from "@/components/StatusFooter";
import { ReportResponse, apiFetch, downloadReportCsv, formatMoney } from "@/lib/api";
import { formatTrDate, localToday } from "@/lib/dates";

type Row = {
  id: number;
  number?: string | null;
  customer_name?: string | null;
  status?: string | null;
  total_amount: number;
  created_at?: string | null;
  valid_until?: string | null;
};

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr() {
  return localToday();
}

export default function QuotesReportPage() {
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(todayStr);
  const [data, setData] = useState<ReportResponse<Row> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (dateFrom) p.set("date_from", dateFrom);
    if (dateTo) p.set("date_to", dateTo);
    return p.toString();
  }, [dateFrom, dateTo]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await apiFetch<ReportResponse<Row>>(`/api/reports/quotes?${qs}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    load();
  }, [load]);

  const s = data?.summary || {};
  const rows = data?.rows || [];

  return (
    <div>
      <ReportHeader
        title="Teklifler"
        subtitle="Teklif listesi ve tutar özeti"
        actions={
          <>
            <Link href="/quotes" className="rounded-lg bg-violet-700 text-white px-4 py-2 text-sm">
              Teklif listesi
            </Link>
            <button onClick={load} className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm" disabled={loading}>
              {loading ? "Yükleniyor…" : "Yenile"}
            </button>
            <button
              onClick={() =>
                downloadReportCsv(`/api/reports/quotes?${qs}`, "teklifler_raporu.csv").catch((e) =>
                  setError(String(e)),
                )
              }
              className="rounded-lg bg-emerald-700 text-white px-4 py-2 text-sm"
            >
              CSV
            </button>
          </>
        }
      />
      <FilterBar>
        <Field label="Başlangıç">
          <input type="date" className={inputCls} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </Field>
        <Field label="Bitiş">
          <input type="date" className={inputCls} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </Field>
      </FilterBar>
      {error && <div className="mb-3 rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      <SummaryCards
        items={[
          { label: "Teklif", value: Number(s.count || 0), color: "#7c3aed" },
          { label: "Toplam", value: formatMoney(Number(s.total || 0)), color: "#198754" },
        ]}
      />
      <Assumptions items={(s.assumptions as string[]) || []} />
      <ReportTable headers={["No", "Müşteri", "Durum", "Tutar", "Oluşturma", "Geçerlilik"]} colSpan={6} empty={rows.length === 0}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <Link href={`/quotes/${r.id}`} className="text-baykus-primary hover:underline font-medium">
                {r.number || r.id}
              </Link>
            </td>
            <td>{r.customer_name || "—"}</td>
            <td>{r.status || "—"}</td>
            <td className="text-right tabular-nums">{formatMoney(r.total_amount)}</td>
            <td>{formatTrDate(r.created_at)}</td>
            <td>{formatTrDate(r.valid_until)}</td>
          </tr>
        ))}
      </ReportTable>
      <StatusFooter />
    </div>
  );
}
