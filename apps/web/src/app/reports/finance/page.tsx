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
  BANK_TYPE_LABELS,
  CASH_TYPE_LABELS,
  ReportResponse,
  apiFetch,
  downloadReportCsv,
  formatMoney,
} from "@/lib/api";

type Row = {
  source: string;
  id: number;
  account_name?: string | null;
  movement_type: string;
  direction: string;
  amount: number;
  movement_date?: string | null;
  category?: string | null;
  note?: string | null;
  party_name?: string | null;
};

function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function FinanceReportPage() {
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(todayStr);
  const [source, setSource] = useState<"all" | "cash" | "bank">("all");
  const [data, setData] = useState<ReportResponse<Row> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (dateFrom) p.set("date_from", dateFrom);
    if (dateTo) p.set("date_to", dateTo);
    if (source !== "all") p.set("source", source);
    return p.toString();
  }, [dateFrom, dateTo, source]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await apiFetch<ReportResponse<Row>>(`/api/reports/finance?${qs}`));
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

  function typeLabel(source: string, t: string) {
    if (source === "cash") return CASH_TYPE_LABELS[t] || t;
    return BANK_TYPE_LABELS[t] || t;
  }

  return (
    <div>
      <ReportHeader
        title="Kasa / banka hareket raporu"
        subtitle="Finans hareketleri — tarih aralığı"
        actions={
          <>
            <button onClick={load} className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm" disabled={loading}>
              {loading ? "Yükleniyor…" : "Yenile"}
            </button>
            <button
              onClick={async () => {
                try {
                  await downloadReportCsv(`/api/reports/finance?${qs}`, "kasa_banka_hareket_raporu.csv");
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
        <Field label="Başlangıç">
          <input type="date" className={inputCls} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </Field>
        <Field label="Bitiş">
          <input type="date" className={inputCls} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </Field>
        <Field label="Kaynak">
          <select className={inputCls} value={source} onChange={(e) => setSource(e.target.value as "all" | "cash" | "bank")}>
            <option value="all">Tümü</option>
            <option value="cash">Kasa</option>
            <option value="bank">Banka</option>
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
          { label: "Hareket", value: Number(s.movement_count ?? 0) },
          { label: "Kasa net", value: formatMoney(Number(s.net_cash ?? 0)) },
          { label: "Banka net", value: formatMoney(Number(s.net_bank ?? 0)) },
          { label: "Toplam net", value: formatMoney(Number(s.net_total ?? 0)) },
        ]}
      />

      <ReportTable
        headers={["Kaynak", "Hesap", "Tip", "Yön", "Tutar", "Tarih", "Kategori", "Taraf", "Not"]}
        colSpan={9}
        empty={!loading && (data?.rows.length ?? 0) === 0}
      >
        {(data?.rows || []).map((r) => (
          <tr key={`${r.source}-${r.id}`} className="border-t border-slate-100 hover:bg-slate-50">
            <td className="px-4 py-3">{r.source === "cash" ? "Kasa" : "Banka"}</td>
            <td className="px-4 py-3">{r.account_name || "—"}</td>
            <td className="px-4 py-3">{typeLabel(r.source, r.movement_type)}</td>
            <td className="px-4 py-3">
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  r.direction === "in" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                }`}
              >
                {r.direction === "in" ? "Giriş" : "Çıkış"}
              </span>
            </td>
            <td className="px-4 py-3 text-right tabular-nums font-medium">{formatMoney(r.amount)}</td>
            <td className="px-4 py-3 text-slate-500">{r.movement_date || "—"}</td>
            <td className="px-4 py-3">{r.category || "—"}</td>
            <td className="px-4 py-3">{r.party_name || "—"}</td>
            <td className="px-4 py-3 text-slate-500 max-w-[12rem] truncate">{r.note || "—"}</td>
          </tr>
        ))}
      </ReportTable>
    </div>
  );
}
