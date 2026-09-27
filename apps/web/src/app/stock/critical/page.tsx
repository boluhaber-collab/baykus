"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CriticalStockItem, apiFetch, formatMoney } from "@/lib/api";
import { displaySku } from "@/lib/productLabel";
import StatusFooter from "@/components/StatusFooter";

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
    <div className="space-y-2 pb-2">
      <div className="bk-sticky-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] text-baykus-muted mb-0.5">
            <Link href="/stock" className="hover:underline text-baykus-primary">Stok</Link>
            <span className="mx-1">/</span>
            <span>Kritik Stok</span>
          </div>
          <h1 className="text-lg font-bold text-baykus-text leading-tight">Kritik Stok</h1>
          <p className="text-baykus-muted text-[11px]">Eşik altı ürün / varyant</p>
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

      <div className="bk-kpi-strip" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <div className="bk-kpi-card" style={{ backgroundColor: "#be123c" }}>
          <span className="bk-kpi-icon">⚠</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Kritik kayıt</div>
            <div className="bk-kpi-value">{filtered.length}</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#f59e0b" }}>
          <span className="bk-kpi-icon">0</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Sıfır / eksi</div>
            <div className="bk-kpi-value">{zeroCount}</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#334155" }}>
          <span className="bk-kpi-icon">☰</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Toplam ham</div>
            <div className="bk-kpi-value">{items.length}</div>
          </div>
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

      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Ürün</th>
              <th>Varyant</th>
              <th>Tedarikçi</th>
              <th>Kategori</th>
              <th className="text-right">Stok</th>
              <th className="text-right">Eşik</th>
              <th className="text-right">Alış</th>
              <th>Depo</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={`${row.product_id}-${row.variant_id ?? "p"}`}
                className="bg-red-50/30"
              >
                <td className="">
                  <Link
                    href={`/products/${row.product_id}`}
                    className="font-medium text-baykus-700 hover:underline"
                  >
                    {row.product_name}
                  </Link>
                  {displaySku(row.product_sku) && (
                    <div className="font-mono text-xs text-slate-400">{displaySku(row.product_sku)}</div>
                  )}
                </td>
                <td className="">
                  {row.variant_name || "—"}
                  {displaySku(row.variant_sku) && (
                    <div className="font-mono text-xs text-slate-400">{displaySku(row.variant_sku)}</div>
                  )}
                </td>
                <td className="text-xs">{row.supplier_name || "—"}</td>
                <td className="">{row.category || "—"}</td>
                <td className="text-right font-semibold text-red-700 tabular-nums">{row.stock_qty}</td>
                <td className="text-right tabular-nums">{row.critical_stock_threshold}</td>
                <td className="text-right tabular-nums text-xs">
                  {formatMoney(Number(row.purchase_price || 0))}
                </td>
                <td className="">{row.warehouse || "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-baykus-muted py-6">
                  Kritik stok kaydı yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <StatusFooter onRefresh={load} />
    </div>
  );
}
