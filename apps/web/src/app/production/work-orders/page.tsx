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

const OPEN = ORDER_STATUSES.filter((s) => s !== "Teslim Edildi" && s !== "Sipariş İptali");
const FLOW = ["Sipariş Alındı", "Hazırlanıyor", "Baskıda", "Hazır"] as const;

function nextStatus(current: string): string | null {
  const i = (FLOW as readonly string[]).indexOf(current);
  if (i < 0 || i >= FLOW.length - 1) return "Teslim Edildi";
  if (current === "Hazır") return "Teslim Edildi";
  return FLOW[i + 1];
}

export default function WorkOrdersPage() {
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

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

  const filtered = useMemo(() => {
    let rows = status ? items.filter((o) => o.status === status) : items;
    const needle = q.trim().toLowerCase();
    if (needle) {
      rows = rows.filter((o) =>
        [o.order_number, o.customer_name, o.design_status].join(" ").toLowerCase().includes(needle),
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
    try {
      await apiFetch(`/api/orders/${o.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nxt, note: "İş emri ilerlet" }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Durum hatası");
    } finally {
      setBusy(null);
    }
  }

  async function bulkPdf() {
    for (const id of selected) {
      const o = items.find((x) => x.id === id);
      if (o) await pdf(o);
    }
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const byStatus = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of OPEN) m[s] = 0;
    for (const o of items) m[o.status] = (m[o.status] || 0) + 1;
    return m;
  }, [items]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">İş Emirleri</h2>
          <p className="text-xs text-baykus-muted">Üretim › İş Emirleri · PDF · durum ilerlet · filtre</p>
        </div>
        <div className="flex gap-2">
          <Link href="/production" className="bk-btn bk-btn-ghost text-xs">
            Atölye
          </Link>
          <Link href="/orders/kanban" className="bk-btn bk-btn-primary text-xs">
            Kanban
          </Link>
          {selected.size > 0 && (
            <button type="button" className="bk-btn text-xs text-white" style={{ background: "#7c3aed" }} onClick={bulkPdf}>
              Seçilen PDF ({selected.size})
            </button>
          )}
        </div>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="flex flex-wrap gap-2 items-center">
        {OPEN.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(status === s ? "" : s)}
            className={`rounded px-2 py-1 text-[11px] font-medium border ${
              status === s ? "ring-1 ring-baykus-primary" : ""
            } ${statusBadgeClass(s)}`}
          >
            {s}: {byStatus[s] || 0}
          </button>
        ))}
        <input
          className="bk-input max-w-[180px] ml-auto text-xs"
          placeholder="Ara…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="text-xs text-baykus-muted">Listelenen: {filtered.length} iş emri</div>

      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th className="w-8"></th>
              <th>Sipariş</th>
              <th>Müşteri</th>
              <th>Durum</th>
              <th>Tasarım</th>
              <th>Kanal</th>
              <th className="text-right">Tutar</th>
              <th className="text-right">Kalan</th>
              <th>Teslim</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => {
              const tag = orderRowTag(o);
              const nxt = nextStatus(o.status);
              return (
                <tr key={o.id} className={orderRowTagClass(tag)}>
                  <td>
                    <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
                  </td>
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
                  <td className="text-xs">{o.design_status || "—"}</td>
                  <td className="text-xs">{o.channel || "—"}</td>
                  <td className="text-right tabular-nums">{formatMoney(Number(o.total_amount))}</td>
                  <td className="text-right tabular-nums text-amber-700">
                    {formatMoney(Number(o.remaining_amount))}
                  </td>
                  <td className="text-xs">
                    {o.delivery_date || o.due_date
                      ? new Date(o.delivery_date || o.due_date!).toLocaleDateString("tr-TR")
                      : "—"}
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
                    <Link href={`/orders/${o.id}/timeline`} className="text-baykus-primary hover:underline">
                      Çizgi
                    </Link>
                    <button
                      type="button"
                      className="font-semibold text-violet-700 hover:underline disabled:opacity-50"
                      disabled={busy === o.id}
                      onClick={() => pdf(o)}
                    >
                      {busy === o.id ? "…" : "PDF"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center text-baykus-muted py-8">
                  Açık iş emri yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
