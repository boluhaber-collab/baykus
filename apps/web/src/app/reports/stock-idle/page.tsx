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
import { ReportResponse, apiFetch, downloadReportCsv } from "@/lib/api";
import { displaySku } from "@/lib/productLabel";

type Row = {
  product_id: number;
  sku?: string | null;
  name: string;
  category?: string | null;
  warehouse?: string | null;
  qty: number;
  last_movement_at?: string | null;
  days_idle?: number | null;
};

export default function StockIdlePage() {
  const [days, setDays] = useState(90);
  const [data, setData] = useState<ReportResponse<Row> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const qs = useMemo(() => `days=${days}`, [days]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await apiFetch<ReportResponse<Row>>(`/api/reports/stock-idle?${qs}`));
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
        title="Hareket Görmeyen Ürünler"
        subtitle={`Son ${days} günde stok hareketi olmayan aktif ürünler`}
        actions={
          <>
            <button onClick={load} className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm" disabled={loading}>
              {loading ? "Yükleniyor…" : "Yenile"}
            </button>
            <button
              onClick={() =>
                downloadReportCsv(`/api/reports/stock-idle?${qs}`, "hareket_gormeyen.csv").catch((e) =>
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
        <Field label="Gün eşiği">
          <input
            type="number"
            min={1}
            className={inputCls}
            value={days}
            onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 90))}
          />
        </Field>
      </FilterBar>
      {error && <div className="mb-3 rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      <SummaryCards items={[{ label: "Ürün", value: Number(s.count || 0), color: "#475569" }]} />
      <Assumptions items={(s.assumptions as string[]) || []} />
      <ReportTable
        headers={["SKU", "Ürün", "Kategori", "Depo", "Miktar", "Son hareket", "Gün"]}
        colSpan={7}
        empty={rows.length === 0}
      >
        {rows.map((r) => (
          <tr key={r.product_id}>
            <td>{displaySku(r.sku)}</td>
            <td className="font-medium">{r.name}</td>
            <td>{r.category || "—"}</td>
            <td>{r.warehouse || "—"}</td>
            <td className="tabular-nums">{r.qty}</td>
            <td>{r.last_movement_at ? r.last_movement_at.slice(0, 10) : "Hiç"}</td>
            <td className="tabular-nums">{r.days_idle ?? "—"}</td>
          </tr>
        ))}
      </ReportTable>
      <StatusFooter />
    </div>
  );
}
