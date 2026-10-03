"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OpenBalanceOrder, ReceivableItem, apiFetch, formatMoney, statusBadgeClass } from "@/lib/api";
import StatusFooter from "@/components/StatusFooter";
import { displayCode } from "@/lib/productLabel";

type OpenBalances = {
  open_orders?: OpenBalanceOrder[];
  open_orders_total?: number;
  receivables_total?: number;
};

export default function CustomerReceivablesPage() {
  const [parties, setParties] = useState<ReceivableItem[]>([]);
  const [orders, setOrders] = useState<OpenBalanceOrder[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"orders" | "cari">("orders");

  const load = useCallback(async () => {
    setError("");
    try {
      const [recv, ob] = await Promise.all([
        apiFetch<ReceivableItem[]>("/api/customers/receivables"),
        apiFetch<OpenBalances>("/api/finance/open-balances"),
      ]);
      setParties(recv);
      setOrders(ob.open_orders || []);
      setOrdersTotal(ob.open_orders_total || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const partyTotal = parties.reduce((s, i) => s + Number(i.balance), 0);

  const filteredOrders = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return orders;
    return orders.filter((r) =>
      [r.customer_name, r.order_number, r.products, r.customer_phone].join(" ").toLowerCase().includes(needle),
    );
  }, [orders, q]);

  const filteredParties = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return parties;
    return parties.filter((r) =>
      [r.name, r.code, r.company, r.phone, r.city].join(" ").toLowerCase().includes(needle),
    );
  }, [parties, q]);

  return (
    <div className="space-y-2 pb-2">
      <div className="bk-sticky-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-baykus-text leading-tight">Açık Alacaklar</h2>
          <p className="text-xs text-baykus-muted">Müşteri Merkezi › Açık Alacaklar · sipariş kalan + cari bakiye</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/customers" className="bk-btn bk-btn-ghost text-xs">
            Müşteri Merkezi
          </Link>
          <Link href="/finance/open-balances" className="bk-btn bk-btn-ghost text-xs" style={{ background: "#be123c", color: "#fff" }}>
            Finans Açık Bakiyeler
          </Link>
          <Link href="/reports/cari-statements" className="bk-btn bk-btn-ghost text-xs">
            Cari Döküm
          </Link>
          <button type="button" className="bk-btn bk-btn-primary text-xs" onClick={load}>
            Yenile
          </button>
        </div>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="bk-kpi-strip" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <div className="bk-kpi-card" style={{ backgroundColor: "#f59e0b" }}>
          <span className="bk-kpi-icon">🧾</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Sipariş açık ({orders.length})</div>
            <div className="bk-kpi-value truncate">{formatMoney(ordersTotal)}</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#be123c" }}>
          <span className="bk-kpi-icon">₺</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Cari alacak ({parties.length})</div>
            <div className="bk-kpi-value truncate">{formatMoney(partyTotal)}</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#0f766e" }}>
          <span className="bk-kpi-icon">⚡</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Hızlı işlem</div>
            <div className="flex justify-end gap-1 mt-1">
              <Link href="/sales/create" className="bk-btn text-[10px] bg-white/20 text-white border-white/30">+ Satış</Link>
              <Link href="/finance/cash" className="bk-btn text-[10px] bg-white/20 text-white border-white/30">Kasa</Link>
            </div>
          </div>
        </div>
      </div>

      <div className="bk-filter-bar">
        <button
          type="button"
          className={`bk-btn text-xs ${tab === "orders" ? "bk-btn-primary" : "bk-btn-ghost"}`}
          onClick={() => setTab("orders")}
        >
          Sipariş bakiyeleri
        </button>
        <button
          type="button"
          className={`bk-btn text-xs ${tab === "cari" ? "bk-btn-primary" : "bk-btn-ghost"}`}
          onClick={() => setTab("cari")}
        >
          Cari bakiyeler
        </button>
        <input
          className="bk-input min-w-[200px] ml-auto"
          placeholder="Ara…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {tab === "orders" ? (
        <div className="bk-table-wrap">
          <table className="bk-table">
            <thead>
              <tr>
                <th>Müşteri</th>
                <th>Telefon</th>
                <th>Sipariş</th>
                <th>Durum</th>
                <th className="text-right">Toplam</th>
                <th className="text-right">Tahsil</th>
                <th className="text-right">Açık</th>
                <th>Ürünler</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((r) => (
                <tr key={r.order_id} className={r.row_tag === "geciken" ? "bg-red-50" : undefined}>
                  <td className="font-medium">{r.customer_name || "—"}</td>
                  <td className="text-xs">{r.customer_phone || "—"}</td>
                  <td>
                    <Link href={r.href} className="text-baykus-primary hover:underline font-medium">
                      {r.order_number}
                    </Link>
                  </td>
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
                  <td className="text-xs max-w-[180px] truncate">{r.products || "—"}</td>
                  <td className="text-right text-xs whitespace-nowrap">
                    <Link href={`/orders/${r.order_id}`} className="text-baykus-primary hover:underline">
                      Tahsilat
                    </Link>
                  </td>
                </tr>
              ))}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center text-baykus-muted py-8">
                    Açık sipariş alacağı yok
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bk-table-wrap">
          <table className="bk-table">
            <thead>
              <tr>
                <th>Kod</th>
                <th>Müşteri</th>
                <th>Firma</th>
                <th>Şehir</th>
                <th>Telefon</th>
                <th>Son hareket</th>
                <th className="text-right">Bakiye</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredParties.map((r) => (
                <tr key={r.customer_id}>
                  <td className="font-mono text-xs text-slate-500">{displayCode(r.code) || "—"}</td>
                  <td className="font-medium">{r.name}</td>
                  <td className="text-slate-600">{r.company || "—"}</td>
                  <td>{r.city || "—"}</td>
                  <td>{r.phone || "—"}</td>
                  <td className="text-xs text-slate-500">{r.last_movement_date || "—"}</td>
                  <td className="text-right font-medium text-amber-700 tabular-nums">
                    {formatMoney(Number(r.balance))}
                  </td>
                  <td className="text-right text-xs space-x-2 whitespace-nowrap">
                    <Link href={`/customers/${r.customer_id}`} className="text-baykus-primary hover:underline">
                      Ekstre
                    </Link>
                    <Link
                      href={`/reports/cari-statements?customer_id=${r.customer_id}`}
                      className="text-baykus-primary hover:underline"
                    >
                      Döküm
                    </Link>
                  </td>
                </tr>
              ))}
              {filteredParties.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-baykus-muted py-8">
                    Açık cari alacak yok
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <StatusFooter onRefresh={load} />
    </div>
  );
}
