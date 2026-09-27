"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  QUOTE_STATUSES,
  QuoteListItem,
  apiFetch,
  formatMoney,
  quoteStatusBadgeClass,
} from "@/lib/api";
import StatusFooter from "@/components/StatusFooter";

export default function QuotesPage() {
  const router = useRouter();
  const [items, setItems] = useState<QuoteListItem[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [converting, setConverting] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      const qs = params.toString();
      const data = await apiFetch<QuoteListItem[]>(`/api/quotes${qs ? `?${qs}` : ""}`);
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }, [q, status]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    const open = items.filter((i) => i.status !== "Siparişe Dönüştü" && i.status !== "Reddedildi");
    const converted = items.filter((i) => i.status === "Siparişe Dönüştü" || i.converted_order_id);
    const total = open.reduce((s, i) => s + Number(i.total_amount || 0), 0);
    return { count: items.length, open: open.length, converted: converted.length, total };
  }, [items]);

  async function softCancel(id: number) {
    if (!confirm("Bu teklifi iptal (Reddedildi) etmek istiyor musunuz?")) return;
    try {
      await apiFetch(`/api/quotes/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "İptal hatası");
    }
  }

  async function convert(id: number) {
    if (!confirm("Teklif siparişe dönüştürülsün mü?")) return;
    setConverting(id);
    setError("");
    try {
      const res = await apiFetch<{ order_id: number; order_number?: string }>(
        `/api/quotes/${id}/convert`,
        { method: "POST" },
      );
      await load();
      if (res.order_id) router.push(`/orders/${res.order_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dönüştürme hatası");
    } finally {
      setConverting(null);
    }
  }

  return (
    <div className="space-y-2 pb-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-baykus-text leading-tight">Teklifler</h1>
          <p className="text-[11px] text-baykus-muted">Satış / Sipariş › Teklifler · siparişe dönüştür</p>
        </div>
        <Link href="/quotes/new" className="bk-btn bk-btn-primary text-xs font-bold">
          + Yeni Teklif
        </Link>
      </div>

      <div className="bk-kpi-strip">
        <div className="bk-kpi-card" style={{ backgroundColor: "#334155" }}>
          <span className="bk-kpi-icon">☰</span>
          <div className="flex-1 text-right">
            <div className="bk-kpi-label">Listelenen</div>
            <div className="bk-kpi-value">{summary.count}</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#2563eb" }}>
          <span className="bk-kpi-icon">○</span>
          <div className="flex-1 text-right">
            <div className="bk-kpi-label">Açık Teklif</div>
            <div className="bk-kpi-value">{summary.open}</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#198754" }}>
          <span className="bk-kpi-icon">→</span>
          <div className="flex-1 text-right">
            <div className="bk-kpi-label">Siparişe Dönüşen</div>
            <div className="bk-kpi-value">{summary.converted}</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#c2185b" }}>
          <span className="bk-kpi-icon">₺</span>
          <div className="flex-1 text-right">
            <div className="bk-kpi-label">Açık Toplam</div>
            <div className="bk-kpi-value truncate">{formatMoney(summary.total)}</div>
          </div>
        </div>
      </div>

      <fieldset className="rounded border border-baykus-line bg-white px-3 py-2">
        <legend className="px-1 text-xs font-bold">Filtreler</legend>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="No / müşteri / not ara…"
            className="bk-input max-w-xs"
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="bk-input w-auto">
            <option value="">Tüm durumlar</option>
            {QUOTE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button type="button" onClick={load} className="bk-btn bk-btn-primary text-xs">
            Ara
          </button>
        </div>
      </fieldset>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {loading && <p className="text-baykus-muted text-xs">Yükleniyor…</p>}

      <fieldset className="rounded border border-baykus-line bg-white px-2 py-2">
        <legend className="px-1 text-xs font-bold">Teklif Listesi · Satırdan Siparişe Dönüştür</legend>
        <div className="bk-table-wrap border-0">
          <table className="bk-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Müşteri</th>
                <th>Durum</th>
                <th className="text-right">Tutar</th>
                <th>Geçerlilik</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const canConvert =
                  !item.converted_order_id &&
                  item.status !== "Siparişe Dönüştü" &&
                  item.status !== "Reddedildi";
                return (
                  <tr key={item.id}>
                    <td>
                      <Link
                        href={`/quotes/${item.id}`}
                        className="text-baykus-primary font-medium hover:underline"
                      >
                        {item.quote_number}
                      </Link>
                    </td>
                    <td>{item.customer_name || "—"}</td>
                    <td>
                      <span
                        className={`inline-flex rounded px-2 py-0.5 text-[11px] font-medium ${quoteStatusBadgeClass(item.status)}`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="text-right tabular-nums font-medium">
                      {formatMoney(Number(item.total_amount))}
                    </td>
                    <td className="text-xs">{item.valid_until || "—"}</td>
                    <td className="whitespace-nowrap space-x-1">
                      <Link
                        href={`/quotes/${item.id}`}
                        className="bk-btn bk-btn-ghost text-[11px] py-1 px-2"
                      >
                        Aç
                      </Link>
                      {canConvert && (
                        <button
                          type="button"
                          disabled={converting === item.id}
                          onClick={() => void convert(item.id)}
                          className="bk-btn text-[11px] py-1 px-2 font-bold text-white"
                          style={{ backgroundColor: "#198754" }}
                        >
                          {converting === item.id ? "…" : "→ Sipariş"}
                        </button>
                      )}
                      {item.converted_order_id && (
                        <Link
                          href={`/orders/${item.converted_order_id}`}
                          className="bk-btn text-[11px] py-1 px-2 font-bold text-white"
                          style={{ backgroundColor: "#7c3aed" }}
                        >
                          Sipariş
                        </Link>
                      )}
                      {canConvert && (
                        <button
                          type="button"
                          onClick={() => softCancel(item.id)}
                          className="bk-btn bk-btn-danger text-[11px] py-1 px-2"
                        >
                          İptal
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="text-center text-baykus-muted py-10">
                    Henüz teklif yok.{" "}
                    <Link href="/quotes/new" className="text-baykus-primary hover:underline">
                      Yeni teklif oluştur
                    </Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </fieldset>

      <StatusFooter onRefresh={load} />
    </div>
  );
}
