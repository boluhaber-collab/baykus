"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CriticalStockItem, apiFetch, formatMoney } from "@/lib/api";

export default function CriticalStockPage() {
  const [items, setItems] = useState<CriticalStockItem[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [warehouse, setWarehouse] = useState("Tümü");

  const load = useCallback(async () => {
    setError("");
    try {
      setItems(await apiFetch<CriticalStockItem[]>("/api/products/critical"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const warehouses = useMemo(() => {
    const set = new Set<string>();
    for (const r of items) if (r.warehouse) set.add(r.warehouse);
    return ["Tümü", ...[...set].sort((a, b) => a.localeCompare(b, "tr"))];
  }, [items]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr");
    return items.filter((r) => {
      if (warehouse !== "Tümü" && (r.warehouse || "") !== warehouse) return false;
      if (!needle) return true;
      const hay = [r.product_name, r.product_sku, r.variant_name, r.category, r.supplier_name, r.warehouse]
        .join(" ")
        .toLocaleLowerCase("tr");
      return hay.includes(needle);
    });
  }, [items, q, warehouse]);

  const zeroCount = filtered.filter((r) => r.stock_qty <= 0).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href="/stock" className="text-sm text-baykus-600 hover:underline">
            ← Stok
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Kritik Stok</h1>
          <p className="text-slate-500 text-sm">Ürün & Stok Merkezi › Kritik Stok · eşik altı ürün / varyant</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/products" className="bk-btn bk-btn-ghost text-xs" style={{ background: "#06b6d4", color: "#fff" }}>
            Ürün Yönetimi
          </Link>
          <Link href="/stock" className="bk-btn bk-btn-ghost text-xs" style={{ background: "#0f766e", color: "#fff" }}>
            Stok Yönetimi
          </Link>
          <Link href="/purchases/new" className="bk-btn text-xs text-white" style={{ background: "#be123c" }}>
            Satın Alma Talebi
          </Link>
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={load}>
            Yenile
          </button>
        </div>
      </div>

      {error && <div className="mb-2 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}

      <div className="grid sm:grid-cols-3 gap-2">
        <div className="rounded border bg-red-50 border-red-200 px-3 py-2">
          <div className="text-[11px] text-red-800">Kritik kayıt</div>
          <div className="text-xl font-bold text-red-900">{filtered.length}</div>
        </div>
        <div className="rounded border bg-amber-50 border-amber-200 px-3 py-2">
          <div className="text-[11px] text-amber-800">Sıfır / eksi stok</div>
          <div className="text-xl font-bold text-amber-900">{zeroCount}</div>
        </div>
        <div className="rounded border bg-slate-50 border-slate-200 px-3 py-2">
          <div className="text-[11px] text-slate-600">Toplam (filtre öncesi)</div>
          <div className="text-xl font-bold text-slate-900">{items.length}</div>
        </div>
      </div>

      <div className="bk-filter-bar">
        <input
          className="bk-input min-w-[200px]"
          placeholder="Ara (ürün, tedarikçi, SKU…)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="bk-input max-w-[180px]" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
          {warehouses.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3">Ürün</th>
              <th className="px-4 py-3">Varyant</th>
              <th className="px-4 py-3">Tedarikçi</th>
              <th className="px-4 py-3">Kategori</th>
              <th className="px-4 py-3 text-right">Stok</th>
              <th className="px-4 py-3 text-right">Eşik</th>
              <th className="px-4 py-3 text-right">Alış</th>
              <th className="px-4 py-3">Depo</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
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
                <td className="px-4 py-3 text-xs">{row.supplier_name || "—"}</td>
                <td className="px-4 py-3">{row.category || "—"}</td>
                <td className="px-4 py-3 text-right font-semibold text-red-700 tabular-nums">{row.stock_qty}</td>
                <td className="px-4 py-3 text-right tabular-nums">{row.critical_stock_threshold}</td>
                <td className="px-4 py-3 text-right tabular-nums text-xs">
                  {formatMoney(Number(row.purchase_price || 0))}
                </td>
                <td className="px-4 py-3">{row.warehouse || "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
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
