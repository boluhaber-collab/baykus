"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PayableItem, apiFetch, formatMoney } from "@/lib/api";

export default function PayablesPage() {
  const [items, setItems] = useState<PayableItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await apiFetch<PayableItem[]>("/api/suppliers/payables"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr");
    if (!needle) return items;
    return items.filter((i) =>
      [i.name, i.code, i.city, i.phone].join(" ").toLocaleLowerCase("tr").includes(needle),
    );
  }, [items, q]);

  const total = filtered.reduce((s, i) => s + Number(i.balance || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Borçlar</h1>
          <p className="text-slate-500 text-sm">Tedarik Merkezi › Borç-Alacak · açık tedarikçi borçları</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/suppliers" className="bk-btn text-xs text-white" style={{ background: "#0f766e" }}>
            Tedarikçiler
          </Link>
          <Link href="/suppliers/payables" className="bk-btn text-xs text-white" style={{ background: "#7c3aed" }}>
            Borç-Alacak
          </Link>
          <Link href="/purchases/new" className="bk-btn text-xs text-white" style={{ background: "#be123c" }}>
            Satın Alma Talebi
          </Link>
          <Link href="/finance/open-balances" className="bk-btn bk-btn-ghost text-xs">
            Açık Bakiyeler
          </Link>
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={load}>
            Yenile
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}

      <div className="mb-1 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs text-amber-800">Toplam açık borç</div>
          <div className="text-2xl font-bold text-amber-900 tabular-nums">{formatMoney(total)}</div>
          <div className="text-xs text-amber-700 mt-1">
            {filtered.length} tedarikçi{q ? " (filtreli)" : ""}
          </div>
        </div>
        <input
          className="bk-input min-w-[200px]"
          placeholder="Ara (ad, kod, şehir…)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3">Kod</th>
              <th className="px-4 py-3">Tedarikçi</th>
              <th className="px-4 py-3">Şehir</th>
              <th className="px-4 py-3">Telefon</th>
              <th className="px-4 py-3">Son hareket</th>
              <th className="px-4 py-3 text-right">Borç</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={i.supplier_id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{i.code || "—"}</td>
                <td className="px-4 py-3 font-medium">
                  <Link href={`/suppliers/${i.supplier_id}`} className="text-baykus-700 hover:underline">
                    {i.name}
                  </Link>
                </td>
                <td className="px-4 py-3">{i.city || "—"}</td>
                <td className="px-4 py-3">{i.phone || "—"}</td>
                <td className="px-4 py-3 text-slate-500">{i.last_movement_date || "—"}</td>
                <td className="px-4 py-3 text-right font-medium tabular-nums text-amber-700">
                  {formatMoney(Number(i.balance))}
                </td>
                <td className="px-4 py-3 text-xs">
                  <Link href={`/purchases/new?supplier_id=${i.supplier_id}`} className="text-baykus-primary hover:underline">
                    Alış
                  </Link>
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Açık borç yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
