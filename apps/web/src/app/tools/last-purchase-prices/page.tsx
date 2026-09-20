"use client";

import { useCallback, useEffect, useState } from "react";
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
};

export default function LastPurchasePricesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      const data = await apiFetch<{ rows: Row[] }>(`/api/reports/last-purchase-prices?${params}`);
      setRows(data.rows || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [q]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold">Son Alış Fiyatları</h2>
        <p className="text-xs text-baykus-muted">Satın alma satırlarından ürün bazlı en son birim maliyet</p>
      </div>
      <div className="bk-filter-bar">
        <input className="bk-input max-w-xs" placeholder="Ürün / açıklama ara…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="bk-btn bk-btn-primary" onClick={load}>Ara</button>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Ürün / Açıklama</th><th>Tedarikçi</th><th>Belge</th><th>Tarih</th>
              <th className="text-right">Birim maliyet</th><th className="text-right">Miktar</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="font-medium">{r.description || (r.product_id ? `#${r.product_id}` : "—")}</td>
                <td>{r.supplier || "—"}</td>
                <td className="text-xs">{r.purchase_number || "—"}</td>
                <td className="text-xs">{r.purchase_date || "—"}</td>
                <td className="text-right tabular-nums font-semibold">{formatMoney(r.unit_cost)}</td>
                <td className="text-right tabular-nums">{r.quantity}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="text-center text-baykus-muted py-8">Kayıt yok</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
