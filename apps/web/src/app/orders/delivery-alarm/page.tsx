"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  OrderListItem,
  apiFetch,
  downloadPdf,
  formatMoney,
  orderRowTag,
  orderRowTagClass,
  statusBadgeClass,
} from "@/lib/api";

export default function DeliveryAlarmPage() {
  const [today, setToday] = useState<OrderListItem[]>([]);
  const [upcoming, setUpcoming] = useState<OrderListItem[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [tab, setTab] = useState<"today" | "upcoming">("today");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [t, u] = await Promise.all([
        apiFetch<OrderListItem[]>("/api/orders?delivery=today"),
        apiFetch<OrderListItem[]>("/api/orders?delivery=upcoming"),
      ]);
      setToday(t);
      setUpcoming(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const list = tab === "today" ? today : upcoming;
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((o) =>
      [o.order_number, o.customer_name, o.customer_phone, o.status].join(" ").toLowerCase().includes(needle),
    );
  }, [list, q]);

  async function pdf(o: OrderListItem) {
    setBusy(o.id);
    try {
      await downloadPdf(`/api/orders/${o.id}/work-order-pdf`, `${o.order_number}-is-emri.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF hatası");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Teslim Alarmı</h2>
          <p className="text-xs text-baykus-muted">Üretim › Teslim Alarmı · bugün + yaklaşan 7 gün</p>
        </div>
        <div className="flex gap-2">
          <Link href="/orders/overdue" className="bk-btn text-xs text-white" style={{ background: "#dc2626" }}>
            Geciken işler
          </Link>
          <Link href="/production" className="bk-btn bk-btn-ghost text-xs">
            Atölye
          </Link>
          <button type="button" className="bk-btn bk-btn-primary text-xs" onClick={load}>
            Yenile
          </button>
        </div>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="grid sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setTab("today")}
          className={`rounded border px-4 py-3 text-left ${tab === "today" ? "ring-2 ring-red-500" : ""}`}
          style={{ background: "#fef2f2", borderColor: "#fecaca" }}
        >
          <div className="text-[11px] text-red-800">Bugün Teslim</div>
          <div className="text-2xl font-bold text-red-900">{today.length}</div>
        </button>
        <button
          type="button"
          onClick={() => setTab("upcoming")}
          className={`rounded border px-4 py-3 text-left ${tab === "upcoming" ? "ring-2 ring-amber-500" : ""}`}
          style={{ background: "#fffbeb", borderColor: "#fde68a" }}
        >
          <div className="text-[11px] text-amber-800">Yaklaşan (7 gün)</div>
          <div className="text-2xl font-bold text-amber-900">{upcoming.length}</div>
        </button>
      </div>

      <div className="bk-filter-bar">
        <input className="bk-input max-w-[220px]" placeholder="Ara…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-xs text-baykus-muted ml-auto">Listelenen: {filtered.length}</span>
      </div>

      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Sipariş</th>
              <th>Müşteri</th>
              <th>Telefon</th>
              <th>Teslim</th>
              <th>Durum</th>
              <th>Tasarım</th>
              <th className="text-right">Tutar</th>
              <th className="text-right">Kalan</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id} className={orderRowTagClass(orderRowTag(o))}>
                <td>
                  <Link href={`/orders/${o.id}`} className="text-baykus-primary hover:underline font-medium">
                    {o.order_number}
                  </Link>
                </td>
                <td>{o.customer_name || "—"}</td>
                <td className="text-xs">{o.customer_phone || "—"}</td>
                <td className="text-xs font-semibold">{o.delivery_date || o.due_date || "—"}</td>
                <td>
                  <span className={`inline-block rounded px-2 py-0.5 text-[11px] ${statusBadgeClass(o.status)}`}>
                    {o.status}
                  </span>
                </td>
                <td className="text-xs">{o.design_status || "—"}</td>
                <td className="text-right tabular-nums">{formatMoney(Number(o.total_amount))}</td>
                <td className="text-right tabular-nums text-amber-700">
                  {formatMoney(Number(o.remaining_amount))}
                </td>
                <td className="text-right text-xs space-x-2 whitespace-nowrap">
                  {o.customer_phone && (
                    <a
                      className="text-emerald-700 hover:underline"
                      href={`https://wa.me/${o.customer_phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WA
                    </a>
                  )}
                  <button
                    type="button"
                    className="text-violet-700 hover:underline disabled:opacity-50"
                    disabled={busy === o.id}
                    onClick={() => pdf(o)}
                  >
                    PDF
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-baykus-muted py-8">
                  Kayıt yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
