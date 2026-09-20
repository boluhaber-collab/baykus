"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, formatMoney } from "@/lib/api";

type Party = {
  kind: string;
  party_id: number;
  name: string;
  code: string | null;
  balance: number;
  href: string;
};

type OpenBalances = {
  receivables_total: number;
  payables_total: number;
  net: number;
  receivables_count: number;
  payables_count: number;
  receivables: Party[];
  payables: Party[];
};

export default function OpenBalancesPage() {
  const [data, setData] = useState<OpenBalances | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await apiFetch<OpenBalances>("/api/finance/open-balances"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Açık Bakiyeler</h2>
          <p className="text-xs text-baykus-muted">Müşteri alacakları + tedarikçi borçları</p>
        </div>
        <div className="flex gap-2 text-xs">
          <Link href="/customers/receivables" className="bk-btn bk-btn-ghost">
            Alacaklar
          </Link>
          <Link href="/suppliers/payables" className="bk-btn bk-btn-ghost">
            Borçlar
          </Link>
        </div>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      {data && (
        <div className="grid md:grid-cols-3 gap-3">
          <div className="rounded border bg-white p-3">
            <div className="text-[11px] text-baykus-muted">Alacak toplam</div>
            <div className="text-xl font-bold text-emerald-700 tabular-nums">
              {formatMoney(data.receivables_total)}
            </div>
            <div className="text-[11px] text-baykus-muted">{data.receivables_count} cari</div>
          </div>
          <div className="rounded border bg-white p-3">
            <div className="text-[11px] text-baykus-muted">Borç toplam</div>
            <div className="text-xl font-bold text-rose-700 tabular-nums">
              {formatMoney(data.payables_total)}
            </div>
            <div className="text-[11px] text-baykus-muted">{data.payables_count} tedarikçi</div>
          </div>
          <div className="rounded border bg-white p-3">
            <div className="text-[11px] text-baykus-muted">Net</div>
            <div className="text-xl font-bold tabular-nums">{formatMoney(data.net)}</div>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-semibold mb-1.5">Alacaklar</h3>
          <div className="bk-table-wrap">
            <table className="bk-table">
              <thead>
                <tr>
                  <th>Müşteri</th>
                  <th className="text-right">Bakiye</th>
                </tr>
              </thead>
              <tbody>
                {(data?.receivables || []).map((r) => (
                  <tr key={r.party_id}>
                    <td>
                      <Link href={r.href} className="text-baykus-primary hover:underline">
                        {r.name}
                      </Link>
                    </td>
                    <td className="text-right tabular-nums">{formatMoney(r.balance)}</td>
                  </tr>
                ))}
                {(data?.receivables || []).length === 0 && (
                  <tr>
                    <td colSpan={2} className="text-center text-baykus-muted py-6">
                      Açık alacak yok
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold mb-1.5">Borçlar</h3>
          <div className="bk-table-wrap">
            <table className="bk-table">
              <thead>
                <tr>
                  <th>Tedarikçi</th>
                  <th className="text-right">Bakiye</th>
                </tr>
              </thead>
              <tbody>
                {(data?.payables || []).map((r) => (
                  <tr key={r.party_id}>
                    <td>
                      <Link href={r.href} className="text-baykus-primary hover:underline">
                        {r.name}
                      </Link>
                    </td>
                    <td className="text-right tabular-nums">{formatMoney(r.balance)}</td>
                  </tr>
                ))}
                {(data?.payables || []).length === 0 && (
                  <tr>
                    <td colSpan={2} className="text-center text-baykus-muted py-6">
                      Açık borç yok
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
