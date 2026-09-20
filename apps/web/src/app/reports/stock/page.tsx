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
import {
  ReportResponse,
  apiFetch,
  downloadReportCsv,
  formatMoney,
} from "@/lib/api";

type StockRow = {
  product_id: number;
  sku: string;
  name: string;
  variant_id?: number | null;
  variant_name?: string | null;
  category?: string | null;
  warehouse?: string | null;
  qty: number;
  threshold: number;
  is_critical: boolean;
  unit_cost: number;
  unit_sale: number;
  value: number;
  value_basis: string;
};

export default function StockReportPage() {
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [valueBasis, setValueBasis] = useState<"cost" | "sale">("cost");
  const [data, setData] = useState<ReportResponse<StockRow> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("value_basis", valueBasis);
    if (criticalOnly) p.set("critical_only", "true");
    return p.toString();
  }, [criticalOnly, valueBasis]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await apiFetch<ReportResponse<StockRow>>(`/api/reports/stock?${qs}`));
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
  const assumptions = (s.assumptions as string[]) || [];

  return (
    <div>
      <ReportHeader
        title="Stok raporu"
        subtitle="Ürün / varyant miktar, değer tahmini, kritik bayrak"
        actions={
          <>
            <button onClick={load} className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm" disabled={loading}>
              {loading ? "Yükleniyor…" : "Yenile"}
            </button>
            <button
              onClick={async () => {
                try {
                  await downloadReportCsv(`/api/reports/stock?${qs}`, "stok_raporu.csv");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "CSV hatası");
                }
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
            >
              CSV indir
            </button>
            <button onClick={() => window.print()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
              Yazdır
            </button>
          </>
        }
      />

      <FilterBar>
        <Field label="Değer baz">
          <select className={inputCls} value={valueBasis} onChange={(e) => setValueBasis(e.target.value as "cost" | "sale")}>
            <option value="cost">Maliyet / alış</option>
            <option value="sale">Satış fiyatı</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700 h-[38px] mt-4">
          <input type="checkbox" checked={criticalOnly} onChange={(e) => setCriticalOnly(e.target.checked)} />
          Sadece kritik
        </label>
        <button onClick={load} className="rounded-lg bg-baykus-600 text-white px-4 py-2 text-sm h-[38px]">
          Uygula
        </button>
      </FilterBar>

      <Assumptions items={assumptions} />
      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}

      <SummaryCards
        items={[
          { label: "Satır", value: Number(s.row_count ?? 0) },
          { label: "Toplam miktar", value: Number(s.total_qty ?? 0) },
          {
            label: valueBasis === "cost" ? "Değer (maliyet)" : "Değer (satış)",
            value: formatMoney(Number(s.total_value ?? 0)),
          },
          { label: "Kritik kalem", value: Number(s.critical_count ?? 0), accent: "border-red-200" },
        ]}
      />

      <ReportTable
        headers={["SKU", "Ürün", "Varyant", "Kategori", "Depo", "Miktar", "Eşik", "Kritik", "Birim", "Değer"]}
        colSpan={10}
        empty={!loading && (data?.rows.length ?? 0) === 0}
      >
        {(data?.rows || []).map((r) => (
          <tr key={`${r.product_id}-${r.variant_id ?? 0}-${r.sku}`} className="border-t border-slate-100 hover:bg-slate-50">
            <td className="px-4 py-3 font-mono text-xs">{r.sku}</td>
            <td className="px-4 py-3 font-medium">{r.name}</td>
            <td className="px-4 py-3 text-slate-600">{r.variant_name || "—"}</td>
            <td className="px-4 py-3">{r.category || "—"}</td>
            <td className="px-4 py-3">{r.warehouse || "—"}</td>
            <td className={`px-4 py-3 text-right tabular-nums ${r.is_critical ? "text-red-700 font-semibold" : ""}`}>
              {r.qty}
            </td>
            <td className="px-4 py-3 text-right">{r.threshold}</td>
            <td className="px-4 py-3">
              {r.is_critical ? (
                <span className="rounded-full bg-red-100 text-red-800 px-2 py-0.5 text-xs">Kritik</span>
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </td>
            <td className="px-4 py-3 text-right tabular-nums text-slate-600">
              {formatMoney(valueBasis === "cost" ? r.unit_cost : r.unit_sale)}
            </td>
            <td className="px-4 py-3 text-right tabular-nums font-medium">{formatMoney(r.value)}</td>
          </tr>
        ))}
      </ReportTable>
    </div>
  );
}
