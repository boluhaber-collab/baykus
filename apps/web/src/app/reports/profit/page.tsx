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
import { ReportResponse, apiFetch, downloadReportCsv, formatMoney } from "@/lib/api";

type Row = {
  section?: string;
  kind: string;
  ref: string;
  date?: string | null;
  status?: string;
  supplier?: string | null;
  amount: number;
};

export default function ProfitReportPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<ReportResponse<Row> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("year", String(year));
    p.set("month", String(month));
    return p.toString();
  }, [year, month]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await apiFetch<ReportResponse<Row>>(`/api/reports/profit?${qs}`));
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
  const gross = Number(s.gross_approx ?? 0);

  return (
    <div>
      <ReportHeader
        title="Kâr Analizi"
        subtitle="Masaüstü Kâr Analizi paneli · dönem cirosu − onaylı alış maliyeti (yaklaşık brüt kâr)"
        actions={
          <>
            <button onClick={load} className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm" disabled={loading}>
              {loading ? "Yükleniyor…" : "Yenile"}
            </button>
            <button
              onClick={async () => {
                try {
                  await downloadReportCsv(
                    `/api/reports/profit?${qs}`,
                    `kar_ozeti_${year}_${String(month).padStart(2, "0")}.csv`,
                  );
                } catch (e) {
                  setError(e instanceof Error ? e.message : "CSV hatası");
                }
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
            >
              CSV indir
            </button>
          </>
        }
      />

      <FilterBar>
        <Field label="Yıl">
          <input
            type="number"
            className={inputCls}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            min={2020}
            max={2100}
          />
        </Field>
        <Field label="Ay">
          <select className={inputCls} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <button onClick={load} className="rounded-lg bg-baykus-600 text-white px-4 py-2 text-sm h-[38px]">
          Uygula
        </button>
      </FilterBar>

      <Assumptions items={(s.assumptions as string[]) || []} />
      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}

      <SummaryCards
        items={[
          { label: "Ciro (iptal hariç)", value: formatMoney(Number(s.revenue ?? 0)) },
          { label: "Onaylı satın alma", value: formatMoney(Number(s.purchase_costs ?? 0)) },
          {
            label: "Kar yaklaşımı",
            value: formatMoney(gross),
            accent: gross >= 0 ? "border-emerald-200" : "border-red-200",
          },
          {
            label: "Sipariş / SA",
            value: `${Number(s.order_count ?? 0)} / ${Number(s.confirmed_purchase_count ?? 0)}`,
          },
        ]}
      />

      <ReportTable
        headers={["Bölüm", "Ref", "Tarih", "Durum / Tedarikçi", "Tutar"]}
        colSpan={5}
        empty={!loading && (data?.rows.length ?? 0) === 0}
      >
        {(data?.rows || []).map((r, idx) => (
          <tr key={`${r.kind}-${r.ref}-${idx}`} className="border-t border-slate-100 hover:bg-slate-50">
            <td className="px-4 py-3">{r.section || (r.kind === "order" ? "Satış" : "Satın alma")}</td>
            <td className="px-4 py-3 font-mono text-xs">{r.ref}</td>
            <td className="px-4 py-3 text-slate-500">{r.date || "—"}</td>
            <td className="px-4 py-3">{r.status || r.supplier || "—"}</td>
            <td className="px-4 py-3 text-right tabular-nums font-medium">{formatMoney(r.amount)}</td>
          </tr>
        ))}
      </ReportTable>
    </div>
  );
}
