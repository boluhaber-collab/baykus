"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { clearToken } from "@/lib/api";

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  // Prefer the most specific nav match (e.g. /orders/kanban over /orders)
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
    <aside className="flex w-64 flex-col bg-baykus-900 text-white min-h-screen">
      <div className="px-5 py-6 border-b border-slate-700">
        <div className="text-2xl font-bold tracking-tight">🦉 Baykuş</div>
        <div className="text-xs text-slate-400 mt-1">Baskı ERP</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                active ? "bg-baykus-600 text-white" : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-slate-700">
        <button
          onClick={logout}
          className="w-full rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700"
        >
          Çıkış Yap
        </button>
      </div>
    </aside>
  );
}
