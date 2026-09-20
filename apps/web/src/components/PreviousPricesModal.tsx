"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

type History = {
  product_id: number;
  product_name: string;
  sku: string;
  satislar: PriceRow[];
  alislar: PriceRow[];
  teklifler: PriceRow[];
};

type Tab = "satislar" | "alislar" | "teklifler";

type Props = {
  productId: number;
  productName?: string;
  customerName?: string;
  onClose: () => void;
  onPickPrice?: (price: number) => void;
};

/** Masaüstü onceki_fiyatlar_penceresi — satış satırından hızlı açılır. */
export default function PreviousPricesModal({
  productId,
  productName,
  customerName,
  onClose,
  onPickPrice,
}: Props) {
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("satislar");

  useEffect(() => {
    setError("");
    void apiFetch<History>(`/api/products/${productId}/history`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Yükleme hatası"));
  }, [productId]);

  const title = data?.product_name || productName || `Ürün #${productId}`;

  function table(rows: PriceRow[], empty: string) {
    if (!rows.length) {
      return <div className="text-center text-sm text-slate-400 py-10">{empty}</div>;
    }
    return (
      <div className="bk-table-wrap max-h-[360px] overflow-auto">
        <table className="bk-table text-xs">
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Cari / Tedarikçi</th>
              <th>Varyant</th>
              <th className="text-right">Miktar</th>
              <th className="text-right">Birim Fiyat</th>
              <th>Belge</th>
              <th>Durum</th>
              {onPickPrice && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.belge_no}-${i}`}>
                <td className="whitespace-nowrap">{r.tarih || "—"}</td>
                <td>{r.cari || "—"}</td>
                <td>{r.varyant || "—"}</td>
                <td className="text-right tabular-nums">{r.miktar ?? ""}</td>
                <td className="text-right tabular-nums font-semibold">{formatMoney(r.birim_fiyat || 0)}</td>
                <td>
                  {r.href ? (
                    <Link href={r.href} className="text-baykus-primary hover:underline" onClick={onClose}>
                      {r.belge_no}
                    </Link>
                  ) : (
                    r.belge_no || "—"
                  )}
                </td>
                <td>{r.durum || ""}</td>
                {onPickPrice && (
                  <td>
                    <button
                      type="button"
                      className="text-[#0f766e] hover:underline whitespace-nowrap"
                      onClick={() => {
                        onPickPrice(Number(r.birim_fiyat) || 0);
                        onClose();
                      }}
                    >
                      Kullan
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "satislar", label: "Önceki Satışlar", count: data?.satislar?.length || 0 },
    { key: "alislar", label: "Önceki Alışlar", count: data?.alislar?.length || 0 },
    { key: "teklifler", label: "Teklifler", count: data?.teklifler?.length || 0 },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-4xl rounded-lg bg-white shadow-xl overflow-hidden">
        <div className="bg-[#61cda5] text-white px-4 py-3 flex items-center justify-between">
          <div>
            <div className="font-bold text-sm tracking-wide">ÖNCEKİ FİYATLAR • {title.toUpperCase()}</div>
            <div className="text-[11px] text-emerald-50">
              Bu ürünün geçmiş işlem fiyatlarını tarih sırasıyla inceleyebilirsiniz.
              {customerName ? ` | Seçili cari: ${customerName}` : ""}
            </div>
          </div>
          <button type="button" className="text-2xl leading-none px-2" onClick={onClose} aria-label="Kapat">
            ×
          </button>
        </div>

        <div className="px-4 pt-3 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                tab === t.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              {t.label} ({t.count})
            </button>
          ))}
          <Link
            href={`/products/${productId}/history`}
            className="ml-auto text-xs text-baykus-primary hover:underline self-center"
            onClick={onClose}
          >
            Tam stok ekstresi →
          </Link>
        </div>

        <div className="p-4">
          {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm mb-3">{error}</div>}
          {!data && !error && <div className="text-sm text-slate-500 py-8 text-center">Yükleniyor…</div>}
          {data && tab === "satislar" && table(data.satislar || [], "Bu ürün için önceki satış kaydı bulunmuyor.")}
          {data &&
            tab === "alislar" &&
            table(data.alislar || [], "Bu ürün için önceki alış kaydı bulunmuyor.")}
          {data && tab === "teklifler" && table(data.teklifler || [], "Bu ürün için teklif kaydı bulunmuyor.")}
        </div>

        <div className="flex justify-end gap-2 bg-slate-50 px-4 py-3 border-t">
          <button type="button" className="bk-btn text-xs text-white" style={{ background: "#f0ad4e" }} onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
