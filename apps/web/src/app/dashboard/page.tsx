"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DashboardSummary,
  Product,
  apiFetch,
  formatMoney,
  statusBadgeClass,
} from "@/lib/api";
import { QUICK_ACTIONS } from "@/lib/nav";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Stock table filters (dense ERP style)
  const [fCat, setFCat] = useState("");
  const [fName, setFName] = useState("");
  const [fColor, setFColor] = useState("");
  const [fMinStock, setFMinStock] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [s, p] = await Promise.all([
        apiFetch<DashboardSummary>("/api/dashboard/summary"),
        apiFetch<Product[]>("/api/products"),
      ]);
      setData(s);
      setProducts(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const inStock = useMemo(() => {
    return products.filter((p) => {
      const qty = p.total_stock ?? p.stock_qty ?? 0;
      if (p.product_type === "hizmet") return false;
      if (qty <= 0) return false;
      if (fCat && !(p.category || "").toLowerCase().includes(fCat.toLowerCase())) return false;
      if (fName && !(p.name || "").toLowerCase().includes(fName.toLowerCase())) return false;
      if (fColor && !(p.brand || "").toLowerCase().includes(fColor.toLowerCase())) return false;
      if (fMinStock && qty < Number(fMinStock)) return false;
      return true;
    });
  }, [products, fCat, fName, fColor, fMinStock]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [products]);

  const todayLabel = new Date().toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
  });

  function clearFilters() {
    setFCat("");
    setFName("");
    setFColor("");
    setFMinStock("");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-lg font-bold text-baykus-text capitalize">{todayLabel}</div>
          <p className="text-xs text-baykus-muted">Baykuş Baskı · Ana Sayfa özeti</p>
        </div>
        <button onClick={load} className="bk-btn bk-btn-ghost text-xs">
          Yenile
        </button>
      </div>

      {error && (
        <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>
      )}
      {loading && !data && <p className="text-baykus-muted text-sm">Yükleniyor…</p>}

      {data && (
        <div className="flex flex-wrap gap-3 text-xs font-medium text-baykus-text">
          <span>
            BUGÜNKÜ SATIŞ:{" "}
            <strong className="tabular-nums">{formatMoney(Number(data.orders_today_revenue))}</strong>
          </span>
          <span className="text-baykus-line">|</span>
          <span>
            AÇIK SİPARİŞ: <strong>{data.open_orders}</strong>
          </span>
          <span className="text-baykus-line">|</span>
          <span>
            KRİTİK STOK: <strong className="text-red-700">{data.critical_stock_count}</strong>
          </span>
          <span className="text-baykus-line">|</span>
          <span>
            KASA: <strong className="tabular-nums">{formatMoney(Number(data.cash_balance))}</strong>
          </span>
        </div>
      )}

      {/* Hızlı işlemler */}
      <div>
        <div className="text-xs font-semibold text-baykus-muted mb-1.5 uppercase tracking-wide">
          Hızlı İşlemler
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.id}
              href={a.href}
              className={`rounded px-3 py-2 text-xs font-semibold text-white shadow-sm ${a.color}`}
            >
              {a.label}
            </Link>
          ))}
        </div>
      </div>

      {data && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/reports/sales" className="rounded border border-sky-200 bg-sky-50 px-3 py-2.5">
            <div className="text-[11px] text-sky-800">Bu ay ciro</div>
            <div className="text-lg font-bold text-sky-900 tabular-nums">
              {formatMoney(Number(data.orders_month_revenue))}
            </div>
            <div className="text-[11px] text-sky-700">{data.orders_month_count} sipariş</div>
          </Link>
          <Link href="/finance/cash" className="rounded border border-orange-200 bg-orange-50 px-3 py-2.5">
            <div className="text-[11px] text-orange-800">Güncel kasa</div>
            <div className="text-lg font-bold text-orange-900 tabular-nums">
              {formatMoney(Number(data.cash_balance))}
            </div>
          </Link>
          <Link href="/finance/banks" className="rounded border border-red-200 bg-red-50 px-3 py-2.5">
            <div className="text-[11px] text-red-800">Banka bakiyesi</div>
            <div className="text-lg font-bold text-red-900 tabular-nums">
              {formatMoney(Number(data.bank_balance))}
            </div>
          </Link>
          <Link href="/production" className="rounded border border-amber-200 bg-amber-50 px-3 py-2.5">
            <div className="text-[11px] text-amber-800">Bekleyen sipariş</div>
            <div className="text-lg font-bold text-amber-900">{data.open_orders}</div>
          </Link>
        </div>
      )}

      {data && (
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="lg:col-span-1 bk-card overflow-hidden">
            <div className="bg-baykus-navy text-white text-xs font-bold px-3 py-2">
              ÜRETİM / ATÖLYE
            </div>
            <div className="p-3 flex flex-wrap gap-1.5">
              {data.status_counts.map((s) => (
                <span
                  key={s.status}
                  className={`rounded px-2 py-1 text-[11px] ${statusBadgeClass(s.status)}`}
                >
                  {s.status}: <strong>{s.count}</strong>
                </span>
              ))}
            </div>
            <div className="px-3 pb-3 flex gap-2">
              <Link href="/orders/kanban" className="bk-btn bk-btn-primary text-xs">
                Üretim akışı
              </Link>
              <Link href="/production" className="bk-btn bk-btn-ghost text-xs">
                İş emirleri
              </Link>
            </div>
          </div>
          <Link
            href="/stock/critical"
            className="bk-card p-4 flex flex-col justify-center border-red-200 bg-red-50"
          >
            <div className="text-xs font-semibold text-red-800">KRİTİK STOK</div>
            <div className="text-3xl font-bold text-red-900">{data.critical_stock_count}</div>
          </Link>
          <Link href="/cari" className="bk-card p-4 flex flex-col justify-center border-orange-200 bg-orange-50">
            <div className="text-xs font-semibold text-orange-800">AÇIK ALACAKLAR</div>
            <div className="text-2xl font-bold text-orange-900 tabular-nums">
              {formatMoney(Number(data.receivables_total))}
            </div>
            <div className="text-[11px] text-orange-700">{data.receivables_customer_count} müşteri</div>
          </Link>
        </div>
      )}

      {/* Dense filter + stock table like desktop Ana Sayfa */}
      <div>
        <div className="text-sm font-semibold text-baykus-text mb-1.5">
          Stokta Var Olan Ürünler
        </div>
        <div className="bk-filter-bar">
          <select className="bk-input max-w-[160px]" value={fCat} onChange={(e) => setFCat(e.target.value)}>
            <option value="">Kategori</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            className="bk-input max-w-[200px]"
            placeholder="Ürün adı"
            value={fName}
            onChange={(e) => setFName(e.target.value)}
          />
          <input
            className="bk-input max-w-[140px]"
            placeholder="Marka / renk"
            value={fColor}
            onChange={(e) => setFColor(e.target.value)}
          />
          <input
            className="bk-input max-w-[120px]"
            placeholder="Min. stok"
            type="number"
            min={0}
            value={fMinStock}
            onChange={(e) => setFMinStock(e.target.value)}
          />
          <div className="flex-1" />
          <button type="button" className="bk-btn bk-btn-ghost" onClick={clearFilters}>
            Temizle
          </button>
          <button type="button" className="bk-btn bk-btn-primary" onClick={load}>
            Ara
          </button>
        </div>

        <div className="bk-table-wrap max-h-[420px]">
          <table className="bk-table">
            <thead>
              <tr>
                <th>Kategori</th>
                <th>Ürün Adı</th>
                <th>SKU</th>
                <th>Marka</th>
                <th className="text-right">Satış Fiyatı</th>
                <th>Depo</th>
                <th className="text-right">Stok Adedi</th>
              </tr>
            </thead>
            <tbody>
              {inStock.slice(0, 200).map((p) => {
                const qty = p.total_stock ?? p.stock_qty ?? 0;
                return (
                  <tr key={p.id}>
                    <td>{p.category || "—"}</td>
                    <td>
                      <Link href={`/products/${p.id}`} className="text-baykus-primary hover:underline font-medium">
                        {p.name}
                      </Link>
                    </td>
                    <td className="font-mono text-[11px]">{p.sku}</td>
                    <td>{p.brand || "—"}</td>
                    <td className="text-right tabular-nums">{formatMoney(Number(p.base_price))}</td>
                    <td>{p.warehouse || "Ana depo"}</td>
                    <td className="text-right font-semibold tabular-nums">{qty}</td>
                  </tr>
                );
              })}
              {inStock.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-baykus-muted py-8">
                    Stokta ürün yok veya filtreye uymuyor
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="text-[11px] text-baykus-muted mt-1">
          {inStock.length} ürün gösteriliyor
          {inStock.length > 200 ? " (ilk 200)" : ""}
        </div>
      </div>
    </div>
  );
}
