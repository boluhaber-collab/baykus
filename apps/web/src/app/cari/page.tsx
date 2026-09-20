"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ReceivableItem, apiFetch, downloadReportCsv, formatMoney } from "@/lib/api";

export default function CariReceivablesPage() {
  const [items, setItems] = useState<ReceivableItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [minBalance, setMinBalance] = useState("");
  const [csvBusy, setCsvBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<ReceivableItem[]>("/api/customers/receivables");
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = items;
    const needle = q.trim().toLocaleLowerCase("tr");
    if (needle) {
      list = list.filter((i) =>
        [i.code, i.name, i.company, i.city, i.phone].join(" ").toLocaleLowerCase("tr").includes(needle),
      );
    }
    const min = Number(minBalance);
    if (minBalance !== "" && Number.isFinite(min)) {
      list = list.filter((i) => Number(i.balance) >= min);
    }
    return list;
  }, [items, q, minBalance]);

  const total = filtered.reduce((s, i) => s + Number(i.balance), 0);

  async function exportCsv() {
    setCsvBusy(true);
    try {
      await downloadReportCsv("/api/reports/receivables", "cari_alacaklar.csv");
    } catch (e) {
      setError(e instanceof Error ? e.message : "CSV hatası");
    } finally {
      setCsvBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cari / Açık Alacaklar</h1>
          <p className="text-slate-500 text-sm">Bakiyesi 0&apos;dan büyük müşteriler · filtre + CSV</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/customers" className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
            Müşteriler
          </Link>
          <Link href="/reports/receivables" className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
            Alacak raporu
          </Link>
          <button
            onClick={exportCsv}
            disabled={csvBusy}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            CSV
          </button>
          <button onClick={() => window.print()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
            Yazdır
          </button>
          <button onClick={load} className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm">
            Yenile
          </button>
        </div>
      </div>

      <div className="mb-4 grid sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="text-xs text-amber-800">Toplam açık alacak</div>
          <div className="text-xl font-bold text-amber-900 tabular-nums">{formatMoney(total)}</div>
        </div>
        <div className="rounded-xl border bg-white px-5 py-4">
          <div className="text-xs text-slate-500">Müşteri</div>
          <div className="text-xl font-bold">{filtered.length}</div>
        </div>
        <div className="rounded-xl border bg-white px-5 py-4 flex flex-col gap-2 justify-center">
          <input
            className="bk-input"
            placeholder="Ara…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <input
            className="bk-input"
            placeholder="Min bakiye"
            value={minBalance}
            onChange={(e) => setMinBalance(e.target.value)}
          />
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3">Kod</th>
              <th className="px-4 py-3">Müşteri</th>
              <th className="px-4 py-3">Firma</th>
              <th className="px-4 py-3">Şehir</th>
              <th className="px-4 py-3">Telefon</th>
              <th className="px-4 py-3">Son hareket</th>
              <th className="px-4 py-3 text-right">Bakiye</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.customer_id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.code || "—"}</td>
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3 text-slate-600">{r.company || "—"}</td>
                <td className="px-4 py-3">{r.city || "—"}</td>
                <td className="px-4 py-3">{r.phone || "—"}</td>
                <td className="px-4 py-3 text-slate-500">{r.last_movement_date || "—"}</td>
                <td className="px-4 py-3 text-right font-medium text-amber-700 tabular-nums">
                  {formatMoney(Number(r.balance))}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/customers/${r.customer_id}`} className="text-baykus-600 hover:underline">
                    Ekstre
                  </Link>
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  Açık alacak yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
