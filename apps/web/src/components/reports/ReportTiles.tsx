"use client";

import Link from "next/link";
import { ReportHub, ReportTile } from "@/lib/reportCatalog";
import StatusFooter from "@/components/StatusFooter";

export function ReportTileCard({ tile }: { tile: ReportTile }) {
  const oos = tile.status === "oos";
  return (
    <Link
      href={tile.href}
      className="relative rounded-md px-4 py-5 text-white shadow-sm hover:brightness-110 transition min-h-[7rem] flex flex-col justify-between overflow-hidden"
      style={{ backgroundColor: tile.color, opacity: oos ? 0.85 : 1 }}
    >
      {oos && (
        <span className="absolute top-2 right-2 rounded bg-black/35 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
          Yakında
        </span>
      )}
      <div className="flex items-start gap-2">
        {tile.icon && <span className="text-xl leading-none opacity-95">{tile.icon}</span>}
        <div className="text-sm font-bold tracking-wide leading-snug">{tile.title}</div>
      </div>
      {tile.description && (
        <p className="text-[11px] opacity-90 mt-2 leading-snug">{tile.description}</p>
      )}
      <div className="mt-2 text-[11px] font-semibold opacity-80">
        {oos ? "Boş durum →" : "Raporu aç →"}
      </div>
    </Link>
  );
}

export function ReportTileGrid({ tiles }: { tiles: ReportTile[] }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {tiles.map((t) => (
        <ReportTileCard key={t.key} tile={t} />
      ))}
    </div>
  );
}

export function ReportHubPage({ hub }: { hub: ReportHub }) {
  const live = hub.tiles.filter((t) => t.status === "live").length;
  const oos = hub.tiles.filter((t) => t.status === "oos").length;
  return (
    <div className="space-y-3 pb-2">
      <div className="bk-sticky-header">
        <div className="text-[11px] text-baykus-muted mb-0.5">
          <Link href="/reports" className="hover:underline text-baykus-primary">
            Raporlar
          </Link>
          <span className="mx-1">/</span>
          <span>{hub.title}</span>
        </div>
        <h1 className="text-lg font-bold text-baykus-text leading-tight flex items-center gap-2">
          <span>{hub.icon}</span>
          {hub.title}
        </h1>
        <p className="text-baykus-muted text-[11px]">
          {hub.description} · {live} canlı · {oos > 0 ? `${oos} yakında (OOS)` : "tümü canlı"}
        </p>
      </div>
      <ReportTileGrid tiles={hub.tiles} />
      <StatusFooter />
    </div>
  );
}
