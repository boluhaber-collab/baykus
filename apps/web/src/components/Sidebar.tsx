"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { clearToken } from "@/lib/api";

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  const moreSpecific = NAV_ITEMS.some(
    (other) =>
      other.href !== href &&
      other.href.startsWith(href + "/") &&
      (pathname === other.href || pathname.startsWith(other.href + "/")),
  );
  if (moreSpecific) return false;
  return pathname.startsWith(href + "/");
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  function logout() {
    clearToken();
    router.push("/login");
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-baykus-splash text-white min-h-screen border-r border-slate-800">
      <div className="px-4 py-5 border-b border-slate-700/80">
        <div className="text-lg font-bold tracking-tight flex items-center gap-2">
          <span className="text-2xl">🦉</span>
          <span>BAYKUŞ BASKI</span>
        </div>
        <div className="text-[11px] text-baykus-accent mt-1 tracking-wide uppercase">
          İşletme Programı
        </div>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition ${
                active
                  ? "bg-baykus-primary text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <span className="w-5 text-center opacity-90">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-slate-700/80">
        <button
          onClick={logout}
          className="w-full rounded-md bg-slate-800 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700"
        >
          Çıkış Yap
        </button>
      </div>
    </aside>
  );
}
