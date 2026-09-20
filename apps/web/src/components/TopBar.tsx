"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { crumbsForPath, titleForPath } from "@/lib/nav";

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
