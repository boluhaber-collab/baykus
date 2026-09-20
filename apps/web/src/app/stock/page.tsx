"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type StockSummary = {
  total_skus: number;
  active_skus: number;
  critical_count: number;
  low_stock: {
    product_id: number;
    sku: string;
    name: string;
    qty: number;
    threshold: number;
  }[];
};

export default function StockPage() {
  const [summary, setSummary] = useState<StockSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<StockSummary>("/api/products/stock-summary")
      .then(setSummary)
      .catch((e) => setError(e instanceof Error ? e.message : "Yükleme hatası"));
  }, []);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Stok</h1>
          <p className="text-slate-500 text-sm">Özet ve kritik kalemler</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/stock/critical"
            className="rounded-lg border border-red-200 text-red-700 px-4 py-2 text-sm hover:bg-red-50"
          >
            Kritik liste
          </Link>
          <Link
            href="/products"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Ürünler
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}

      {summary && (
        <>
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-500">Toplam SKU</div>
              <div className="text-2xl font-bold">{summary.total_skus}</div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-500">Aktif</div>
              <div className="text-2xl font-bold">{summary.active_skus}</div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-500">Kritik</div>
              <div className="text-2xl font-bold text-red-600">{summary.critical_count}</div>
            </div>
          </div>

          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-slate-50 font-medium text-sm">Düşük / kritik stok</div>
            <table className="min-w-full text-sm">
              <thead className="text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Ad</th>
                  <th className="px-4 py-3">Miktar</th>
                  <th className="px-4 py-3">Eşik</th>
                </tr>
              </thead>
              <tbody>
                {summary.low_stock.map((row) => (
                  <tr key={`${row.product_id}-${row.sku}`} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link href={`/products/${row.product_id}`} className="text-baykus-600 hover:underline">
                        {row.sku}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{row.name}</td>
                    <td className="px-4 py-3 text-red-700 font-semibold">{row.qty}</td>
                    <td className="px-4 py-3">{row.threshold}</td>
                  </tr>
                ))}
                {summary.low_stock.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                      Kritik stok yok
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
