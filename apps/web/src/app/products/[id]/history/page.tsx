"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, formatMoney } from "@/lib/api";

type PriceRow = {
  tarih?: string | null;
  cari?: string;
  varyant?: string;
  miktar?: number;
  birim_fiyat?: number;
  belge_no?: string;
  durum?: string;
  href?: string;
};

type StockMov = {
  id: number;
  direction: string;
  quantity: number;
  qty_before: number;
  qty_after: number;
  reason?: string | null;
  note?: string | null;
  warehouse?: string | null;
  created_at?: string | null;
};

type History = {
  product_id: number;
  product_name: string;
  sku: string;
  stock_movements: StockMov[];
  satislar: PriceRow[];
  alislar: PriceRow[];
  teklifler: PriceRow[];
};

type Tab = "stok" | "satislar" | "alislar" | "teklifler";

export default function ProductHistoryPage() {
  const params = useParams();
  const id = Number(params.id);
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("stok");

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await apiFetch<History>(`/api/products/${id}/history`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [id]);

  useEffect(() => {
    if (Number.isFinite(id)) void load();
  }, [id, load]);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "stok", label: "Stok Ekstresi", count: data?.stock_movements?.length || 0 },
    { key: "satislar", label: "Önceki Satışlar", count: data?.satislar?.length || 0 },
    { key: "alislar", label: "Önceki Alışlar", count: data?.alislar?.length || 0 },
    { key: "teklifler", label: "Teklifler", count: data?.teklifler?.length || 0 },
  ];

  function priceTable(rows: PriceRow[], empty: string) {
    if (!rows.length) {
      return <div className="text-center text-sm text-slate-400 py-10">{empty}</div>;
    }
    return (
      <div className="bk-table-wrap">
        <table className="bk-table text-sm">
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Cari / Tedarikçi</th>
              <th>Varyant</th>
              <th className="text-right">Miktar</th>
              <th className="text-right">Birim Fiyat</th>
              <th>Belge No</th>
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap">{r.tarih || "—"}</td>
                <td>{r.cari || "—"}</td>
                <td className="text-xs text-slate-500">{r.varyant || "—"}</td>
                <td className="text-right tabular-nums">{r.miktar ?? "—"}</td>
                <td className="text-right tabular-nums font-medium">{formatMoney(Number(r.birim_fiyat || 0))}</td>
                <td>
                  {r.href ? (
                    <Link href={r.href} className="text-baykus-primary hover:underline">
                      {r.belge_no}
                    </Link>
                  ) : (
                    r.belge_no || "—"
                  )}
                </td>
                <td className="text-xs">{r.durum || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className="rounded-xl text-white px-4 py-3 flex flex-wrap justify-between gap-2"
        style={{ background: "#61cda5" }}
      >
        <div>
          <div className="text-lg font-bold">
            ÖNCEKİ FİYATLAR / STOK EKSTRESİ · {(data?.product_name || "…").toLocaleUpperCase("tr")}
          </div>
          <div className="text-xs opacity-90">SKU: {data?.sku || "—"}</div>
        </div>
        <div className="flex gap-2">
          <Link href={`/products/${id}`} className="rounded bg-white/20 px-3 py-1.5 text-xs font-medium hover:bg-white/30">
            ← Ürün kartı
          </Link>
          <button type="button" className="rounded bg-white/20 px-3 py-1.5 text-xs font-medium hover:bg-white/30" onClick={() => void load()}>
            Yenile
          </button>
        </div>
      </div>

      <div className="rounded bg-amber-50 text-amber-900 text-xs px-3 py-2">
        Bu ürünün geçmiş işlem fiyatlarını ve stok hareketlerini tarih sırasıyla inceleyebilirsiniz.
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="flex flex-wrap gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-xs font-semibold ${
              tab === t.key ? "border-b-2 border-emerald-600 text-emerald-700" : "text-slate-500"
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {tab === "stok" && (
        <div className="bk-table-wrap">
          <table className="bk-table text-sm">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Yön</th>
                <th className="text-right">Miktar</th>
                <th className="text-right">Önce</th>
                <th className="text-right">Sonra</th>
                <th>Depo</th>
                <th>Neden / Not</th>
              </tr>
            </thead>
            <tbody>
              {(data?.stock_movements || []).map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap text-xs">{m.created_at?.slice(0, 19).replace("T", " ") || "—"}</td>
                  <td>
                    <span
                      className={`text-xs font-semibold ${
                        m.direction === "increase" ? "text-emerald-700" : "text-red-700"
                      }`}
                    >
                      {m.direction === "increase" ? "Giriş" : "Çıkış"}
                    </span>
                  </td>
                  <td className="text-right tabular-nums">{m.quantity}</td>
                  <td className="text-right tabular-nums text-slate-500">{m.qty_before}</td>
                  <td className="text-right tabular-nums font-medium">{m.qty_after}</td>
                  <td className="text-xs">{m.warehouse || "—"}</td>
                  <td className="text-xs text-slate-500">
                    {[m.reason, m.note].filter(Boolean).join(" · ") || "—"}
                  </td>
                </tr>
              ))}
              {(data?.stock_movements || []).length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-slate-400 py-8">
                    Stok hareketi yok
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {tab === "satislar" && priceTable(data?.satislar || [], "Bu ürün için önceki satış kaydı bulunmuyor.")}
      {tab === "alislar" && priceTable(data?.alislar || [], "Bu ürün için önceki alış kaydı bulunmuyor.")}
      {tab === "teklifler" && priceTable(data?.teklifler || [], "Bu ürün için teklif kaydı bulunmuyor.")}
    </div>
  );
}
