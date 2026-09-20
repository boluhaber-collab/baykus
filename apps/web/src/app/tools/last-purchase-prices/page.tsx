"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, formatMoney } from "@/lib/api";

type Row = {
  product_id: number | null;
  variant_id: number | null;
  description: string | null;
  unit_cost: number;
  quantity: number;
  purchase_number: string | null;
  purchase_date: string | null;
  supplier: string | null;
  product_name?: string | null;
  sku?: string | null;
  card_purchase_price?: number | null;
  card_cost?: number | null;
  card_sale_price?: number | null;
  source?: string;
};

export default function LastPurchasePricesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [onlyPurchase, setOnlyPurchase] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      const data = await apiFetch<{ rows: Row[]; summary?: { count: number } }>(
        `/api/reports/last-purchase-prices?${params}`,
      );
      setRows(data.rows || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (!onlyPurchase) return rows;
    return rows.filter((r) => r.source !== "product_card");
  }, [rows, onlyPurchase]);

  function exportCsv() {
    const header = ["SKU", "Ürün", "Tedarikçi", "Belge", "Tarih", "Son alış", "Kart alış", "Kart maliyet", "Satış", "Miktar"];
    const lines = [header.join(";")];
    for (const r of visible) {
      lines.push(
        [
          r.sku || "",
          r.description || r.product_name || "",
          r.supplier || "",
          r.purchase_number || "",
          r.purchase_date || "",
          r.unit_cost,
          r.card_purchase_price ?? "",
          r.card_cost ?? "",
          r.card_sale_price ?? "",
          r.quantity,
        ].join(";"),
      );
    }
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "son_alis_fiyatlari.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Son Alış Fiyatları</h2>
          <p className="text-xs text-baykus-muted">
            Fiyat / Maliyet › satın alma satırı + ürün kartı alış fiyatı
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/tools/costs" className="bk-btn bk-btn-ghost text-xs">
            Maliyet Yönetimi
          </Link>
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={exportCsv}>
            CSV
          </button>
        </div>
      </div>
      <div className="bk-filter-bar">
        <input
          className="bk-input max-w-xs"
          placeholder="Ürün / açıklama ara…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="button" className="bk-btn bk-btn-primary" onClick={load}>
          Ara
        </button>
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={onlyPurchase} onChange={(e) => setOnlyPurchase(e.target.checked)} />
          Sadece alış belgeleri
        </label>
        <span className="text-xs text-baykus-muted ml-auto">{visible.length} kayıt</span>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Ürün / Açıklama</th>
              <th>Tedarikçi</th>
              <th>Belge</th>
              <th>Tarih</th>
              <th className="text-right">Son alış</th>
              <th className="text-right">Kart alış</th>
              <th className="text-right">Satış</th>
              <th className="text-right">Miktar</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={i} className={r.source === "product_card" ? "bg-slate-50/80" : undefined}>
                <td className="font-medium">
                  {r.sku && <span className="text-[10px] text-baykus-muted mr-1">{r.sku}</span>}
                  {r.description || r.product_name || (r.product_id ? `#${r.product_id}` : "—")}
                  {r.source === "product_card" && (
                    <span className="ml-1 text-[10px] text-violet-600">kart</span>
                  )}
                  {r.product_id && (
                    <Link href={`/products/${r.product_id}`} className="ml-1 text-[10px] text-baykus-primary hover:underline">
                      ürün
                    </Link>
                  )}
                </td>
                <td>{r.supplier || "—"}</td>
                <td className="text-xs">{r.purchase_number || "—"}</td>
                <td className="text-xs">{r.purchase_date || "—"}</td>
                <td className="text-right tabular-nums font-semibold">{formatMoney(r.unit_cost)}</td>
                <td className="text-right tabular-nums text-xs text-baykus-muted">
                  {r.card_purchase_price != null ? formatMoney(r.card_purchase_price) : "—"}
                </td>
                <td className="text-right tabular-nums text-xs">
                  {r.card_sale_price != null ? formatMoney(r.card_sale_price) : "—"}
                </td>
                <td className="text-right tabular-nums">{r.quantity || "—"}</td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-baykus-muted py-8">
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
