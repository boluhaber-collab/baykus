"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardSummary, Product, apiFetch, formatMoney } from "@/lib/api";
import { QUICK_ACTIONS } from "@/lib/nav";

type UsdRates = { buy: number; sell: number } | null;
type NoteItem = { id: string; text: string; at: string };

const WORKSHOP_STATUSES = ["Sipariş Alındı", "Hazırlanıyor", "Baskıda", "Hazır"] as const;
const NOTES_KEY = "baykus_dashboard_notes";

function statusCount(data: DashboardSummary, status: string): number {
  return data.status_counts.find((s) => s.status === status)?.count ?? 0;
}

function loadNotes(): NoteItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    return raw ? (JSON.parse(raw) as NoteItem[]) : [];
  } catch {
    return [];
  }
}

function saveNotes(notes: NoteItem[]) {
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [usd, setUsd] = useState<UsdRates>(null);
  const [smartQ, setSmartQ] = useState("");
  const [stockProducts, setStockProducts] = useState<Product[]>([]);
  const [catFilter, setCatFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [notes, setNotes] = useState<NoteItem[]>([]);

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

  const loadStock = useCallback(async () => {
    try {
      const rows = await apiFetch<Product[]>("/api/products?limit=200&active_only=true");
      setStockProducts(rows.filter((p) => (p.stock_qty ?? p.total_stock ?? 0) > 0));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    loadUsd();
    loadStock();
    setNotes(loadNotes());
  }, [load, loadUsd, loadStock]);

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
    return Math.max(
      Number(data.cash_balance) || 0,
      Number(data.bank_balance) || 0,
      Number(data.stock_value) || 0,
      1,
    );
  }, [data]);

  const debtMax = useMemo(() => {
    if (!data) return 1;
    return Math.max(Number(data.receivables_total) || 0, Number(data.payables_total) || 0, 1);
  }, [data]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of stockProducts) if (p.category) set.add(p.category);
    return Array.from(set).sort();
  }, [stockProducts]);

  const filteredStock = useMemo(() => {
    return stockProducts.filter((p) => {
      if (catFilter && p.category !== catFilter) return false;
      if (nameFilter) {
        const n = nameFilter.toLocaleLowerCase("tr");
        if (!p.name.toLocaleLowerCase("tr").includes(n) && !p.sku.toLocaleLowerCase("tr").includes(n))
          return false;
      }
      return true;
    });
  }, [stockProducts, catFilter, nameFilter]);

  const footerOk =
    !data ||
    ((data.due_today_count ?? 0) === 0 &&
      (data.due_soon_count ?? 0) === 0 &&
      (data.overdue_deliveries_count ?? 0) === 0);

  function runSmartSearch() {
    const q = smartQ.trim();
    if (!q) return;
    const enc = encodeURIComponent(q);
    if (/^\d+$/.test(q) || q.toUpperCase().startsWith("SIP") || q.toUpperCase().startsWith("ORD")) {
      router.push(`/orders?q=${enc}`);
    } else if (q.startsWith("05") || q.replace(/\s/g, "").length >= 10) {
      router.push(`/customers?q=${enc}`);
    } else {
      router.push(`/products?q=${enc}`);
    }
  }

  function addNote() {
    const text = prompt("Not:");
    if (!text?.trim()) return;
    const next = [
      { id: Math.random().toString(36).slice(2), text: text.trim(), at: new Date().toISOString() },
      ...notes,
    ];
    setNotes(next);
    saveNotes(next);
  }

  function removeNote(id: string) {
    const next = notes.filter((n) => n.id !== id);
    setNotes(next);
    saveNotes(next);
  }

  return (
    <div className="space-y-3 pb-2">
      {/* Top metrics strip — sağ üst kutucuklar */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-xl font-bold text-slate-700 tracking-tight capitalize">{todayLabel}</div>
        <div className="flex flex-wrap items-stretch gap-2">
          {(
            [
              {
                label: "BUGÜNKÜ SATIŞ",
                value: data ? formatMoney(Number(data.orders_today_revenue)) : "—",
              },
              {
                label: "BUGÜNKÜ TAHSİLAT",
                value: data ? formatMoney(Number(data.collections_today ?? 0)) : "—",
              },
              {
                label: "İNTERNET SATIŞI",
                value: data
                  ? `${formatMoney(Number(data.internet_sales_today_revenue ?? 0))} | ${data.internet_sales_today_count ?? 0} sipariş`
                  : "—",
              },
              {
                label: "GÜNCEL DOLAR",
                value: usd ? `Alış: ${fmtUsd(usd.buy)} TL | Satış: ${fmtUsd(usd.sell)} TL` : "—",
              },
            ] as const
          ).map((box) => (
            <div
              key={box.label}
              className="rounded border border-baykus-line bg-white px-3 py-1.5 shadow-sm min-w-[9.5rem]"
            >
              <div className="text-[9px] font-bold uppercase tracking-wide text-baykus-muted">
                {box.label}
              </div>
              <div className="text-xs font-bold tabular-nums text-baykus-text mt-0.5">{box.value}</div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              load();
              loadUsd();
              loadStock();
            }}
            className="inline-flex h-9 w-9 items-center justify-center self-center rounded-full border border-baykus-line bg-white text-baykus-muted hover:bg-baykus-bg"
            title="Yenile"
          >
            ↻
          </button>
        </div>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {loading && !data && <p className="text-baykus-muted text-sm">Yükleniyor…</p>}

      {/* Hızlı İşlemler */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-baykus-muted uppercase tracking-wide mr-1">
          Hızlı İşlemler
        </span>
        {QUICK_ACTIONS.map((a) => (
          <Link
            key={a.id}
            href={a.href}
            className="rounded px-3 py-2 text-xs font-bold text-white shadow-sm hover:opacity-95"
            style={{ backgroundColor: a.hex }}
          >
            {a.label}
          </Link>
        ))}
      </div>

      {/* KPI cards */}
      {data && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/reports/sales"
            className="rounded-lg px-4 py-4 text-white shadow-sm text-center"
            style={{ backgroundColor: "#2563eb" }}
          >
            <div className="text-[11px] font-semibold opacity-90">{monthName} Cirosu</div>
            <div className="text-2xl font-bold tabular-nums mt-1">
              {formatMoney(Number(data.orders_month_revenue))}
            </div>
          </Link>
          <Link
            href="/reports/profit"
            className="rounded-lg px-4 py-4 text-white shadow-sm text-center"
            style={{ backgroundColor: "#15803d" }}
          >
            <div className="text-[11px] font-semibold opacity-90">{monthName} Net Kar</div>
            <div className="text-2xl font-bold tabular-nums mt-1">
              {formatMoney(Number(data.month_net_profit ?? 0))}
            </div>
          </Link>
          <Link
            href="/finance/cash"
            className="rounded-lg px-4 py-4 text-white shadow-sm text-center"
            style={{ backgroundColor: "#f59e0b" }}
          >
            <div className="text-[11px] font-semibold opacity-90">Güncel Kasa</div>
            <div className="text-2xl font-bold tabular-nums mt-1">
              {formatMoney(Number(data.cash_balance))}
            </div>
          </Link>
          <Link
            href="/finance/banks"
            className="rounded-lg px-4 py-4 text-white shadow-sm text-center"
            style={{ backgroundColor: "#be123c" }}
          >
            <div className="text-[11px] font-semibold opacity-90">Banka Bakiyesi</div>
            <div className="text-2xl font-bold tabular-nums mt-1">
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
              <div className="bg-[#1b2230] text-white px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold tracking-wide">
                  ÜRETİM / ATÖLYE{" "}
                  <span className="font-normal opacity-80 ml-2">
                    Açık iş: {data.open_workshop_jobs ?? 0}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <Link
                    href="/production"
                    className="rounded px-2.5 py-1 text-[11px] font-semibold text-white"
                    style={{ backgroundColor: "#f59e0b" }}
                  >
                    Üretim Akış
                  </Link>
                  <Link
                    href="/production/work-orders"
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
              <div className="bg-[#1b2230] text-white text-xs font-bold px-3 py-2 tracking-wide">
                VARLIKLAR
              </div>
              <div className="p-3 space-y-3">
                {(
                  [
                    { label: "Kasa", value: Number(data.cash_balance), href: "/finance/cash", color: "#22c55e" },
                    { label: "Banka", value: Number(data.bank_balance), href: "/finance/banks", color: "#3b82f6" },
                    {
                      label: "Stok",
                      value: Number(data.stock_value ?? 0),
                      href: "/reports/stock",
                      color: "#166534",
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

            {/* BORÇLAR / ALACAKLAR */}
            <div className="bk-card overflow-hidden">
              <div className="bg-[#1b2230] text-white text-xs font-bold px-3 py-2 tracking-wide">
                BORÇLAR / ALACAKLAR
              </div>
              <div className="p-3 space-y-3">
                {(
                  [
                    {
                      label: "Açık Hesap Alacağı",
                      value: Number(data.receivables_total),
                      href: "/customers/receivables",
                      color: "#3b82f6",
                    },
                    {
                      label: "Tedarikçi Borcu",
                      value: Number(data.payables_total ?? 0),
                      href: "/suppliers/payables",
                      color: "#ef4444",
                    },
                  ] as const
                ).map((row) => {
                  const pct = Math.min(100, Math.round((row.value / debtMax) * 100));
                  return (
                    <Link key={row.label} href={row.href} className="block group">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold group-hover:text-baykus-primary">{row.label}</span>
                        <span className="tabular-nums font-medium">{formatMoney(row.value)}</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: row.color }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* PERFORMANS */}
            <div className="bk-card overflow-hidden">
              <div className="bg-[#1b2230] text-white text-xs font-bold px-3 py-2 tracking-wide">
                PERFORMANS
              </div>
              <div className="p-3 text-xs space-y-2">
                <div>
                  En Çok Satan Ürün:{" "}
                  <strong>{data.top_selling_product || "—"}</strong>
                </div>
                <div className="text-baykus-muted border-t border-baykus-line pt-2">
                  Geciken Teslim: {data.overdue_deliveries_count ?? 0} | Bugün Teslim:{" "}
                  {data.due_today_count ?? 0} | Stok Değeri:{" "}
                  {formatMoney(Number(data.stock_value ?? 0))}
                </div>
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
              href="/orders/overdue"
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

            {/* STOK UYARISI */}
            <div className="bk-card overflow-hidden">
              <div className="bg-[#1d4ed8] text-white text-xs font-bold px-3 py-2 tracking-wide">
                STOK UYARISI
              </div>
              <div className="p-2 max-h-40 overflow-auto">
                {(data.low_stock_items || []).length === 0 ? (
                  <p className="text-xs text-baykus-muted px-1 py-2">Kritik stok uyarısı yok.</p>
                ) : (
                  <ul className="text-xs space-y-1">
                    {data.low_stock_items.map((it) => (
                      <li key={`${it.product_id}-${it.variant_id || 0}`}>
                        <Link href={`/products/${it.product_id}`} className="hover:underline">
                          <span className="font-semibold">{it.name}</span>
                          <span className="text-baykus-muted">
                            {" "}
                            · {it.stock_qty} / eşik {it.threshold}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Akıllı Arama */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          className="bk-input flex-1 min-w-[16rem]"
          placeholder="Müşteri / telefon / sipariş no / ürün / tedarikçi"
          value={smartQ}
          onChange={(e) => setSmartQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runSmartSearch();
          }}
        />
        <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => setSmartQ("")}>
          Temizle
        </button>
        <button type="button" className="bk-btn bk-btn-primary text-xs" onClick={runSmartSearch}>
          Ara
        </button>
      </div>

      {/* Stokta Var + Notlar */}
      <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
        <div className="bk-card overflow-hidden">
          <div className="bg-[#1b2230] text-white text-xs font-bold px-3 py-2 tracking-wide">
            STOKTA VAR OLAN ÜRÜNLER
          </div>
          <div className="p-2 flex flex-wrap gap-2 items-center border-b border-baykus-line">
            <select
              className="bk-input w-auto text-xs"
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
            >
              <option value="">Kategori</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              className="bk-input max-w-[12rem] text-xs"
              placeholder="Ürün Adı"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
            />
            <button
              type="button"
              className="bk-btn bk-btn-primary text-xs"
              onClick={() => loadStock()}
            >
              Filtrele
            </button>
            <button
              type="button"
              className="bk-btn bk-btn-ghost text-xs"
              onClick={() => {
                setCatFilter("");
                setNameFilter("");
              }}
            >
              Temizle
            </button>
          </div>
          <div className="bk-table-wrap border-0 rounded-none max-h-64 overflow-auto">
            <table className="bk-table">
              <thead>
                <tr>
                  <th>Kategori</th>
                  <th>Ürün Adı</th>
                  <th>Renk</th>
                  <th className="text-right">Satış Fiyatı</th>
                  <th>Stok</th>
                  <th className="text-right">Stok Adedi</th>
                </tr>
              </thead>
              <tbody>
                {filteredStock.slice(0, 50).map((p, i) => (
                  <tr key={p.id} className={i % 2 === 1 ? "bg-rose-50/60" : ""}>
                    <td className="text-xs">{p.category || "—"}</td>
                    <td>
                      <Link href={`/products/${p.id}`} className="hover:underline font-medium">
                        {p.name}
                      </Link>
                    </td>
                    <td className="text-xs">—</td>
                    <td className="text-right tabular-nums">{formatMoney(Number(p.base_price))}</td>
                    <td>
                      <span
                        className={`text-[11px] font-semibold ${
                          p.is_critical ? "text-red-600" : "text-emerald-600"
                        }`}
                      >
                        {p.is_critical ? "Kritik" : "Var"}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{p.stock_qty ?? p.total_stock ?? 0}</td>
                  </tr>
                ))}
                {filteredStock.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-baykus-muted py-6">
                      Stokta ürün yok
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bk-card overflow-hidden flex flex-col">
          <div className="bg-[#1b2230] text-white px-3 py-2 flex items-center justify-between">
            <span className="text-xs font-bold tracking-wide">NOTLAR</span>
            <button
              type="button"
              onClick={addNote}
              className="rounded px-2 py-0.5 text-[11px] font-bold text-white"
              style={{ backgroundColor: "#16a34a" }}
            >
              Not Ekle
            </button>
          </div>
          <div className="p-3 flex-1 overflow-auto text-xs space-y-2">
            {notes.length === 0 ? (
              <p className="text-baykus-muted">Henüz not eklenmemiş.</p>
            ) : (
              notes.map((n) => (
                <div key={n.id} className="rounded border border-baykus-line bg-baykus-bg px-2 py-1.5">
                  <div className="flex justify-between gap-2">
                    <span>{n.text}</span>
                    <button
                      type="button"
                      className="text-red-500 shrink-0"
                      onClick={() => removeNote(n.id)}
                      title="Sil"
                    >
                      ×
                    </button>
                  </div>
                  <div className="text-[10px] text-baykus-muted mt-0.5">
                    {new Date(n.at).toLocaleString("tr-TR")}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Footer status */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-baykus-line bg-white px-3 py-2 text-xs">
        <div className="flex items-center gap-2 text-baykus-muted">
          <span className="font-semibold text-red-600">⚠ Teslim Tarihi Alarmı</span>
          <span className={footerOk ? "text-emerald-600" : "text-amber-600"}>
            {footerOk
              ? "✔ Bugün teslim edilecek veya geciken iş yok."
              : "Teslim takibi gereken açık işler var."}
          </span>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="bk-btn bk-btn-ghost text-xs">
            ↻ Yenile
          </button>
          <Link
            href="/production"
            className="bk-btn text-xs font-semibold text-white"
            style={{ backgroundColor: "#f59e0b" }}
          >
            📅 Haftalık Plan
          </Link>
        </div>
      </div>
    </div>
  );
}
