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
import StatusFooter from "@/components/StatusFooter";
import { formatTrDate } from "@/lib/dates";

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
    <div className="space-y-2 pb-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-baykus-text leading-tight">İnternet Satışları</h2>
          <p className="text-[11px] text-baykus-muted">E-Ticaret › İnternet / pazaryeri siparişleri</p>
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

      <div className="bk-kpi-strip">
        <div className="bk-kpi-card" style={{ backgroundColor: "#198754" }}>
          <span className="bk-kpi-icon">₺</span>
          <div className="flex-1 text-right">
            <div className="bk-kpi-label">Ciro</div>
            <div className="bk-kpi-value truncate">{formatMoney(total)}</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#0f766e" }}>
          <span className="bk-kpi-icon">✓</span>
          <div className="flex-1 text-right">
            <div className="bk-kpi-label">Tahsil</div>
            <div className="bk-kpi-value truncate">{formatMoney(paid)}</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#f59e0b" }}>
          <span className="bk-kpi-icon">⏳</span>
          <div className="flex-1 text-right">
            <div className="bk-kpi-label">Kalan</div>
            <div className="bk-kpi-value truncate">{formatMoney(remaining)}</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#7c3aed" }}>
          <span className="bk-kpi-icon">🌐</span>
          <div className="flex-1 text-right">
            <div className="bk-kpi-label">Sipariş</div>
            <div className="bk-kpi-value">{visible.length}</div>
          </div>
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
                  {formatTrDate(o.created_at)}
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
      <StatusFooter onRefresh={load} />
    </div>
  );
}