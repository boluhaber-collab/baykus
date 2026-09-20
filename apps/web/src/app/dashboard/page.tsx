"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  BANK_TYPE_LABELS,
  CASH_TYPE_LABELS,
  DashboardSummary,
  apiFetch,
  formatMoney,
  statusBadgeClass,
} from "@/lib/api";

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function financeTypeLabel(source: string, t: string) {
  if (source === "cash") return CASH_TYPE_LABELS[t] || t;
  return BANK_TYPE_LABELS[t] || t;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const s = await apiFetch<DashboardSummary>("/api/dashboard/summary");
      setData(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-baykus-text mb-1">Gösterge Paneli</h1>
          <p className="text-baykus-muted text-sm">Baykuş Baskı operasyon özeti · canlı veriler</p>
        </div>
        <button onClick={load} className="bk-btn-ghost text-sm">
          Yenile
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <Link href="/orders/new" className="bk-btn-primary text-sm">+ Yeni sipariş</Link>
        <Link href="/quotes/new" className="bk-btn-ghost text-sm">+ Yeni teklif</Link>
        <Link href="/cari" className="bk-btn-ghost text-sm">Tahsilat / Cari</Link>
        <Link href="/orders/kanban" className="bk-btn-ghost text-sm">Kanban</Link>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}
      {loading && !data && <p className="text-baykus-muted text-sm mb-4">Yükleniyor…</p>}

      {data && (
        <>
          {/* KPI cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mb-6">
            <Link
              href="/orders"
              className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 hover:shadow-sm transition"
            >
              <div className="text-xs text-sky-800">Bugün sipariş</div>
              <div className="mt-0.5 text-xl font-bold text-sky-900">{data.orders_today_count}</div>
              <div className="text-xs text-sky-700 mt-1 tabular-nums">
                {formatMoney(Number(data.orders_today_revenue))}
              </div>
            </Link>

            <Link
              href="/orders"
              className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 hover:shadow-sm transition"
            >
              <div className="text-xs text-violet-800">Bu ay sipariş / ciro</div>
              <div className="mt-0.5 text-xl font-bold text-violet-900">{data.orders_month_count}</div>
              <div className="text-xs text-violet-700 mt-1 tabular-nums">
                {formatMoney(Number(data.orders_month_revenue))}
              </div>
            </Link>

            <Link
              href="/orders/kanban"
              className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 hover:shadow-sm transition"
            >
              <div className="text-xs text-amber-800">Açık siparişler</div>
              <div className="mt-0.5 text-xl font-bold text-amber-900">{data.open_orders}</div>
              <div className="text-xs text-amber-700 mt-1">Kanban →</div>
            </Link>

            <Link
              href="/stock/critical"
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 hover:shadow-sm transition"
            >
              <div className="text-xs text-red-800">Kritik stok</div>
              <div className="mt-0.5 text-xl font-bold text-red-900">{data.critical_stock_count}</div>
              <div className="text-xs text-red-700 mt-1">Kritik liste →</div>
            </Link>

            <Link
              href="/cari"
              className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 hover:shadow-sm transition"
            >
              <div className="text-xs text-orange-800">Açık alacaklar</div>
              <div className="mt-1 text-xl font-bold text-orange-900 tabular-nums">
                {formatMoney(Number(data.receivables_total))}
              </div>
              <div className="text-xs text-orange-700 mt-1">
                {data.receivables_customer_count} müşteri · toplam {data.customer_count}
              </div>
            </Link>

            <Link
              href="/finance/cash"
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 hover:shadow-sm transition"
            >
              <div className="text-xs text-emerald-800">Kasa bakiyesi</div>
              <div className="mt-1 text-xl font-bold text-emerald-900 tabular-nums">
                {formatMoney(Number(data.cash_balance))}
              </div>
              <div className="text-xs text-emerald-700 mt-1">Kasa →</div>
            </Link>

            <Link
              href="/finance/banks"
              className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 hover:shadow-sm transition"
            >
              <div className="text-xs text-cyan-800">Banka bakiyeleri</div>
              <div className="mt-1 text-xl font-bold text-cyan-900 tabular-nums">
                {formatMoney(Number(data.bank_balance))}
              </div>
              <div className="text-xs text-cyan-700 mt-1">Banka →</div>
            </Link>

            <Link
              href="/finance"
              className="rounded-xl border border-baykus-line bg-white px-3 py-2 hover:shadow-sm transition"
            >
              <div className="text-xs text-baykus-muted">Toplam likidite</div>
              <div className="mt-1 text-xl font-bold text-baykus-primary tabular-nums">
                {formatMoney(Number(data.total_liquidity))}
              </div>
              <div className="text-xs text-baykus-muted mt-1">
                {data.products_count} ürün · Finans →
              </div>
            </Link>
          </div>

          {/* Kanban status counts */}
          <div className="rounded-xl border border-baykus-line bg-white p-5 shadow-sm mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-baykus-text">Sipariş durumları</h2>
              <Link href="/orders/kanban" className="text-sm text-baykus-primary hover:underline">
                Kanban
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {data.status_counts.map((s) => (
                <div
                  key={s.status}
                  className={`rounded-lg px-3 py-2 text-sm ${statusBadgeClass(s.status)}`}
                >
                  <span className="font-medium">{s.status}</span>
                  <span className="ml-2 font-bold">{s.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming special days */}
          <div className="rounded-xl border border-pink-200 bg-pink-50/50 p-5 shadow-sm mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-baykus-text">Yaklaşan özel günler (30 gün)</h2>
              <Link href="/crm/special-days" className="text-sm text-baykus-primary hover:underline">
                Tümü
              </Link>
            </div>
            {!data.upcoming_special_days || data.upcoming_special_days.length === 0 ? (
              <p className="text-sm text-baykus-muted">Önümüzdeki 30 günde özel gün yok.</p>
            ) : (
              <ul className="space-y-2">
                {data.upcoming_special_days.slice(0, 8).map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white border border-pink-100 px-3 py-2 text-sm"
                  >
                    <div>
                      <span className="font-medium text-baykus-text">{d.name}</span>
                      <span className="ml-2 text-xs text-baykus-muted">{d.day_type}</span>
                      {d.customer_name && (
                        <span className="ml-2 text-xs text-baykus-muted">· {d.customer_name}</span>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-pink-800 tabular-nums">
                      {d.days_until === 0 ? "Bugün" : `${d.days_until} gün`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-2 mb-6">
            {/* Recent orders */}
            <div className="rounded-xl border border-baykus-line bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-baykus-line">
                <h2 className="font-semibold text-baykus-text">Son siparişler</h2>
                <Link href="/orders" className="text-sm text-baykus-primary hover:underline">
                  Tümü
                </Link>
              </div>
              {data.recent_orders.length === 0 ? (
                <p className="px-5 py-6 text-sm text-baykus-muted">Henüz sipariş yok.</p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="bg-baykus-bg text-left text-baykus-muted">
                    <tr>
                      <th className="px-4 py-2">No</th>
                      <th className="px-4 py-2">Müşteri</th>
                      <th className="px-4 py-2">Durum</th>
                      <th className="px-4 py-2 text-right">Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_orders.map((o) => (
                      <tr key={o.id} className="border-t border-baykus-line hover:bg-baykus-bg">
                        <td className="px-4 py-2">
                          <Link href={`/orders/${o.id}`} className="text-baykus-primary hover:underline">
                            {o.order_number}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-baykus-text">{o.customer_name || "—"}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-xs ${statusBadgeClass(o.status)}`}
                          >
                            {o.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatMoney(Number(o.total_amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Critical stock */}
            <div className="rounded-xl border border-baykus-line bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-baykus-line">
                <h2 className="font-semibold text-baykus-text">Kritik stok (öncelikli)</h2>
                <Link href="/stock/critical" className="text-sm text-baykus-primary hover:underline">
                  Kritik stok
                </Link>
              </div>
              {data.low_stock_items.length === 0 ? (
                <p className="px-5 py-6 text-sm text-baykus-muted">Kritik stok kalemi yok.</p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="bg-baykus-bg text-left text-baykus-muted">
                    <tr>
                      <th className="px-4 py-2">SKU</th>
                      <th className="px-4 py-2">Ürün</th>
                      <th className="px-4 py-2 text-right">Stok</th>
                      <th className="px-4 py-2 text-right">Eşik</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.low_stock_items.map((i) => (
                      <tr
                        key={`${i.product_id}-${i.variant_id ?? 0}`}
                        className="border-t border-baykus-line hover:bg-baykus-bg"
                      >
                        <td className="px-4 py-2">
                          <Link
                            href={`/products/${i.product_id}`}
                            className="text-baykus-primary hover:underline font-mono text-xs"
                          >
                            {i.sku}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-baykus-text">{i.name}</td>
                        <td className="px-4 py-2 text-right font-semibold text-red-700">
                          {i.stock_qty}
                        </td>
                        <td className="px-4 py-2 text-right text-baykus-muted">{i.threshold}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Recent cari payments */}
            <div className="rounded-xl border border-baykus-line bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-baykus-line">
                <h2 className="font-semibold text-baykus-text">Son cari tahsilatlar</h2>
                <Link href="/cari" className="text-sm text-baykus-primary hover:underline">
                  Cari
                </Link>
              </div>
              {data.recent_cari_payments.length === 0 ? (
                <p className="px-5 py-6 text-sm text-baykus-muted">Henüz tahsilat yok.</p>
              ) : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {data.recent_cari_payments.map((p) => (
                    <li key={p.id} className="px-5 py-3 flex justify-between gap-3">
                      <div>
                        <Link
                          href={`/customers/${p.customer_id}`}
                          className="font-medium text-baykus-text hover:underline"
                        >
                          {p.customer_name || `#${p.customer_id}`}
                        </Link>
                        <div className="text-xs text-baykus-muted">
                          {fmtDate(p.movement_date)}
                          {p.order_number ? ` · ${p.order_number}` : ""}
                          {p.note ? ` · ${p.note}` : ""}
                        </div>
                      </div>
                      <div className="font-semibold text-emerald-700 tabular-nums shrink-0">
                        {formatMoney(Number(p.credit))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Recent finance */}
            <div className="rounded-xl border border-baykus-line bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-baykus-line">
                <h2 className="font-semibold text-baykus-text">Son kasa / banka hareketleri</h2>
                <Link href="/finance" className="text-sm text-baykus-primary hover:underline">
                  Finans
                </Link>
              </div>
              {data.recent_finance_movements.length === 0 ? (
                <p className="px-5 py-6 text-sm text-baykus-muted">Henüz hareket yok.</p>
              ) : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {data.recent_finance_movements.map((m) => (
                    <li
                      key={`${m.source}-${m.id}`}
                      className="px-5 py-3 flex justify-between gap-3"
                    >
                      <div>
                        <div className="font-medium text-baykus-text">
                          {financeTypeLabel(m.source, m.movement_type)}
                          <span className="ml-2 text-xs font-normal text-baykus-muted">
                            {m.account_name || (m.source === "cash" ? "Kasa" : "Banka")}
                          </span>
                        </div>
                        <div className="text-xs text-baykus-muted">
                          {fmtDate(m.movement_date)}
                          {m.note ? ` · ${m.note}` : ""}
                        </div>
                      </div>
                      <div
                        className={`font-semibold tabular-nums shrink-0 ${
                          m.direction === "in" ? "text-emerald-700" : "text-red-700"
                        }`}
                      >
                        {m.direction === "in" ? "+" : "−"}
                        {formatMoney(Number(m.amount))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
