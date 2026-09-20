"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
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
  orderRowTag,
  orderRowTagClass,
  statusBadgeClass,
} from "@/lib/api";
import { HubTabs } from "@/components/hub/HubChrome";

type NotebookTab =
  | "teklifler"
  | "siparisler"
  | "acik"
  | "hazirlaniyor"
  | "baskida"
  | "hazir"
  | "teslim";

const TAB_DEFS: { id: NotebookTab; label: string }[] = [
  { id: "teklifler", label: "Teklifler" },
  { id: "siparisler", label: "Siparişler" },
  { id: "acik", label: "Açık" },
  { id: "hazirlaniyor", label: "Hazırlanıyor" },
  { id: "baskida", label: "Baskıda" },
  { id: "hazir", label: "Hazır" },
  { id: "teslim", label: "Teslim" },
];

function tabFromStatusParam(status: string | null): NotebookTab | null {
  if (!status) return null;
  if (status === "Hazırlanıyor") return "hazirlaniyor";
  if (status === "Baskıda") return "baskida";
  if (status === "Hazır") return "hazir";
  if (status === "Teslim Edildi") return "teslim";
  return "siparisler";
}

function OrdersNotebookInner() {
  const sp = useSearchParams();
  const initialTab: NotebookTab =
    sp.get("tab") === "teklifler"
      ? "teklifler"
      : tabFromStatusParam(sp.get("status")) ||
        (sp.get("open") === "1" ? "acik" : "siparisler");

  const [tab, setTab] = useState<NotebookTab>(initialTab);
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [quotes, setQuotes] = useState<QuoteListItem[]>([]);
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("");
  const [designStatus, setDesignStatus] = useState("");
  const [bulkStatus, setBulkStatus] = useState("Hazırlanıyor");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [converting, setConverting] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (tab === "teklifler") {
        const data = await apiFetch<QuoteListItem[]>(
          `/api/quotes${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`,
        );
        setQuotes(data);
        setSelected(new Set());
      } else {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (channel) params.set("channel", channel);
        if (designStatus) params.set("design_status", designStatus);
        // Status-specific tabs filter client-side so counts stay consistent after load
        const qs = params.toString();
        let data = await apiFetch<OrderListItem[]>(`/api/orders${qs ? `?${qs}` : ""}`);
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
        setSelected(new Set());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }, [q, channel, designStatus, tab, sp]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredOrders = useMemo(() => {
    if (tab === "siparisler") return items;
    if (tab === "acik") {
      return items.filter((o) => o.status !== "Teslim Edildi" && o.status !== "Sipariş İptali");
    }
    if (tab === "hazirlaniyor") return items.filter((o) => o.status === "Hazırlanıyor");
    if (tab === "baskida") return items.filter((o) => o.status === "Baskıda");
    if (tab === "hazir") return items.filter((o) => o.status === "Hazır");
    if (tab === "teslim") return items.filter((o) => o.status === "Teslim Edildi");
    return items;
  }, [items, tab]);

  const summary = useMemo(() => {
    const open = items.filter((o) => o.status !== "Teslim Edildi" && o.status !== "Sipariş İptali");
    return {
      teklif: quotes.length,
      siparis: items.length,
      acik: open.length,
      hazir: items.filter((o) => o.status === "Hazır").length,
      teslim: items.filter((o) => o.status === "Teslim Edildi").length,
    };
  }, [items, quotes]);

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filteredOrders.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredOrders.map((o) => o.id)));
    }
  }

  async function applyBulkStatus() {
    if (selected.size === 0) {
      setError("Önce listeden kayıt seçin");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch<{ updated: number; failed: { id: number; error: string }[] }>(
        "/api/orders/bulk-status",
        {
          method: "POST",
          body: JSON.stringify({
            ids: Array.from(selected),
            status: bulkStatus,
            note: "Sipariş Merkezi toplu",
          }),
        },
      );
      if (res.failed?.length) {
        setError(`${res.updated} güncellendi, ${res.failed.length} hata`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Toplu güncelleme hatası");
    } finally {
      setBusy(false);
    }
  }

  async function softCancel(id: number) {
    if (!confirm("Bu siparişi iptal etmek istiyor musunuz?")) return;
    try {
      await apiFetch(`/api/orders/${id}?soft=true`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "İptal hatası");
    }
  }

  async function convertQuote(quoteId: number) {
    if (!confirm("Teklifi siparişe çevirmek istiyor musunuz? Stok düşümü sipariş kaydıyla uygulanır.")) return;
    setConverting(quoteId);
    setError("");
    try {
      const res = await apiFetch<{ order_id: number; order_number: string }>(
        `/api/quotes/${quoteId}/convert`,
        { method: "POST" },
      );
      window.location.href = `/orders/${res.order_id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dönüştürme hatası");
      setConverting(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <h1 className="text-lg font-bold text-baykus-text">Sipariş Merkezi</h1>
          <p className="text-xs text-baykus-muted">
            Teklif: {summary.teklif} · Sipariş: {summary.siparis} · Açık: {summary.acik} · Hazır:{" "}
            {summary.hazir} · Teslim: {summary.teslim}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/orders/kanban"
            className="bk-btn text-xs font-semibold text-white"
            style={{ backgroundColor: "#f59e0b" }}
          >
            Kanban / Yaşam Çizgisi
          </Link>
          <Link href="/production" className="bk-btn bk-btn-ghost text-xs">
            Atölye
          </Link>
          <Link href="/sales/create" className="bk-btn bk-btn-primary text-xs">
            + Satış / Teklif
          </Link>
        </div>
      </div>

      <HubTabs
        tabs={TAB_DEFS}
        active={tab}
        onChange={(id) => setTab(id as NotebookTab)}
      />

      <div className="bk-filter-bar">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") load();
          }}
          placeholder={tab === "teklifler" ? "Teklif no / müşteri…" : "No / müşteri / not ara…"}
          className="bk-input max-w-[220px]"
        />
        {tab !== "teklifler" && (
          <>
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className="bk-input max-w-[140px]">
              <option value="">Tüm kanallar</option>
              {ORDER_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={designStatus}
              onChange={(e) => setDesignStatus(e.target.value)}
              className="bk-input max-w-[150px]"
            >
              <option value="">Tüm tasarım</option>
              {DESIGN_STATUSES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            setQ("");
            setChannel("");
            setDesignStatus("");
          }}
          className="bk-btn bk-btn-ghost"
        >
          Temizle
        </button>
        <button type="button" onClick={load} className="bk-btn bk-btn-primary">
          Ara
        </button>
      </div>

      {tab !== "teklifler" && (
        <div className="flex flex-wrap items-center gap-2 mb-3 rounded-lg border border-baykus-line bg-white px-3 py-2">
          <span className="text-xs text-baykus-muted font-medium">Toplu durum</span>
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            className="bk-input max-w-[160px] py-1"
          >
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={applyBulkStatus}
            className="bk-btn text-xs text-white disabled:opacity-50"
            style={{ backgroundColor: "#198754" }}
          >
            {busy ? "Uygulanıyor…" : `Uygula (${selected.size})`}
          </button>
          <span className="text-[11px] text-baykus-muted ml-auto">
            Satır renkleri: teklif · açık · geciken · hazır · teslim
          </span>
        </div>
      )}

      {tab === "teklifler" && (
        <div className="flex flex-wrap gap-2 mb-3">
          <Link href="/sales/create?type=teklif" className="bk-btn text-xs text-white" style={{ backgroundColor: "#7c3aed" }}>
            Satış / Teklif Oluştur
          </Link>
        </div>
      )}

      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}

      {tab === "teklifler" ? (
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
                <tr>
                  <td colSpan={6} className="text-center text-slate-400 py-8">
                    Yükleniyor…
                  </td>
                </tr>
              )}
              {!loading &&
                quotes.map((qt) => (
                  <tr key={qt.id} className={orderRowTagClass("teklif")}>
                    <td className="font-medium">
                      <Link href={`/quotes/${qt.id}`} className="text-baykus-primary hover:underline">
                        {qt.quote_number}
                      </Link>
                    </td>
                    <td className="text-baykus-muted">{qt.customer_name || "—"}</td>
                    <td>{qt.status}</td>
                    <td>{formatMoney(Number(qt.total_amount))}</td>
                    <td className="text-baykus-muted">
                      {qt.valid_until ? String(qt.valid_until).slice(0, 10) : "—"}
                    </td>
                    <td className="text-right whitespace-nowrap space-x-2">
                      <Link href={`/quotes/${qt.id}`} className="text-baykus-primary hover:underline">
                        Aç
                      </Link>
                      {!qt.converted_order_id && qt.status !== "Siparişe Dönüştü" && !qt.is_cancelled && (
                        <button
                          type="button"
                          disabled={converting === qt.id}
                          onClick={() => convertQuote(qt.id)}
                          className="text-emerald-700 hover:underline font-medium"
                        >
                          {converting === qt.id ? "Çevriliyor…" : "Siparişe Çevir"}
                        </button>
                      )}
                      {qt.converted_order_id && (
                        <Link
                          href={`/orders/${qt.converted_order_id}`}
                          className="text-baykus-muted hover:underline"
                        >
                          Sipariş →
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              {!loading && quotes.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-slate-400 py-8">
                    Teklif yok
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
                <th className="w-8">
                  <input
                    type="checkbox"
                    checked={filteredOrders.length > 0 && selected.size === filteredOrders.length}
                    onChange={toggleSelectAll}
                    aria-label="Tümünü seç"
                  />
                </th>
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
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                    Yükleniyor…
                  </td>
                </tr>
              )}
              {!loading &&
                filteredOrders.map((o) => {
                  const tag = orderRowTag(o);
                  return (
                    <tr key={o.id} className={orderRowTagClass(tag)}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(o.id)}
                          onChange={() => toggleSelect(o.id)}
                          aria-label={`Seç ${o.order_number}`}
                        />
                      </td>
                      <td className="font-medium">
                        <Link href={`/orders/${o.id}`} className="text-baykus-primary hover:underline">
                          {o.order_number}
                        </Link>
                      </td>
                      <td className="text-baykus-muted">
                        {o.customer_name || "—"}
                        {o.customer_phone ? (
                          <div className="text-[10px] text-baykus-muted">{o.customer_phone}</div>
                        ) : null}
                      </td>
                      <td>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(o.status)}`}
                        >
                          {o.status}
                        </span>
                      </td>
                      <td className="text-baykus-muted">{o.channel || "—"}</td>
                      <td>
                        {o.design_status ? (
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${designStatusBadgeClass(o.design_status)}`}
                          >
                            {o.design_status}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{formatMoney(Number(o.total_amount))}</td>
                      <td>{formatMoney(Number(o.remaining_amount))}</td>
                      <td className="text-baykus-muted">
                        {o.due_date ? String(o.due_date).slice(0, 10) : "—"}
                      </td>
                      <td className="text-right whitespace-nowrap space-x-2">
                        <Link href={`/orders/${o.id}`} className="text-baykus-primary hover:underline">
                          Detay
                        </Link>
                        <Link
                          href={`/orders/${o.id}/timeline`}
                          className="text-slate-600 hover:underline"
                        >
                          Yaşam
                        </Link>
                        {o.status !== "Sipariş İptali" && (
                          <button
                            type="button"
                            onClick={() => softCancel(o.id)}
                            className="text-red-600 hover:underline"
                          >
                            İptal
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              {!loading && filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                    Sipariş yok
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

export default function OrdersListPage() {
  return (
    <Suspense fallback={<p className="text-sm text-baykus-muted">Yükleniyor…</p>}>
      <OrdersNotebookInner />
    </Suspense>
  );
}
