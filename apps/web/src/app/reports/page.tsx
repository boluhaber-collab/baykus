"use client";

import Link from "next/link";
import { REPORT_HUBS } from "@/lib/reportCatalog";
import StatusFooter from "@/components/StatusFooter";

export default function ReportsHubPage() {
  return (
    <div className="space-y-3 pb-2">
      <div className="bk-sticky-header">
        <h1 className="text-lg font-bold text-baykus-text leading-tight">Raporlar</h1>
        <p className="text-baykus-muted text-[11px]">
          BizimHesap Raporlar menüsü — Satışlar/Alışlar · Finansal · Stok · Müşteri Listesi
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {REPORT_HUBS.map((hub) => {
          const live = hub.tiles.filter((t) => t.status === "live").length;
          const oos = hub.tiles.filter((t) => t.status === "oos").length;
          return (
            <Link
              key={hub.key}
              href={hub.href}
              className="rounded-md px-5 py-6 text-white shadow-sm hover:brightness-110 transition min-h-[8rem] flex flex-col justify-between"
              style={{ backgroundColor: hub.color }}
            >
              <div>
                <div className="text-2xl mb-1">{hub.icon}</div>
                <div className="text-lg font-bold tracking-wide">{hub.title}</div>
                <p className="text-xs opacity-90 mt-1.5">{hub.description}</p>
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] font-semibold opacity-90">
                <span>
                  {hub.tiles.length} rapor · {live} canlı
                  {oos > 0 ? ` · ${oos} yakında` : ""}
                </span>
                <span>Aç →</span>
              </div>
            </Link>
          );
        })}
      </div>

      <StatusFooter />
    </div>
  );
}
