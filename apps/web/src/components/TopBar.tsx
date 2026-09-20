"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { crumbsForPath, titleForPath } from "@/lib/nav";
import { openGlobalSearch } from "./GlobalSearchOverlay";

export default function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const crumbs = crumbsForPath(pathname);
  const title = titleForPath(pathname);

  return (
    <div className="bk-topbar sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-baykus-line bg-white px-3 py-2 shadow-sm">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 shadow-sm"
      >
        <span aria-hidden>←</span>
        Geri
      </button>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 shadow-sm"
      >
        <span aria-hidden>🏠</span>
        Ana Sayfa
      </Link>
      <button
        type="button"
        onClick={() => openGlobalSearch()}
        className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 hover:bg-white shadow-sm"
        title="Akıllı Arama (Ctrl+K)"
      >
        <span aria-hidden>⌕</span>
        Ara
        <kbd className="ml-1 rounded bg-white border border-slate-200 px-1 text-[10px] text-slate-400">Ctrl+K</kbd>
      </button>
      <div className="min-w-0 flex-1 pl-1">
        <div className="text-base font-bold text-baykus-text leading-tight truncate">{title}</div>
        <div className="text-xs text-baykus-muted truncate">
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`}>
              {i > 0 && <span className="mx-1 text-slate-400">&gt;</span>}
              {c.href && i < crumbs.length - 1 ? (
                <Link href={c.href} className="text-baykus-primary hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span>{c.label}</span>
              )}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
