"use client";

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

type Row = {
  name: string;
  sold_qty: number;
  sold_amount: number;
  buy_qty: number;
  buy_amount: number;
  net_qty: number;
  gross_approx: number;
};

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function ProductBuySellPage() {
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
      setData(await apiFetch<ReportResponse<Row>>(`/api/reports/product-buy-sell?${qs}`));
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
        title="Ürün Alış-Satış"
        subtitle="Ürün bazlı satış ciro vs alış maliyeti"
        actions={
          <>
            <button onClick={load} className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm" disabled={loading}>
              {loading ? "Yükleniyor…" : "Yenile"}
            </button>
            <button
              onClick={() =>
                downloadReportCsv(`/api/reports/product-buy-sell?${qs}`, "urun_alis_satis.csv").catch((e) =>
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
          { label: "Ürün", value: Number(s.row_count || 0), color: "#0ea5e9" },
          { label: "Satış", value: formatMoney(Number(s.sold_amount || 0)), color: "#198754" },
          { label: "Alış", value: formatMoney(Number(s.buy_amount || 0)), color: "#be123c" },
        ]}
      />
      <Assumptions items={(s.assumptions as string[]) || []} />
      <ReportTable
        headers={["Ürün", "Satış adet", "Satış tutar", "Alış adet", "Alış tutar", "Net adet", "Fark"]}
        colSpan={7}
        empty={rows.length === 0}
      >
        {rows.map((r, i) => (
          <tr key={i}>
            <td className="font-medium">{r.name}</td>
            <td className="tabular-nums">{r.sold_qty}</td>
            <td className="text-right tabular-nums">{formatMoney(r.sold_amount)}</td>
            <td className="tabular-nums">{r.buy_qty}</td>
            <td className="text-right tabular-nums">{formatMoney(r.buy_amount)}</td>
            <td className="tabular-nums">{r.net_qty}</td>
            <td className="text-right tabular-nums">{formatMoney(r.gross_approx)}</td>
          </tr>
        ))}
      </ReportTable>
      <StatusFooter />
    </div>
  );
}
