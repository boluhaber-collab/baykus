"use client";

import { statusBadgeClass, quoteStatusBadgeClass } from "@/lib/api";

/** Desktop SIPARIS_DURUM_RENKLERI / TEKLIF_DURUM_RENKLERI */
const ORDER_BG: Record<string, string> = {
  "Sipariş Alındı": "#e0f2fe",
  "Hazırlanıyor": "#fef3c7",
  "Baskıda": "#ddd6fe",
  "Hazır": "#dcfce7",
  "Teslim Edildi": "#e5e7eb",
  "Sipariş İptali": "#fee2e2",
};

const QUOTE_BG: Record<string, string> = {
  Açık: "#f5f3ff",
  Taslak: "#f5f3ff",
  Gönderildi: "#e0f2fe",
  Onaylandı: "#dcfce7",
  Reddedildi: "#fee2e2",
  "Süresi Geçti": "#ffedd5",
  İptal: "#fee2e2",
  "Siparişe Dönüştü": "#ddd6fe",
};

export default function StatusBadge({
  status,
  kind = "order",
}: {
  status: string;
  kind?: "order" | "quote";
}) {
  const bg = kind === "quote" ? QUOTE_BG[status] : ORDER_BG[status];
  const fallback = kind === "quote" ? quoteStatusBadgeClass(status) : statusBadgeClass(status);
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium text-baykus-text ${bg ? "" : fallback}`}
      style={bg ? { backgroundColor: bg } : undefined}
    >
      {status}
    </span>
  );
}
