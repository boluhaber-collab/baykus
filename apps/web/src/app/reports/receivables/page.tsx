"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Assumptions,
  FilterBar,
  ReportHeader,
  ReportTable,
  SummaryCards,
} from "@/components/reports/ReportChrome";
import { ReportResponse, apiFetch, downloadReportCsv, formatMoney } from "@/lib/api";

type Row = {
  customer_id: number;
  code?: string | null;
  name: string;
  company?: string | null;
  phone?: string | null;
  city?: string | null;
  opening_balance: number;
  debit_sum: number;
  credit_sum: number;
  balance: number;
  last_movement_date?: string | null;
};

export default function ReceivablesReportPage() {
  const [includeZero, setIncludeZero] = useState(false);
  const [data, setData] = useState<ReportResponse<Row> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (includeZero) p.set("include_zero", "true");
    return p.toString();
  }, [includeZero]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const path = qs ? `/api/reports/receivables?${qs}` : "/api/reports/receivables";
      setData(await apiFetch<ReportResponse<Row>>(path));
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

  return (
    <div>
      <ReportHeader
        title="Cari / alacak raporu"
        subtitle="Müşteri bakiyeleri ve toplam alacak"
        actions={
          <>
            <button onClick={load} className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm" disabled={loading}>
              {loading ? "Yükleniyor…" : "Yenile"}
            </button>
            <button
              onClick={async () => {
                try {
                  const path = qs ? `/api/reports/receivables?${qs}` : "/api/reports/receivables";
                  await downloadReportCsv(path, "cari_alacak_raporu.csv");
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
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={includeZero} onChange={(e) => setIncludeZero(e.target.checked)} />
          Sıfır bakiyeleri de göster
        </label>
        <button onClick={load} className="rounded-lg bg-baykus-600 text-white px-4 py-2 text-sm">
          Uygula
        </button>
      </FilterBar>

      <Assumptions items={(s.assumptions as string[]) || []} />
      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}

      <SummaryCards
        items={[
          { label: "Müşteri", value: Number(s.customer_count ?? 0) },
          { label: "Açık alacaklı", value: Number(s.with_positive_balance ?? 0) },
          { label: "Toplam alacak", value: formatMoney(Number(s.total_receivables ?? 0)), accent: "border-amber-200" },
          { label: "Net", value: formatMoney(Number(s.net ?? 0)) },
        ]}
      />

      <ReportTable
        headers={["Kod", "Müşteri", "Firma", "Şehir", "Telefon", "Açılış", "Borç", "Alacak", "Bakiye", "Son hareket", ""]}
        colSpan={11}
        empty={!loading && (data?.rows.length ?? 0) === 0}
      >
        {(data?.rows || []).map((r) => (
          <tr key={r.customer_id} className="border-t border-slate-100 hover:bg-slate-50">
            <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.code || "—"}</td>
            <td className="px-4 py-3 font-medium">{r.name}</td>
            <td className="px-4 py-3 text-slate-600">{r.company || "—"}</td>
            <td className="px-4 py-3">{r.city || "—"}</td>
            <td className="px-4 py-3">{r.phone || "—"}</td>
            <td className="px-4 py-3 text-right tabular-nums">{formatMoney(r.opening_balance)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{formatMoney(r.debit_sum)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{formatMoney(r.credit_sum)}</td>
            <td className="px-4 py-3 text-right tabular-nums font-medium text-amber-700">
              {formatMoney(r.balance)}
            </td>
            <td className="px-4 py-3 text-slate-500">{r.last_movement_date || "—"}</td>
            <td className="px-4 py-3 text-right">
              <Link href={`/customers/${r.customer_id}`} className="text-baykus-600 hover:underline text-xs">
                Ekstre
              </Link>
            </td>
          </tr>
        ))}
      </ReportTable>
    </div>
  );
}
