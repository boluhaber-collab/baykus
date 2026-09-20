"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { OrderListItem, apiFetch, formatMoney, statusBadgeClass } from "@/lib/api";
import StatusFooter from "@/components/StatusFooter";

/** Perakende Satışlar liste yaprağı — kanal=perakende */
export default function RetailSalesPage() {
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("Tümü");

  const load = useCallback(async () => {
    setError("");
    try {
      setItems(await apiFetch<OrderListItem[]>("/api/orders?channel=perakende&limit=300"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = items.filter((o) => {
    if (status !== "Tümü" && o.status !== status) return false;
    const needle = q.trim().toLocaleLowerCase("tr");
    if (!needle) return true;
    const hay = `${o.order_number} ${o.customer_name || ""} ${o.customer_phone || ""} ${o.notes || ""}`.toLocaleLowerCase("tr");
    return hay.includes(needle);
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Perakende Satışlar</h2>
          <p className="text-xs text-baykus-muted">Kanal: perakende</p>
        </div>
        <Link
          href="/sales/retail/new"
          className="bk-btn text-xs font-bold text-white"
          style={{ backgroundColor: "#198754" }}
        >
          + Perakende Satış Gir
        </Link>
      </div>

      <div className="bk-filter-bar">
        <label className="text-[11px] font-bold">Durum</label>
        <select className="bk-input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          {["Tümü", "Sipariş Alındı", "Hazırlanıyor", "Baskıda", "Hazır", "Teslim Edildi", "Sipariş İptali"].map(
            (s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ),
          )}
        </select>
        <input
          className="bk-input max-w-xs"
          placeholder="Ara…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="button" onClick={() => void load()} className="bk-btn bk-btn-ghost text-xs">
          Yenile
        </button>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Sipariş No</th>
              <th>Müşteri</th>
              <th>Telefon</th>
              <th>Teslim</th>
              <th className="text-right">Toplam</th>
              <th className="text-right">Kapora</th>
              <th className="text-right">Kalan</th>
              <th>Durum</th>
              <th>Not</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id}>
                <td className="text-xs whitespace-nowrap">
                  {new Date(o.created_at).toLocaleDateString("tr-TR")}
                </td>
                <td>
                  <Link href={`/orders/${o.id}`} className="text-baykus-primary hover:underline font-medium">
                    {o.order_number}
                  </Link>
                </td>
                <td>{o.customer_name || "Perakende Satışlar"}</td>
                <td className="text-xs">{o.customer_phone || "—"}</td>
                <td className="text-xs">
                  {o.delivery_date
                    ? new Date(o.delivery_date).toLocaleDateString("tr-TR")
                    : "—"}
                </td>
                <td className="text-right tabular-nums">{formatMoney(Number(o.total_amount))}</td>
                <td className="text-right tabular-nums">
                  {formatMoney(Number(o.paid_amount || o.deposit_amount || 0))}
                </td>
                <td className="text-right tabular-nums">{formatMoney(Number(o.remaining_amount))}</td>
                <td>
                  <span className={`inline-block rounded px-2 py-0.5 text-[11px] ${statusBadgeClass(o.status)}`}>
                    {o.status}
                  </span>
                </td>
                <td className="text-xs max-w-[12rem] truncate">{o.notes || "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center text-baykus-muted py-8">
                  Perakende satış yok —{" "}
                  <Link href="/sales/retail/new" className="text-baykus-primary hover:underline">
                    Perakende Satış Gir
                  </Link>
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
