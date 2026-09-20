"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ORDER_STATUSES,
  OrderListItem,
  apiFetch,
  downloadPdf,
  formatMoney,
  orderRowTag,
  orderRowTagClass,
  statusBadgeClass,
} from "@/lib/api";

const FLOW = ["Sipariş Alındı", "Hazırlanıyor", "Baskıda", "Hazır", "Teslim Edildi"] as const;
const STAGE_COLORS: Record<string, string> = {
  "Sipariş Alındı": "#64748b",
  Hazırlanıyor: "#2563eb",
  Baskıda: "#7c3aed",
  Hazır: "#16a34a",
  "Teslim Edildi": "#0f766e",
};

function nextStatus(current: string): string | null {
  const i = FLOW.indexOf(current as (typeof FLOW)[number]);
  if (i < 0 || i >= FLOW.length - 1) return null;
  return FLOW[i + 1];
}

const OPEN = ORDER_STATUSES.filter((s) => s !== "Teslim Edildi" && s !== "Sipariş İptali");

export default function ProductionHubPage() {
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"table" | "stages">("stages");
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await apiFetch<OrderListItem[]>("/api/orders?limit=300");
      setItems(data.filter((o) => OPEN.includes(o.status as (typeof OPEN)[number])));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byStatus = useMemo(() => {
    const map: Record<string, OrderListItem[]> = {};
    for (const s of FLOW.slice(0, -1)) map[s] = [];
    for (const o of items) {
      if (!map[o.status]) map[o.status] = [];
      map[o.status].push(o);
    }
    return map;
  }, [items]);

  const filtered = useMemo(() => {
    let rows = status ? items.filter((o) => o.status === status) : items;
    const needle = q.trim().toLowerCase();
    if (needle) {
      rows = rows.filter((o) =>
        [o.order_number, o.customer_name, o.channel, o.design_status].join(" ").toLowerCase().includes(needle),
      );
    }
    return rows;
  }, [items, status, q]);

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

  async function advance(o: OrderListItem) {
    const nxt = nextStatus(o.status);
    if (!nxt) return;
    setBusy(o.id);
    setError("");
    try {
      await apiFetch(`/api/orders/${o.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nxt, note: "Atölye ilerlet" }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Durum hatası");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Üretim Akış Paneli</h2>
          <p className="text-xs text-baykus-muted">Atölye · aşama sütunları · ilerlet · iş emri</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/production/work-orders" className="bk-btn text-xs text-white" style={{ background: "#7c3aed" }}>
            İş emirleri
          </Link>
          <Link href="/orders/delivery-alarm" className="bk-btn text-xs text-white" style={{ background: "#be123c" }}>
            Teslim alarmı
          </Link>
          <Link href="/orders/overdue" className="bk-btn text-xs text-white" style={{ background: "#dc2626" }}>
            Geciken
          </Link>
          <Link href="/orders/kanban" className="bk-btn bk-btn-primary text-xs">
            Kanban
          </Link>
          <button type="button" onClick={load} className="bk-btn bk-btn-ghost text-xs">
            Yenile
          </button>
        </div>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="flex flex-wrap gap-2 items-center">
        <div className="rounded border bg-white px-3 py-2 text-xs">
          <span className="text-baykus-muted">Açık toplam</span>
          <div className="text-lg font-bold">{items.length}</div>
        </div>
        {FLOW.slice(0, -1).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(status === s ? "" : s)}
            className={`rounded px-2.5 py-1.5 text-xs font-medium border text-white ${
              status === s ? "ring-2 ring-offset-1 ring-slate-800" : "border-transparent"
            }`}
            style={{ background: STAGE_COLORS[s] }}
          >
            {s}: {(byStatus[s] || []).length}
          </button>
        ))}
        <input
          className="bk-input max-w-[180px] ml-auto text-xs"
          placeholder="Ara…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="button"
          className={`bk-btn text-xs ${view === "stages" ? "bk-btn-primary" : "bk-btn-ghost"}`}
          onClick={() => setView("stages")}
        >
          Aşamalar
        </button>
        <button
          type="button"
          className={`bk-btn text-xs ${view === "table" ? "bk-btn-primary" : "bk-btn-ghost"}`}
          onClick={() => setView("table")}
        >
          Tablo
        </button>
      </div>

      {view === "stages" ? (
        <div className="grid lg:grid-cols-4 gap-2 overflow-x-auto">
          {FLOW.slice(0, -1).map((s) => {
            const col = (byStatus[s] || []).filter((o) => {
              if (status && o.status !== status) return false;
              const needle = q.trim().toLowerCase();
              if (!needle) return true;
              return [o.order_number, o.customer_name].join(" ").toLowerCase().includes(needle);
            });
            return (
              <div key={s} className="rounded border bg-slate-50 min-w-[200px] flex flex-col max-h-[70vh]">
                <div
                  className="px-2.5 py-2 text-white text-xs font-bold flex justify-between"
                  style={{ background: STAGE_COLORS[s] }}
                >
                  <span>{s}</span>
                  <span>{col.length}</span>
                </div>
                <ul className="p-1.5 space-y-1.5 overflow-auto flex-1">
                  {col.map((o) => {
                    const nxt = nextStatus(o.status);
                    return (
                      <li key={o.id} className="rounded border bg-white p-2 shadow-sm text-xs">
                        <div className="flex justify-between gap-1">
                          <Link href={`/orders/${o.id}`} className="font-semibold text-baykus-primary hover:underline">
                            {o.order_number}
                          </Link>
                          <span className="tabular-nums text-[10px]">{formatMoney(Number(o.total_amount))}</span>
                        </div>
                        <div className="text-baykus-muted truncate">{o.customer_name || "—"}</div>
                        <div className="text-[10px] mt-0.5">
                          Teslim:{" "}
                          {o.due_date || o.delivery_date
                            ? new Date(o.due_date || o.delivery_date!).toLocaleDateString("tr-TR")
                            : "—"}
                          {o.design_status ? ` · ${o.design_status}` : ""}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {nxt && (
                            <button
                              type="button"
                              disabled={busy === o.id}
                              onClick={() => advance(o)}
                              className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white disabled:opacity-50"
                              style={{ background: "#16a34a" }}
                            >
                              → {nxt}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busy === o.id}
                            onClick={() => pdf(o)}
                            className="rounded border px-1.5 py-0.5 text-[10px] hover:bg-slate-50"
                          >
                            PDF
                          </button>
                        </div>
                      </li>
                    );
                  })}
                  {col.length === 0 && (
                    <li className="text-center text-baykus-muted text-[11px] py-6">Boş</li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bk-table-wrap">
          <table className="bk-table">
            <thead>
              <tr>
                <th>Sipariş No</th>
                <th>Müşteri</th>
                <th>Durum</th>
                <th>Kanal</th>
                <th>Tasarım</th>
                <th className="text-right">Tutar</th>
                <th>Teslim</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const nxt = nextStatus(o.status);
                const tag = orderRowTag(o);
                return (
                  <tr key={o.id} className={orderRowTagClass(tag)}>
                    <td>
                      <Link href={`/orders/${o.id}`} className="text-baykus-primary hover:underline font-medium">
                        {o.order_number}
                      </Link>
                    </td>
                    <td>{o.customer_name || "—"}</td>
                    <td>
                      <span className={`inline-block rounded px-2 py-0.5 text-[11px] ${statusBadgeClass(o.status)}`}>
                        {o.status}
                      </span>
                    </td>
                    <td>{o.channel || "—"}</td>
                    <td>{o.design_status || "—"}</td>
                    <td className="text-right tabular-nums">{formatMoney(Number(o.total_amount))}</td>
                    <td className="text-xs">
                      {o.due_date ? new Date(o.due_date).toLocaleDateString("tr-TR") : "—"}
                    </td>
                    <td className="text-right space-x-2 text-xs whitespace-nowrap">
                      {nxt && (
                        <button
                          type="button"
                          className="text-emerald-700 font-semibold hover:underline disabled:opacity-50"
                          disabled={busy === o.id}
                          onClick={() => advance(o)}
                        >
                          → {nxt}
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-baykus-primary hover:underline disabled:opacity-50"
                        disabled={busy === o.id}
                        onClick={() => pdf(o)}
                      >
                        PDF
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-baykus-muted py-8">
                    Açık sipariş yok
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
