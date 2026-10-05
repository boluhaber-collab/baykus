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
import { useDateSort } from "@/hooks/useDateSort";
import { formatTrDateTime } from "@/lib/dates";

type Row = {
  id: number;
  sku?: string | null;
  product_name?: string | null;
  variant_name?: string | null;
  quantity: number;
  direction?: string | null;
  movement_type?: string | null;
  warehouse?: string | null;
  note?: string | null;
  created_at?: string | null;
};

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function StockMovementsReportPage() {
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
      setData(await apiFetch<ReportResponse<Row>>(`/api/reports/stock-movements?${qs}`));
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

  const { dir: dateDir, setDir: setDateDir, sorted: sortedRows } = useDateSort(
    rows,
    (r) => r.created_at,
    (r) => r.id,
  );

  return (
    <div>
      <ReportHeader
        title="Stok Hareketleri"
        subtitle="Giriş / çıkış hareketleri · tarih filtre · CSV"
        actions={
          <>
            <button onClick={load} className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm" disabled={loading}>
              {loading ? "Yükleniyor…" : "Yenile"}
            </button>
            <button
              onClick={() =>
                downloadReportCsv(`/api/reports/stock-movements?${qs}`, "stok_hareketleri.csv").catch((e) =>
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
          { label: "Hareket", value: Number(s.count || 0), color: "#0284c7" },
          { label: "Giriş", value: Number(s.in_qty || 0), color: "#198754" },
          { label: "Çıkış", value: Number(s.out_qty || 0), color: "#be123c" },
        ]}
      />
      <Assumptions items={(s.assumptions as string[]) || []} />
      <ReportTable
        headers={["Tarih", "SKU", "Ürün", "Varyant", "Miktar", "Yön", "Neden", "Depo"]}
        colSpan={8}
        dateSort={{ dir: dateDir, onChange: setDateDir }}
        empty={sortedRows.length === 0}
      >
        {sortedRows.map((r) => (
          <tr key={r.id}>
            <td className="whitespace-nowrap">{formatTrDateTime(r.created_at)}</td>
            <td>{displaySku(r.sku)}</td>
            <td className="font-medium">{r.product_name || "—"}</td>
            <td>{r.variant_name || "—"}</td>
            <td className="tabular-nums font-semibold">{r.quantity}</td>
            <td>{r.direction || "—"}</td>
            <td>{r.movement_type || "—"}</td>
            <td>{r.warehouse || "—"}</td>
          </tr>
        ))}
      </ReportTable>
      <StatusFooter />
    </div>
  );
}
