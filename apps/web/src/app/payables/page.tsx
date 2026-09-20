"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PayableItem, apiFetch, formatMoney } from "@/lib/api";

export default function PayablesPage() {
  const [items, setItems] = useState<PayableItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch<PayableItem[]>("/api/suppliers/payables")
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : "Yükleme hatası"))
      .finally(() => setLoading(false));
  }, []);

  const total = items.reduce((s, i) => s + Number(i.balance || 0), 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Borçlar</h1>
          <p className="text-slate-500 text-sm">Açık tedarikçi borçları (payable)</p>
        </div>
        <Link href="/suppliers" className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
          Tedarikçiler
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}

      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
        <div className="text-xs text-amber-800">Toplam açık borç</div>
        <div className="text-2xl font-bold text-amber-900 tabular-nums">{formatMoney(total)}</div>
        <div className="text-xs text-amber-700 mt-1">{items.length} tedarikçi</div>
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
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
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
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
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
