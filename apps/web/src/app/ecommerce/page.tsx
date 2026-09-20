"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ORDER_CHANNELS,
  OrderListItem,
  apiFetch,
  formatMoney,
  statusBadgeClass,
} from "@/lib/api";

const NET = ["internet", "Trendyol", "Hepsiburada", "N11"] as const;

export default function EcommerceHubPage() {
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [channel, setChannel] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "300" });
      if (channel) params.set("channel", channel);
      const data = await apiFetch<OrderListItem[]>(`/api/orders?${params}`);
      const filtered = channel
        ? data
        : data.filter((o) => NET.includes((o.channel || "") as (typeof NET)[number]));
      setItems(filtered);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }, [channel]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    let rows = items;
    if (status) rows = rows.filter((o) => o.status === status);
    const needle = q.trim().toLowerCase();
    if (needle) {
      rows = rows.filter((o) =>
        [o.order_number, o.customer_name, o.channel].join(" ").toLowerCase().includes(needle),
      );
    }
    return rows;
  }, [items, status, q]);

  const total = visible.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const remaining = visible.reduce((s, o) => s + Number(o.remaining_amount || 0), 0);
  const paid = visible.reduce((s, o) => s + Number(o.paid_amount || 0), 0);

  const byChannel = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of items) {
      const c = o.channel || "—";
      m[c] = (m[c] || 0) + 1;
    }
    return m;
  }, [items]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">İnternet Satışları</h2>
          <p className="text-xs text-baykus-muted">E-Ticaret › İnternet / pazaryeri siparişleri</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/sales/create?type=internet" className="bk-btn text-xs text-white" style={{ background: "#7c3aed" }}>
            + İnternet siparişi
          </Link>
          <Link href="/orders" className="bk-btn bk-btn-ghost text-xs">
            Sipariş merkezi
          </Link>
        </div>
      </div>

      <div className="grid sm:grid-cols-4 gap-2">
        <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2">
          <div className="text-[11px] text-emerald-800">Ciro</div>
          <div className="text-lg font-bold tabular-nums text-emerald-900">{formatMoney(total)}</div>
        </div>
        <div className="rounded border border-sky-200 bg-sky-50 px-3 py-2">
          <div className="text-[11px] text-sky-800">Tahsil</div>
          <div className="text-lg font-bold tabular-nums text-sky-900">{formatMoney(paid)}</div>
        </div>
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2">
          <div className="text-[11px] text-amber-800">Kalan</div>
          <div className="text-lg font-bold tabular-nums text-amber-900">{formatMoney(remaining)}</div>
        </div>
        <div className="rounded border bg-white px-3 py-2">
          <div className="text-[11px] text-baykus-muted">Sipariş</div>
          <div className="text-lg font-bold">{visible.length}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {Object.entries(byChannel).map(([c, n]) => (
          <button
            key={c}
            type="button"
            onClick={() => setChannel(channel === c ? "" : c)}
            className={`rounded px-2 py-1 text-[11px] border ${channel === c ? "ring-1 ring-violet-600 bg-violet-50" : "bg-white"}`}
          >
            {c}: {n}
          </button>
        ))}
      </div>

      <div className="bk-filter-bar">
        <select className="bk-input max-w-[180px]" value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="">Tüm internet kanalları</option>
          {NET.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          {ORDER_CHANNELS.filter((c) => !(NET as readonly string[]).includes(c)).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select className="bk-input max-w-[160px]" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tüm durumlar</option>
          {["Sipariş Alındı", "Hazırlanıyor", "Baskıda", "Hazır", "Teslim Edildi"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input className="bk-input max-w-[180px]" placeholder="Ara…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="bk-btn bk-btn-primary text-xs" onClick={load}>
          Ara
        </button>
        {loading && <span className="text-xs text-baykus-muted">Yükleniyor…</span>}
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Sipariş No</th>
              <th>Müşteri</th>
              <th>Kanal</th>
              <th>Durum</th>
              <th className="text-right">Tutar</th>
              <th className="text-right">Tahsil</th>
              <th className="text-right">Kalan</th>
              <th>Tarih</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link href={`/orders/${o.id}`} className="text-baykus-primary hover:underline font-medium">
                    {o.order_number}
                  </Link>
                </td>
                <td>{o.customer_name || "—"}</td>
                <td>
                  <span className="rounded bg-violet-50 text-violet-900 px-1.5 py-0.5 text-[10px]">{o.channel || "—"}</span>
                </td>
                <td>
                  <span className={`inline-block rounded px-2 py-0.5 text-[11px] ${statusBadgeClass(o.status)}`}>
                    {o.status}
                  </span>
                </td>
                <td className="text-right tabular-nums">{formatMoney(Number(o.total_amount))}</td>
                <td className="text-right tabular-nums text-emerald-700">{formatMoney(Number(o.paid_amount))}</td>
                <td className="text-right tabular-nums text-amber-700">{formatMoney(Number(o.remaining_amount))}</td>
                <td className="text-xs">
                  {o.created_at ? new Date(o.created_at).toLocaleDateString("tr-TR") : "—"}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-baykus-muted py-8">
                  İnternet siparişi yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
