"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  DESIGN_STATUSES,
  ORDER_CHANNELS,
  ORDER_STATUSES,
  OrderListItem,
  QuoteListItem,
  apiFetch,
  designStatusBadgeClass,
  formatMoney,
  statusBadgeClass,
} from "@/lib/api";
import { HubTabs } from "@/components/hub/HubChrome";

type NotebookTab = "siparisler" | "teklifler";

function OrdersNotebookInner() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<NotebookTab>(sp.get("tab") === "teklifler" ? "teklifler" : "siparisler");
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [quotes, setQuotes] = useState<QuoteListItem[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(sp.get("status") || "");
  const [channel, setChannel] = useState("");
  const [designStatus, setDesignStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const open = sp.get("open");
    const due = sp.get("due");
    const overdue = sp.get("overdue");
    if (open === "1") {
      // open orders — leave status empty; client can filter later
    }
    if (sp.get("status")) setStatus(sp.get("status") || "");
    if (due || overdue) {
      // keep list; filter client-side by due flags if needed
    }
  }, [sp]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (tab === "teklifler") {
        const data = await apiFetch<QuoteListItem[]>(`/api/quotes${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
        setQuotes(data);
      } else {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (status) params.set("status", status);
        if (channel) params.set("channel", channel);
        if (designStatus) params.set("design_status", designStatus);
        if (sp.get("open") === "1") {
          // exclude closed if API supports — filter client after
        }
        const qs = params.toString();
        let data = await apiFetch<OrderListItem[]>(`/api/orders${qs ? `?${qs}` : ""}`);
        if (sp.get("open") === "1") {
          data = data.filter((o) => o.status !== "Teslim Edildi" && o.status !== "Sipariş İptali");
        }
        if (sp.get("due") === "today") {
          const today = new Date().toISOString().slice(0, 10);
          data = data.filter((o) => o.due_date && String(o.due_date).slice(0, 10) === today);
        }
        if (sp.get("overdue") === "1") {
          const today = new Date().toISOString().slice(0, 10);
          data = data.filter(
            (o) =>
              o.due_date &&
              String(o.due_date).slice(0, 10) < today &&
              o.status !== "Teslim Edildi" &&
              o.status !== "Sipariş İptali",
          );
        }
        setItems(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }, [q, status, channel, designStatus, tab, sp]);

  useEffect(() => {
    load();
  }, [load]);

  async function softCancel(id: number) {
    if (!confirm("Bu siparişi iptal etmek istiyor musunuz?")) return;
    try {
      await apiFetch(`/api/orders/${id}?soft=true`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "İptal hatası");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <h1 className="text-lg font-bold text-baykus-text">Sipariş Merkezi</h1>
          <p className="text-xs text-baykus-muted">Teklifler · Siparişler · Kanban</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/orders/kanban" className="bk-btn text-xs font-semibold text-white" style={{ backgroundColor: "#f59e0b" }}>
            Kanban / Yaşam Çizgisi
          </Link>
          <Link href="/sales/create" className="bk-btn bk-btn-primary text-xs">
            + Satış / Teklif
          </Link>
          <Link href="/orders/new" className="bk-btn bk-btn-ghost text-xs">
            Klasik form
          </Link>
        </div>
      </div>

      <HubTabs
        tabs={[
          { id: "siparisler", label: "Siparişler" },
          { id: "teklifler", label: "Teklifler" },
        ]}
        active={tab}
        onChange={(id) => setTab(id as NotebookTab)}
      />

      <div className="bk-filter-bar">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tab === "teklifler" ? "Teklif no / müşteri…" : "No / müşteri / not ara…"}
          className="bk-input max-w-[220px]"
        />
        {tab === "siparisler" && (
          <>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="bk-input max-w-[160px]">
              <option value="">Tüm durumlar</option>
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className="bk-input max-w-[140px]">
              <option value="">Tüm kanallar</option>
              {ORDER_CHANNELS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select value={designStatus} onChange={(e) => setDesignStatus(e.target.value)} className="bk-input max-w-[140px]">
              <option value="">Tüm tasarım</option>
              {DESIGN_STATUSES.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            setQ("");
            setStatus("");
            setChannel("");
            setDesignStatus("");
          }}
          className="bk-btn bk-btn-ghost"
        >
          Temizle
        </button>
        <button onClick={load} className="bk-btn bk-btn-primary">Ara</button>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}

      {tab === "siparisler" && (
        <div className="bk-table-wrap">
          <table className="bk-table">
            <thead>
              <tr>
                <th>Sipariş No</th>
                <th>Müşteri</th>
                <th>Durum</th>
                <th>Kanal</th>
                <th>Tasarım</th>
                <th>Toplam</th>
                <th>Kalan</th>
                <th>Teslim</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">Yükleniyor…</td>
                </tr>
              )}
              {!loading &&
                items.map((o) => (
                  <tr key={o.id}>
                    <td className="font-medium">
                      <Link href={`/orders/${o.id}`} className="text-baykus-primary hover:underline">
                        {o.order_number}
                      </Link>
                    </td>
                    <td className="text-baykus-muted">{o.customer_name || "—"}</td>
                    <td>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(o.status)}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="text-baykus-muted">{o.channel || "—"}</td>
                    <td>
                      {o.design_status ? (
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${designStatusBadgeClass(o.design_status)}`}>
                          {o.design_status}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{formatMoney(Number(o.total_amount))}</td>
                    <td>{formatMoney(Number(o.remaining_amount))}</td>
                    <td className="text-baykus-muted">{o.due_date ? String(o.due_date).slice(0, 10) : "—"}</td>
                    <td className="text-right whitespace-nowrap space-x-2">
                      <Link href={`/orders/${o.id}`} className="text-baykus-primary hover:underline">Aç</Link>
                      {o.status !== "Sipariş İptali" && (
                        <button onClick={() => softCancel(o.id)} className="text-red-600 hover:underline">İptal</button>
                      )}
                    </td>
                  </tr>
                ))}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">Sipariş yok</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "teklifler" && (
        <div className="bk-table-wrap">
          <table className="bk-table">
            <thead>
              <tr>
                <th>Teklif No</th>
                <th>Müşteri</th>
                <th>Durum</th>
                <th>Toplam</th>
                <th>Geçerlilik</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="text-center text-slate-400 py-8">Yükleniyor…</td></tr>
              )}
              {!loading &&
                quotes.map((qt) => (
                  <tr key={qt.id}>
                    <td className="font-medium">
                      <Link href={`/quotes/${qt.id}`} className="text-baykus-primary hover:underline">
                        {qt.quote_number}
                      </Link>
                    </td>
                    <td className="text-baykus-muted">{qt.customer_name || "—"}</td>
                    <td>{qt.status}</td>
                    <td>{formatMoney(Number(qt.total_amount))}</td>
                    <td className="text-baykus-muted">{qt.valid_until ? String(qt.valid_until).slice(0, 10) : "—"}</td>
                    <td className="text-right">
                      <Link href={`/quotes/${qt.id}`} className="text-baykus-primary hover:underline">Aç</Link>
                    </td>
                  </tr>
                ))}
              {!loading && quotes.length === 0 && (
                <tr><td colSpan={6} className="text-center text-slate-400 py-8">Teklif yok</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function OrdersListPage() {
  return (
    <Suspense fallback={<p className="text-sm text-baykus-muted">Yükleniyor…</p>}>
      <OrdersNotebookInner />
    </Suspense>
  );
}
