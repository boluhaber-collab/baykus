"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Assumptions,
  ReportHeader,
  ReportTable,
  SummaryCards,
} from "@/components/reports/ReportChrome";
import StatusFooter from "@/components/StatusFooter";
import { ReportResponse, apiFetch, downloadReportCsv, formatMoney } from "@/lib/api";

type Row = {
  label: string;
  order_count: number;
  cancelled_count: number;
  revenue: number;
};

export default function Sales6mPage() {
  const [data, setData] = useState<ReportResponse<Row> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await apiFetch<ReportResponse<Row>>("/api/reports/sales-6m"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const s = data?.summary || {};
  const rows = data?.rows || [];

  return (
    <div>
      <ReportHeader
        title="6 Aylık Satışlar"
        subtitle="Son 6 takvim ayı — sipariş ciro (iptaller hariç)"
        actions={
          <>
            <button onClick={load} className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm" disabled={loading}>
              {loading ? "Yükleniyor…" : "Yenile"}
            </button>
            <button
              onClick={() => downloadReportCsv("/api/reports/sales-6m", "alti_aylik_satislar.csv").catch((e) => setError(String(e)))}
              className="rounded-lg bg-emerald-700 text-white px-4 py-2 text-sm"
            >
              CSV
            </button>
          </>
        }
      />
      {error && <div className="mb-3 rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      <SummaryCards
        items={[
          { label: "Ay", value: Number(s.month_count || 0), color: "#c2410c" },
          { label: "Sipariş", value: Number(s.order_count || 0), color: "#2563eb" },
          { label: "Ciro", value: formatMoney(Number(s.revenue || 0)), color: "#198754" },
        ]}
      />
      <Assumptions items={(s.assumptions as string[]) || []} />
      <ReportTable headers={["Ay", "Sipariş", "İptal", "Ciro"]} colSpan={4} empty={rows.length === 0}>
        {rows.map((r) => (
          <tr key={r.label}>
            <td className="font-medium">{r.label}</td>
            <td className="tabular-nums">{r.order_count}</td>
            <td className="tabular-nums">{r.cancelled_count}</td>
            <td className="text-right tabular-nums">{formatMoney(r.revenue)}</td>
          </tr>
        ))}
      </ReportTable>
      <StatusFooter />
    </div>
  );
}
