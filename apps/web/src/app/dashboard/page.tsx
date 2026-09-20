"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardSummary, apiFetch, formatMoney } from "@/lib/api";
import { QUICK_ACTIONS } from "@/lib/nav";

type UsdRates = { buy: number; sell: number } | null;

const WORKSHOP_STATUSES = ["Sipariş Alındı", "Hazırlanıyor", "Baskıda", "Hazır"] as const;

function statusCount(data: DashboardSummary, status: string): number {
  return data.status_counts.find((s) => s.status === status)?.count ?? 0;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [usd, setUsd] = useState<UsdRates>(null);

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

  const loadUsd = useCallback(async () => {
    try {
      const json = await apiFetch<{
        ok: boolean;
        buy: number | null;
        sell: number | null;
        mid: number | null;
      }>("/api/dashboard/usd-rate");
      const buy = json.buy ?? json.mid;
      const sell = json.sell ?? json.mid;
      if (buy == null || sell == null || !Number.isFinite(buy) || !Number.isFinite(sell)) {
        setUsd(null);
        return;
      }
      setUsd({ buy, sell });
    } catch {
      setUsd(null);
    }
  }, []);

  useEffect(() => {
    load();
    loadUsd();
  }, [load, loadUsd]);

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        weekday: "long",
      }),
    [],
  );

  const monthName = data?.month_label || todayLabel.split(" ")[1] || "";
  const fmtUsd = (n: number) =>
    n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const assetMax = useMemo(() => {
    if (!data) return 1;
    return Math.max(Number(data.cash_balance) || 0, Number(data.bank_balance) || 0, Number(data.stock_value) || 0, 1);
  }, [data]);

  const footerOk =
    !data ||
    ((data.due_today_count ?? 0) === 0 &&
      (data.due_soon_count ?? 0) === 0 &&
      (data.overdue_deliveries_count ?? 0) === 0);

  return (
    <div className="space-y-3 pb-2">
      {/* Top metrics strip */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-xl font-bold text-slate-400 capitalize tracking-tight">{todayLabel}</div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold uppercase tracking-wide text-baykus-muted">
          <span>
            Bugünkü Satış{" "}
            <strong className="ml-1 text-sm text-baykus-text tabular-nums normal-case">
              {data ? formatMoney(Number(data.orders_today_revenue)) : "—"}
            </strong>
          </span>
          <span className="hidden sm:inline text-baykus-line">|</span>
          <span>
            Bugünkü Tahsilat{" "}
            <strong className="ml-1 text-sm text-baykus-text tabular-nums normal-case">
              {data ? formatMoney(Number(data.collections_today ?? 0)) : "—"}
            </strong>
          </span>
          <span className="hidden sm:inline text-baykus-line">|</span>
          <span>
            İnternet Satışı{" "}
            <strong className="ml-1 text-sm text-baykus-text tabular-nums normal-case">
              {data
                ? `${formatMoney(Number(data.internet_sales_today_revenue ?? 0))} | ${data.internet_sales_today_count ?? 0} sipariş`
                : "—"}
            </strong>
          </span>
          <span className="hidden sm:inline text-baykus-line">|</span>
          <span>
            Güncel Dolar{" "}
            <strong className="ml-1 text-sm text-baykus-text tabular-nums normal-case">
              {usd ? `Alış ${fmtUsd(usd.buy)} TL | Satış ${fmtUsd(usd.sell)} TL` : "—"}
            </strong>
          </span>
          <button
            type="button"
            onClick={() => {
              load();
              loadUsd();
            }}
            className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-baykus-line bg-white text-baykus-muted hover:bg-baykus-bg"
            title="Yenile"
          >
            ↻
          </button>
        </div>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {loading && !data && <p className="text-baykus-muted text-sm">Yükleniyor…</p>}

      {/* Hızlı İşlemler */}
      <div>
        <div className="text-xs font-semibold text-baykus-muted mb-1.5 uppercase tracking-wide">
          Hızlı İşlemler
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.id}
              href={a.href}
              className="rounded px-3.5 py-2.5 text-xs font-bold text-white shadow-sm hover:opacity-95"
              style={{ backgroundColor: a.hex }}
            >
              {a.label}
            </Link>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      {data && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/reports/sales"
            className="rounded-lg px-4 py-3 text-white shadow-sm"
            style={{ backgroundColor: "#2563eb" }}
          >
            <div className="text-[11px] font-semibold opacity-90">{monthName} Cirosu</div>
            <div className="text-xl font-bold tabular-nums mt-0.5">
              {formatMoney(Number(data.orders_month_revenue))}
            </div>
          </Link>
          <Link
            href="/reports/profit"
            className="rounded-lg px-4 py-3 text-white shadow-sm"
            style={{ backgroundColor: "#15803d" }}
          >
            <div className="text-[11px] font-semibold opacity-90">{monthName} Net Kar</div>
            <div className="text-xl font-bold tabular-nums mt-0.5">
              {formatMoney(Number(data.month_net_profit ?? 0))}
            </div>
          </Link>
          <Link
            href="/finance/cash"
            className="rounded-lg px-4 py-3 text-white shadow-sm"
            style={{ backgroundColor: "#f59e0b" }}
          >
            <div className="text-[11px] font-semibold opacity-90">Güncel Kasa</div>
            <div className="text-xl font-bold tabular-nums mt-0.5">
              {formatMoney(Number(data.cash_balance))}
            </div>
          </Link>
          <Link
            href="/finance/banks"
            className="rounded-lg px-4 py-3 text-white shadow-sm"
            style={{ backgroundColor: "#be123c" }}
          >
            <div className="text-[11px] font-semibold opacity-90">Banka Bakiyesi</div>
            <div className="text-xl font-bold tabular-nums mt-0.5">
              {formatMoney(Number(data.bank_balance))}
            </div>
          </Link>
        </div>
      )}

      {/* Body: left widgets + right alerts */}
      {data && (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-3">
            {/* ÜRETİM / ATÖLYE */}
            <div className="bk-card overflow-hidden">
              <div className="bg-baykus-navy text-white px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold tracking-wide">
                  ÜRETİM / ATÖLYE{" "}
                  <span className="font-normal opacity-80 ml-2">
                    Açık iş: {data.open_workshop_jobs ?? 0}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <Link
                    href="/orders/kanban"
                    className="rounded px-2.5 py-1 text-[11px] font-semibold text-white"
                    style={{ backgroundColor: "#f59e0b" }}
                  >
                    Üretim Akışı
                  </Link>
                  <Link
                    href="/production"
                    className="rounded px-2.5 py-1 text-[11px] font-semibold bg-slate-600 text-white hover:bg-slate-500"
                  >
                    İş Emirleri
                  </Link>
                </div>
              </div>
              <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {WORKSHOP_STATUSES.map((st) => (
                  <div
                    key={st}
                    className="rounded border border-baykus-line bg-baykus-bg px-2 py-2 text-center"
                  >
                    <div className="text-[10px] text-baykus-muted font-medium">{st}</div>
                    <div className="text-lg font-bold tabular-nums">{statusCount(data, st)}</div>
                  </div>
                ))}
              </div>
              <div className="px-3 pb-3 text-xs text-baykus-muted">
                {(data.open_workshop_jobs ?? 0) === 0
                  ? "Atölyede açık iş bulunmuyor."
                  : `${data.open_workshop_jobs} açık üretim işi var.`}
              </div>
            </div>

            {/* VARLIKLAR */}
            <div className="bk-card overflow-hidden">
              <div className="bg-baykus-navy text-white text-xs font-bold px-3 py-2 tracking-wide">
                VARLIKLAR
              </div>
              <div className="p-3 space-y-3">
                {(
                  [
                    { label: "Kasa", value: Number(data.cash_balance), href: "/finance/cash", color: "#94a3b8" },
                    { label: "Banka", value: Number(data.bank_balance), href: "/finance/banks", color: "#64748b" },
                    {
                      label: "Stok",
                      value: Number(data.stock_value ?? 0),
                      href: "/reports/stock",
                      color: "#16a34a",
                    },
                  ] as const
                ).map((row) => {
                  const pct = Math.min(100, Math.round((row.value / assetMax) * 100));
                  return (
                    <Link key={row.label} href={row.href} className="block group">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-baykus-text group-hover:text-baykus-primary">
                          {row.label}
                        </span>
                        <span className="tabular-nums font-medium">{formatMoney(row.value)}</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: row.color }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right alert banners */}
          <div className="space-y-2">
            <Link
              href="/orders?open=1"
              className="flex items-center justify-between gap-3 rounded-lg px-4 py-3 text-white shadow-sm"
              style={{ backgroundColor: "#f59e0b" }}
            >
              <div>
                <div className="text-sm font-bold tracking-wide">BEKLEYEN SİPARİŞ</div>
                <div className="text-xs opacity-90 mt-0.5">Açık siparişleri görmek için tıklayın.</div>
              </div>
              <div className="text-4xl font-black tabular-nums leading-none">{data.open_orders}</div>
            </Link>

            <Link
              href="/stock/critical"
              className="flex items-center justify-between gap-3 rounded-lg px-4 py-3 text-white shadow-sm"
              style={{ backgroundColor: "#dc2626" }}
            >
              <div>
                <div className="text-sm font-bold tracking-wide">KRİTİK STOK</div>
                <div className="text-xs opacity-90 mt-0.5">Azalan stokları görmek için tıklayın.</div>
              </div>
              <div className="text-4xl font-black tabular-nums leading-none">
                {data.critical_stock_count}
              </div>
            </Link>

            <Link
              href="/orders?due=today"
              className="block rounded-lg px-4 py-3 text-white shadow-sm"
              style={{ backgroundColor: "#16a34a" }}
            >
              <div className="text-sm font-bold tracking-wide">BUGÜN TESLİM / YAKLAŞAN İŞLER</div>
              <div className="text-xs opacity-90 mt-0.5">
                {(data.due_today_count ?? 0) + (data.due_soon_count ?? 0) === 0
                  ? "Bugün teslim edilecek açık iş bulunmuyor."
                  : `Bugün: ${data.due_today_count ?? 0} · Yaklaşan: ${data.due_soon_count ?? 0}`}
              </div>
            </Link>

            <Link
              href="/orders?overdue=1"
              className="block rounded-lg px-4 py-3 text-white shadow-sm"
              style={{ backgroundColor: "#ef4444" }}
            >
              <div className="text-sm font-bold tracking-wide">GECİKEN TESLİMLER</div>
              <div className="text-xs opacity-90 mt-0.5">
                {(data.overdue_deliveries_count ?? 0) === 0
                  ? "Geciken teslim bulunmuyor."
                  : `${data.overdue_deliveries_count} geciken teslim var.`}
              </div>
            </Link>

            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 text-white shadow-sm"
              style={{ backgroundColor: "#4338ca" }}
            >
              <div className="min-w-0">
                <div className="text-sm font-bold tracking-wide">KREDİ ÖDEMESİ SON GÜN</div>
                <div className="text-xs opacity-90 mt-0.5">
                  {(data.loan_due_count ?? 0) === 0
                    ? "Yaklaşan kredi ödemesi bulunmamaktadır."
                    : data.loan_due_items?.[0]
                      ? `${data.loan_due_items[0].loan_title} · ${formatMoney(data.loan_due_items[0].amount)} · ${data.loan_due_items[0].days_until <= 0 ? "Bugün" : `${data.loan_due_items[0].days_until} gün`}`
                      : `${data.loan_due_count} yaklaşan ödeme`}
                </div>
              </div>
              <Link
                href="/finance/loans"
                className="shrink-0 rounded bg-white/20 hover:bg-white/30 px-3 py-1.5 text-xs font-bold"
              >
                Ödeme Yap
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Footer status */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-baykus-line bg-white px-3 py-2 text-xs">
        <div className="flex items-center gap-2 text-baykus-muted">
          <span className={footerOk ? "text-emerald-600" : "text-amber-600"}>
            {footerOk ? "✓" : "!"}
          </span>
          <span>
            {footerOk
              ? "Bugün teslim edilecek veya geciken iş yok."
              : "Teslim takibi gereken açık işler var."}
          </span>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="bk-btn bk-btn-ghost text-xs">
            Yenile
          </button>
          <Link
            href="/production"
            className="bk-btn text-xs font-semibold text-white"
            style={{ backgroundColor: "#f59e0b" }}
          >
            Haftalık Plan
          </Link>
        </div>
      </div>
    </div>
  );
}
