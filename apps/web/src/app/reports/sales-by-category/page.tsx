"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { localToday } from "@/lib/dates";
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

type Row = { category: string; line_count: number; qty: number; revenue: number };

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr() {
  return localToday();
}

export default function SalesByCategoryPage() {
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
      setData(await apiFetch<ReportResponse<Row>>(`/api/reports/sales-by-category?${qs}`));
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
        title="Kategori Bazlı Satış"
        subtitle="Ürün kategorisine göre sipariş satırı ciro"
        actions={
          <>
            <button onClick={load} className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm" disabled={loading}>
              {loading ? "Yükleniyor…" : "Yenile"}
            </button>
            <button
              onClick={() =>
                downloadReportCsv(`/api/reports/sales-by-category?${qs}`, "kategori_satis.csv").catch((e) =>
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
          { label: "Kategori", value: Number(s.category_count || 0), color: "#db2777" },
          { label: "Miktar", value: Number(s.qty || 0), color: "#2563eb" },
          { label: "Ciro", value: formatMoney(Number(s.revenue || 0)), color: "#198754" },
        ]}
      />
      <Assumptions items={(s.assumptions as string[]) || []} />
      <ReportTable headers={["Kategori", "Satır", "Miktar", "Ciro"]} colSpan={4} empty={rows.length === 0}>
        {rows.map((r) => (
          <tr key={r.category}>
            <td className="font-medium">{r.category}</td>
            <td className="tabular-nums">{r.line_count}</td>
            <td className="tabular-nums">{r.qty}</td>
            <td className="text-right tabular-nums">{formatMoney(r.revenue)}</td>
          </tr>
        ))}
      </ReportTable>
      <StatusFooter />
    </div>
  );
}
