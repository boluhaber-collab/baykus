"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Field,
  FilterBar,
  ReportHeader,
  ReportTable,
  SummaryCards,
  inputCls,
} from "@/components/reports/ReportChrome";
import {
  ORDER_STATUSES,
  ReportResponse,
  apiFetch,
  downloadReportCsv,
  formatMoney,
  statusBadgeClass,
} from "@/lib/api";

type SalesRow = {
  id: number;
  order_number: string;
  customer_name?: string | null;
  status: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  created_at?: string | null;
  due_date?: string | null;
};

function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export default function SalesReportPage() {
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(todayStr);
  const [status, setStatus] = useState("");
  const [data, setData] = useState<ReportResponse<SalesRow> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (dateFrom) p.set("date_from", dateFrom);
    if (dateTo) p.set("date_to", dateTo);
    if (status) p.set("status", status);
    return p.toString();
  }, [dateFrom, dateTo, status]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch<ReportResponse<SalesRow>>(`/api/reports/sales?${qs}`);
      setData(res);
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
  const byStatus = (s.by_status as { status: string; count: number; revenue: number }[]) || [];

  return (
    <div>
      <ReportHeader
        title="Satış raporu"
        subtitle="Siparişler — adet, ciro, durum (tarih aralığı)"
        actions={
          <>
            <button
              onClick={load}
              className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm"
              disabled={loading}
            >
              {loading ? "Yükleniyor…" : "Yenile"}
            </button>
            <button
              onClick={async () => {
                setCsvBusy(true);
                try {
                  await downloadReportCsv(`/api/reports/sales?${qs}`, "satis_raporu.csv");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "CSV hatası");
                } finally {
                  setCsvBusy(false);
                }
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
              disabled={csvBusy}
            >
              CSV indir
            </button>
            <button
              onClick={() => window.print()}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
            >
              Yazdır
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
        <Field label="Durum">
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tümü</option>
            {ORDER_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </Field>
        <button onClick={load} className="rounded-lg bg-baykus-600 text-white px-4 py-2 text-sm h-[38px]">
          Uygula
        </button>
      </FilterBar>

      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}

      <SummaryCards
        items={[
          { label: "Sipariş adedi", value: Number(s.order_count ?? 0) },
          { label: "Ciro (iptal hariç)", value: formatMoney(Number(s.revenue ?? 0)) },
          { label: "Kalan tahsilat", value: formatMoney(Number(s.remaining ?? 0)) },
          { label: "İptal", value: Number(s.cancelled_count ?? 0), accent: "border-red-200" },
        ]}
      />

      {byStatus.some((b) => b.count > 0) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {byStatus
            .filter((b) => b.count > 0)
            .map((b) => (
              <span
                key={b.status}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${statusBadgeClass(b.status)}`}
              >
                {b.status}: <strong>{b.count}</strong> · {formatMoney(b.revenue)}
              </span>
            ))}
        </div>
      )}

      <ReportTable
        headers={["Sipariş", "Müşteri", "Durum", "Tutar", "Ödenen", "Kalan", "Tarih", "Termin"]}
        colSpan={8}
        empty={!loading && (data?.rows.length ?? 0) === 0}
      >
        {(data?.rows || []).map((r) => (
          <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
            <td className="px-4 py-3 font-mono text-xs">{r.order_number}</td>
            <td className="px-4 py-3">{r.customer_name || "—"}</td>
            <td className="px-4 py-3">
              <span className={`rounded-full px-2 py-0.5 text-xs ${statusBadgeClass(r.status)}`}>
                {r.status}
              </span>
            </td>
            <td className="px-4 py-3 text-right tabular-nums">{formatMoney(r.total_amount)}</td>
            <td className="px-4 py-3 text-right tabular-nums text-slate-600">
              {formatMoney(r.paid_amount)}
            </td>
            <td className="px-4 py-3 text-right tabular-nums">{formatMoney(r.remaining_amount)}</td>
            <td className="px-4 py-3 text-slate-500">{(r.created_at || "").slice(0, 10)}</td>
            <td className="px-4 py-3 text-slate-500">{r.due_date || "—"}</td>
          </tr>
        ))}
      </ReportTable>
    </div>
  );
}
