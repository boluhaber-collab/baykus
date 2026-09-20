"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CriticalStockItem, apiFetch } from "@/lib/api";

export default function CriticalStockPage() {
  const [items, setItems] = useState<CriticalStockItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<CriticalStockItem[]>("/api/products/critical")
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : "Yükleme hatası"));
  }, []);

  return (
    <div>
      <div className="mb-6">
        <Link href="/stock" className="text-sm text-baykus-600 hover:underline">
          ← Stok
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">Kritik Stok</h1>
        <p className="text-slate-500 text-sm">Eşik altındaki ürün / varyantlar</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}

      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3">Ürün</th>
              <th className="px-4 py-3">Varyant</th>
              <th className="px-4 py-3">Kategori</th>
              <th className="px-4 py-3">Stok</th>
              <th className="px-4 py-3">Eşik</th>
              <th className="px-4 py-3">Depo</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr
                key={`${row.product_id}-${row.variant_id ?? "p"}`}
                className="border-t border-slate-100 bg-red-50/30"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/products/${row.product_id}`}
                    className="font-medium text-baykus-700 hover:underline"
                  >
                    {row.product_name}
                  </Link>
                  <div className="font-mono text-xs text-slate-400">{row.product_sku}</div>
                </td>
                <td className="px-4 py-3">
                  {row.variant_name || "—"}
                  {row.variant_sku && (
                    <div className="font-mono text-xs text-slate-400">{row.variant_sku}</div>
                  )}
                </td>
                <td className="px-4 py-3">{row.category || "—"}</td>
                <td className="px-4 py-3 font-semibold text-red-700">{row.stock_qty}</td>
                <td className="px-4 py-3">{row.critical_stock_threshold}</td>
                <td className="px-4 py-3">{row.warehouse || "—"}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Kritik stok kaydı yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
