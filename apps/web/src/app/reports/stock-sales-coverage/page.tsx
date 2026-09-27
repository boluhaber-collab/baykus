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
  stock_qty: number;
  sold_qty: number;
  coverage_ratio?: number | null;
  shortfall: number;
};

export default function StockSalesCoveragePage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<ReportResponse<Row> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const qs = useMemo(() => `days=${days}`, [days]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await apiFetch<ReportResponse<Row>>(`/api/reports/stock-sales-coverage?${qs}`));
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
        title="Stok-Satış Karşılama"
        subtitle={`Mevcut stok vs son ${days} gün satış miktarı`}
        actions={
          <>
            <button onClick={load} className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm" disabled={loading}>
              {loading ? "Yükleniyor…" : "Yenile"}
            </button>
            <button
              onClick={() =>
                downloadReportCsv(`/api/reports/stock-sales-coverage?${qs}`, "stok_satis_karsilama.csv").catch(
                  (e) => setError(String(e)),
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
        <Field label="Satış günü">
          <input
            type="number"
            min={1}
            className={inputCls}
            value={days}
            onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 30))}
          />
        </Field>
      </FilterBar>
      {error && <div className="mb-3 rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      <SummaryCards
        items={[
          { label: "Ürün", value: Number(s.count || 0), color: "#0369a1" },
          { label: "Eksik (stok < satış)", value: Number(s.shortfall_count || 0), color: "#be123c" },
        ]}
      />
      <Assumptions items={(s.assumptions as string[]) || []} />
      <ReportTable headers={["SKU", "Ürün", "Kategori", "Stok", "Satış", "Oran", "Eksik"]} colSpan={7} empty={rows.length === 0}>
        {rows.map((r) => (
          <tr key={r.product_id} className={r.shortfall > 0 ? "bg-rose-50" : undefined}>
            <td>{displaySku(r.sku)}</td>
            <td className="font-medium">{r.name}</td>
            <td>{r.category || "—"}</td>
            <td className="tabular-nums">{r.stock_qty}</td>
            <td className="tabular-nums">{r.sold_qty}</td>
            <td className="tabular-nums">{r.coverage_ratio ?? "—"}</td>
            <td className="tabular-nums font-semibold">{r.shortfall || "—"}</td>
          </tr>
        ))}
      </ReportTable>
      <StatusFooter />
    </div>
  );
}
