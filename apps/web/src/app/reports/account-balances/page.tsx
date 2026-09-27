"use client";

import Link from "next/link";
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
  kind: string;
  id: number;
  name: string;
  currency: string;
  balance: number;
  is_active: boolean;
  account_type?: string | null;
};

export default function AccountBalancesPage() {
  const [data, setData] = useState<ReportResponse<Row> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await apiFetch<ReportResponse<Row>>("/api/reports/account-balances"));
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
        title="Hesap Bakiyeleri"
        subtitle="Kasa / banka / POS bakiyeleri"
        actions={
          <>
            <Link href="/finance/banks" className="rounded-lg bg-teal-700 text-white px-4 py-2 text-sm">
              Hesaplarım
            </Link>
            <button onClick={load} className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm" disabled={loading}>
              {loading ? "Yükleniyor…" : "Yenile"}
            </button>
            <button
              onClick={() =>
                downloadReportCsv("/api/reports/account-balances", "hesap_bakiyeleri.csv").catch((e) =>
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
      {error && <div className="mb-3 rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      <SummaryCards
        items={[
          { label: "Hesap", value: Number(s.count || 0), color: "#0f766e" },
          { label: "Kasa", value: formatMoney(Number(s.cash_total || 0)), color: "#198754" },
          { label: "Banka", value: formatMoney(Number(s.bank_total || 0)), color: "#1e40af" },
          { label: "Toplam", value: formatMoney(Number(s.grand_total || 0)), color: "#7c3aed" },
        ]}
      />
      <Assumptions items={(s.assumptions as string[]) || []} />
      <ReportTable headers={["Tür", "Ad", "Para birimi", "Bakiye", "Durum"]} colSpan={5} empty={rows.length === 0}>
        {rows.map((r) => (
          <tr key={`${r.kind}-${r.id}`}>
            <td>{r.kind === "cash" ? "Kasa" : "Banka"}</td>
            <td className="font-medium">{r.name}</td>
            <td>{r.currency}</td>
            <td className="text-right tabular-nums font-semibold">{formatMoney(r.balance)}</td>
            <td>{r.is_active ? "Aktif" : "Pasif"}</td>
          </tr>
        ))}
      </ReportTable>
      <StatusFooter />
    </div>
  );
}
