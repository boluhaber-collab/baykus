"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ReportCatalogItem, apiFetch } from "@/lib/api";
import StatusFooter from "@/components/StatusFooter";

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
    <div className="space-y-2 pb-2">
      <div className="bk-sticky-header">
        <h1 className="text-lg font-bold text-baykus-text leading-tight">Raporlar</h1>
        <p className="text-baykus-muted text-[11px]">
          Masaüstü Raporlar menüsü — büyük düğmeler. Satış / kâr / finans raporlarında filtre + CSV vardır.
        </p>
      </div>
      {error && (
        <div className="rounded bg-amber-50 text-amber-800 px-3 py-2 text-sm">
          Katalog API: {error}
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {buttons.map((r) => (
          <Link
            key={r.key}
            href={r.href}
            className="rounded-md px-4 py-5 text-white shadow-sm hover:brightness-110 transition min-h-[6.5rem] flex flex-col justify-between"
            style={{ backgroundColor: r.color }}
          >
            <div className="text-base font-bold tracking-wide">{r.title}</div>
            <p className="text-xs opacity-90 mt-1.5">{r.description}</p>
            <div className="mt-2 text-[11px] font-semibold opacity-80">Raporu aç →</div>
          </Link>
        ))}
      </div>

      {apiItems.length > 0 && (
        <div className="text-[11px] text-baykus-muted">
          API katalog: {apiItems.map((i) => i.title).join(" · ")}
        </div>
      )}

      <StatusFooter />
    </div>
  );
}
