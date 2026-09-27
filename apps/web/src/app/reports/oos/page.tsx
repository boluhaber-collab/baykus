"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import StatusFooter from "@/components/StatusFooter";

function OosInner() {
  const sp = useSearchParams();
  const title = sp.get("title") || "Rapor";
  const key = sp.get("key") || "";

  return (
    <div className="space-y-3 pb-2">
      <div className="bk-sticky-header">
        <div className="text-[11px] text-baykus-muted mb-0.5">
          <Link href="/reports" className="hover:underline text-baykus-primary">
            Raporlar
          </Link>
          <span className="mx-1">/</span>
          <span>{title}</span>
        </div>
        <h1 className="text-lg font-bold text-baykus-text leading-tight">{title}</h1>
        <p className="text-baykus-muted text-[11px]">Bu rapor Baykuş’ta henüz canlı değil (OOS)</p>
      </div>

      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
        <div className="text-4xl mb-3 opacity-60">🚧</div>
        <div className="text-base font-bold text-slate-700">{title}</div>
        <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
          BizimHesap menüsünde bulunan bu rapor için Baykuş’ta henüz veri modeli veya API yok.
          Sahte rakam gösterilmez — modül hazır olunca buraya bağlanacak.
        </p>
        {key && (
          <p className="mt-3 text-[11px] text-slate-400 font-mono">oos:{key}</p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            href="/reports"
            className="rounded bg-slate-800 text-white px-4 py-2 text-sm font-semibold"
          >
            Raporlar hub
          </Link>
          <Link
            href="/reports/financial"
            className="rounded bg-violet-700 text-white px-4 py-2 text-sm font-semibold"
          >
            Finansal Raporlar
          </Link>
        </div>
      </div>

      <StatusFooter />
    </div>
  );
}

export default function OosReportPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-slate-500">Yükleniyor…</div>}>
      <OosInner />
    </Suspense>
  );
}
