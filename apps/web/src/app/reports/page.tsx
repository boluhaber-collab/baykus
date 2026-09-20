"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ReportCatalogItem, apiFetch } from "@/lib/api";

/** Masaüstü Raporlar menü renkleri birebir */
const DESKTOP_REPORTS: {
  key: string;
  title: string;
  href: string;
  color: string;
  description: string;
}[] = [
  {
    key: "archive",
    title: "Belge Arşiv Merkezi",
    href: "/reports/archive",
    color: "#111827",
    description: "PDF / evrak arşivi",
  },
  {
    key: "profit",
    title: "Kâr Analizi",
    href: "/reports/profit",
    color: "#ea580c",
    description: "Ciro vs maliyet · CSV",
  },
  {
    key: "expenses",
    title: "Masraflar",
    href: "/reports/expenses",
    color: "#be123c",
    description: "İşyeri masraf raporu · filtre + CSV",
  },
  {
    key: "cari",
    title: "Cari Dökümler",
    href: "/reports/cari-statements",
    color: "#0f766e",
    description: "Müşteri / tedarikçi ekstre · CSV/PDF",
  },
  {
    key: "sales",
    title: "Satış Raporu",
    href: "/reports/sales",
    color: "#1f6feb",
    description: "Sipariş ciro · tarih/durum filtre · CSV",
  },
  {
    key: "purchases",
    title: "Alış Raporu",
    href: "/reports/purchases",
    color: "#198754",
    description: "Satın alma · filtre + CSV",
  },
];

const EXTRA: typeof DESKTOP_REPORTS = [
  {
    key: "finance",
    title: "Kasa / Banka",
    href: "/reports/finance",
    color: "#7c3aed",
    description: "Hareket raporu · tarih filtre · CSV",
  },
  {
    key: "stock",
    title: "Stok Raporu",
    href: "/reports/stock",
    color: "#0369a1",
    description: "Stok miktar / değer / kritik",
  },
  {
    key: "receivables",
    title: "Alacaklar",
    href: "/reports/receivables",
    color: "#b45309",
    description: "Açık cari alacaklar",
  },
];

export default function ReportsHubPage() {
  const [apiItems, setApiItems] = useState<ReportCatalogItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<{ reports: ReportCatalogItem[] }>("/api/reports")
      .then((d) => setApiItems(d.reports || []))
      .catch((e) => setError(e instanceof Error ? e.message : "Katalog hatası"));
  }, []);

  const buttons = [...DESKTOP_REPORTS, ...EXTRA];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Raporlar</h1>
      <p className="text-slate-500 text-sm mb-6">
        Masaüstü Raporlar menüsü — büyük düğmeler. Satış / kâr / finans raporlarında filtre + CSV vardır.
      </p>
      {error && (
        <div className="mb-4 rounded-lg bg-amber-50 text-amber-800 px-4 py-2 text-sm">
          Katalog API: {error}
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {buttons.map((r) => (
          <Link
            key={r.key}
            href={r.href}
            className="rounded-xl px-5 py-6 text-white shadow-md hover:brightness-110 transition min-h-[7.5rem] flex flex-col justify-between"
            style={{ backgroundColor: r.color }}
          >
            <div className="text-lg font-bold tracking-wide">{r.title}</div>
            <p className="text-sm opacity-90 mt-2">{r.description}</p>
            <div className="mt-3 text-xs font-semibold opacity-80">Raporu aç →</div>
          </Link>
        ))}
      </div>

      {apiItems.length > 0 && (
        <div className="text-xs text-slate-400">
          API katalog: {apiItems.map((i) => i.title).join(" · ")}
        </div>
      )}
    </div>
  );
}
