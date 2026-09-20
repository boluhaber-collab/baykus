"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ReportCatalogItem, apiFetch } from "@/lib/api";

const FALLBACK: ReportCatalogItem[] = [
  {
    key: "sales",
    title: "Satış raporu",
    path: "/api/reports/sales",
    href: "/reports/sales",
    description: "Siparişler: adet, ciro, durum dağılımı (tarih aralığı)",
  },
  {
    key: "stock",
    title: "Stok raporu",
    path: "/api/reports/stock",
    href: "/reports/stock",
    description: "Ürün/varyant miktar, değer tahmini, kritik bayrak",
  },
  {
    key: "receivables",
    title: "Cari / alacak raporu",
    path: "/api/reports/receivables",
    href: "/reports/receivables",
    description: "Müşteri bakiyeleri ve toplam alacak",
  },
  {
    key: "payables",
    title: "Tedarikçi borç raporu",
    path: "/api/reports/payables",
    href: "/reports/payables",
    description: "Tedarikçi borç bakiyeleri",
  },
  {
    key: "finance",
    title: "Kasa / banka hareket raporu",
    path: "/api/reports/finance",
    href: "/reports/finance",
    description: "Kasa ve banka hareketleri (tarih aralığı)",
  },
  {
    key: "profit",
    title: "Kar özeti (basit)",
    path: "/api/reports/profit",
    href: "/reports/profit",
    description: "Ay ciro vs onaylı satın alma maliyeti — basit yaklaşım",
  },
];

const ICONS: Record<string, string> = {
  sales: "🛒",
  stock: "📦",
  receivables: "📒",
  payables: "📉",
  finance: "💰",
  profit: "📊",
};

export default function ReportsHubPage() {
  const [items, setItems] = useState<ReportCatalogItem[]>(FALLBACK);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<{ reports: ReportCatalogItem[] }>("/api/reports")
      .then((d) => {
        if (d.reports?.length) setItems(d.reports);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Yükleme hatası"));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Raporlar</h1>
      <p className="text-slate-500 text-sm mb-6">
        Canlı veriden üretilen özet tablolar. CSV indirme her raporda mevcut.
      </p>
      {error && (
        <div className="mb-4 rounded-lg bg-amber-50 text-amber-800 px-4 py-2 text-sm">
          Katalog API: {error} — yerel liste gösteriliyor.
        </div>
      )}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((r) => (
          <Link
            key={r.key}
            href={r.href}
            className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-baykus-400 hover:shadow-md transition"
          >
            <div className="text-2xl mb-2">{ICONS[r.key] || "📈"}</div>
            <div className="font-semibold text-slate-900 group-hover:text-baykus-700">
              {r.title}
            </div>
            <p className="text-sm text-slate-500 mt-1">{r.description}</p>
            <div className="mt-3 text-xs text-baykus-600 font-medium">Raporu aç →</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
