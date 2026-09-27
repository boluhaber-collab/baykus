"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OpenBalanceOrder, apiFetch, formatMoney, statusBadgeClass } from "@/lib/api";
import StatusFooter from "@/components/StatusFooter";

type Party = {
  kind: string;
  party_id: number;
  name: string;
  code: string | null;
  balance: number;
  href: string;
};

type OpenBalances = {
  receivables_total: number;
  payables_total: number;
  net: number;
  receivables_count: number;
  payables_count: number;
  receivables: Party[];
  payables: Party[];
  open_orders_total?: number;
  open_orders_count?: number;
  open_orders?: OpenBalanceOrder[];
};

const STATUSES = ["Tümü", "Sipariş Alındı", "Hazırlanıyor", "Baskıda", "Hazır", "Teslim Edildi"];

export default function OpenBalancesPage() {
  const [data, setData] = useState<OpenBalances | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("Tümü");
  const [tab, setTab] = useState<"orders" | "parties">("orders");

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await apiFetch<OpenBalances>("/api/finance/open-balances"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    let rows = data?.open_orders || [];
    if (status !== "Tümü") rows = rows.filter((r) => r.status === status);
    const needle = q.trim().toLocaleLowerCase("tr");
    if (needle) {
      rows = rows.filter((r) =>
        [r.customer_name, r.customer_phone, r.order_number, r.products, r.status]
          .join(" ")
          .toLocaleLowerCase("tr")
          .includes(needle),
      );
    }
    return rows;
  }, [data, q, status]);

  const filteredTotal = filtered.reduce((s, r) => s + r.open_balance, 0);

  return (
    <div className="space-y-2 pb-2">
      <div className="bk-sticky-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-baykus-text leading-tight">Açık Bakiyeler</h2>
          <p className="text-xs text-baykus-muted">Finans › Açık Bakiyeler · sipariş bazlı kalan + cari özet</p>
        </div>
        <div className="flex gap-2 text-xs">
          <Link href="/customers/receivables" className="bk-btn bk-btn-ghost" style={{ background: "#fff7ed", color: "#9a3412" }}>
            Alacaklar
          </Link>
          <Link href="/suppliers/payables" className="bk-btn bk-btn-ghost" style={{ background: "#fef2f2", color: "#991b1b" }}>
            Borçlar
          </Link>
          <button type="button" className="bk-btn bk-btn-primary text-xs" onClick={load}>
            Yenile
          </button>
        </div>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="bk-kpi-strip" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <div className="bk-kpi-card" style={{ backgroundColor: "#f59e0b" }}>
          <span className="bk-kpi-icon">🧾</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Sipariş açık ({data?.open_orders_count || 0})</div>
            <div className="bk-kpi-value truncate">{formatMoney(data?.open_orders_total || 0)}</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#198754" }}>
          <span className="bk-kpi-icon">↑</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Cari alacak</div>
            <div className="bk-kpi-value truncate">{formatMoney(data?.receivables_total || 0)}</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#be123c" }}>
          <span className="bk-kpi-icon">↓</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Tedarikçi borç</div>
            <div className="bk-kpi-value truncate">{formatMoney(data?.payables_total || 0)}</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#1e3a5f" }}>
          <span className="bk-kpi-icon">Σ</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Net cari</div>
            <div className="bk-kpi-value truncate">{formatMoney(data?.net || 0)}</div>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className={`bk-btn text-xs ${tab === "orders" ? "bk-btn-primary" : "bk-btn-ghost"}`}
          onClick={() => setTab("orders")}
        >
          Sipariş bakiyeleri
        </button>
        <button
          type="button"
          className={`bk-btn text-xs ${tab === "parties" ? "bk-btn-primary" : "bk-btn-ghost"}`}
          onClick={() => setTab("parties")}
        >
          Cari / Tedarikçi
        </button>
      </div>

      {tab === "orders" && (
        <>
          <fieldset className="rounded border bg-white px-3 py-2">
            <legend className="px-1 text-xs font-semibold">Filtre</legend>
            <div className="bk-filter-bar">
              <input
                className="bk-input min-w-[200px]"
                placeholder="Ara (müşteri, sipariş, ürün…)"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <select className="bk-input max-w-[180px]" value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <span className="text-xs text-baykus-muted ml-auto">
                Listelenen: {filtered.length} · Toplam açık:{" "}
                <strong className="tabular-nums text-amber-700">{formatMoney(filteredTotal)}</strong>
              </span>
            </div>
          </fieldset>

          <div className="bk-table-wrap">
            <table className="bk-table">
              <thead>
                <tr>
                  <th>Müşteri</th>
                  <th>Telefon</th>
                  <th>Sipariş No</th>
                  <th>Tarih</th>
                  <th>Teslim</th>
                  <th>Durum</th>
                  <th className="text-right">Toplam</th>
                  <th className="text-right">Kapora/Tahsilat</th>
                  <th className="text-right">Açık Bakiye</th>
                  <th>Ürünler</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.order_id}
                    className={
                      r.row_tag === "geciken" ? "bg-red-50" : r.row_tag === "teslim" ? "bg-amber-50" : undefined
                    }
                  >
                    <td className="font-medium">{r.customer_name || "—"}</td>
                    <td className="text-xs">{r.customer_phone || "—"}</td>
                    <td>
                      <Link href={r.href} className="text-baykus-primary hover:underline font-medium">
                        {r.order_number}
                      </Link>
                    </td>
                    <td className="text-xs">{r.order_date || "—"}</td>
                    <td className="text-xs">{r.due_date || "—"}</td>
                    <td>
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${statusBadgeClass(r.status)}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{formatMoney(r.total_amount)}</td>
                    <td className="text-right tabular-nums text-emerald-700">{formatMoney(r.paid_amount)}</td>
                    <td className="text-right tabular-nums font-semibold text-amber-800">
                      {formatMoney(r.open_balance)}
                    </td>
                    <td className="text-xs max-w-[220px] truncate">{r.products || "—"}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center text-baykus-muted py-8">
                      Açık sipariş bakiyesi yok
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "parties" && (
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-semibold mb-1.5">Alacaklar ({data?.receivables_count || 0})</h3>
            <div className="bk-table-wrap">
              <table className="bk-table">
                <thead>
                  <tr>
                    <th>Müşteri</th>
                    <th className="text-right">Bakiye</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.receivables || []).map((r) => (
                    <tr key={r.party_id}>
                      <td>
                        <Link href={r.href} className="text-baykus-primary hover:underline">
                          {r.name}
                        </Link>
                      </td>
                      <td className="text-right tabular-nums">{formatMoney(r.balance)}</td>
                    </tr>
                  ))}
                  {(data?.receivables || []).length === 0 && (
                    <tr>
                      <td colSpan={2} className="text-center text-baykus-muted py-6">
                        Açık alacak yok
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-1.5">Borçlar ({data?.payables_count || 0})</h3>
            <div className="bk-table-wrap">
              <table className="bk-table">
                <thead>
                  <tr>
                    <th>Tedarikçi</th>
                    <th className="text-right">Bakiye</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.payables || []).map((r) => (
                    <tr key={r.party_id}>
                      <td>
                        <Link href={r.href} className="text-baykus-primary hover:underline">
                          {r.name}
                        </Link>
                      </td>
                      <td className="text-right tabular-nums">{formatMoney(r.balance)}</td>
                    </tr>
                  ))}
                  {(data?.payables || []).length === 0 && (
                    <tr>
                      <td colSpan={2} className="text-center text-baykus-muted py-6">
                        Açık borç yok
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      <StatusFooter onRefresh={load} />
    </div>
  );
}
