"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { NAV_GROUPS, NavGroup, orderNavGroups } from "@/lib/nav";
import { AppSettings, apiFetch, clearToken } from "@/lib/api";

function pathMatches(pathname: string, href: string): boolean {
  const clean = href.split("?")[0];
  if (pathname === clean) return true;
  return pathname.startsWith(clean + "/");
}

function groupIsActive(pathname: string, group: NavGroup): boolean {
  if (group.href && pathMatches(pathname, group.href)) return true;
  return group.items.some((i) => pathMatches(pathname, i.href));
}

function leafIsActive(pathname: string, href: string, siblings: string[]): boolean {
  const clean = href.split("?")[0];
  if (pathname === clean) return true;
  const moreSpecific = siblings.some(
    (other) =>
      other !== clean &&
      other.startsWith(clean + "/") &&
      (pathname === other || pathname.startsWith(other + "/")),
  );
  if (moreSpecific) return false;
  return pathname.startsWith(clean + "/");
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [groups, setGroups] = useState<NavGroup[]>(NAV_GROUPS);

  useEffect(() => {
    function applyFromSettings(s: AppSettings | null) {
      if (!s) return;
      setGroups(orderNavGroups(NAV_GROUPS, s.sol_menu_sirasi, s.sol_menu_adlari));
    }
    try {
      const cached = localStorage.getItem("baykus_app_settings");
      if (cached) applyFromSettings(JSON.parse(cached) as AppSettings);
    } catch {
      /* ignore */
    }
    void apiFetch<AppSettings>("/api/settings/app")
      .then((s) => {
        try {
          localStorage.setItem("baykus_app_settings", JSON.stringify(s));
        } catch {
          /* ignore */
        }
        applyFromSettings(s);
      })
      .catch(() => {
        /* guest / no token — keep default */
      });
    function onChanged() {
      try {
        const cached = localStorage.getItem("baykus_app_settings");
        if (cached) applyFromSettings(JSON.parse(cached) as AppSettings);
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("baykus-settings-changed", onChanged);
    return () => window.removeEventListener("baykus-settings-changed", onChanged);
  }, []);

  const activeGroupId = useMemo(() => {
    for (const g of groups) {
      if (groupIsActive(pathname, g)) return g.id;
    }
    return null;
  }, [pathname, groups]);

  useEffect(() => {
    setOpen((prev) => {
      const next = { ...prev };
      for (const g of groups) {
        if (g.defaultOpen && next[g.id] === undefined) next[g.id] = true;
        if (g.id === activeGroupId) next[g.id] = true;
      }
      return next;
    });
  }, [activeGroupId, groups]);

  function toggle(id: string) {
    setOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function logout() {
    clearToken();
    router.push("/login");
  }

  return (
    <aside className="flex w-[15.5rem] shrink-0 flex-col bg-[#1b2230] text-white min-h-screen border-r border-slate-800/80">
      <div className="px-3 py-4 border-b border-slate-700/80 flex flex-col items-center gap-2">
        <Image
          src="/ana_ekran_logo.png"
          alt="Baykuş Baskı"
          width={72}
          height={72}
          className="rounded-full bg-white object-contain p-1"
          priority
        />
        <div className="text-center">
          <div className="text-sm font-bold tracking-tight">Baykuş Baskı</div>
          <div className="text-[10px] text-baykus-accent mt-0.5 tracking-wide uppercase">
            İşletme Programı
          </div>
        </div>
      </div>

      <nav className="flex-1 px-1.5 py-2 space-y-0.5 overflow-y-auto text-[13px]">
        {groups.map((group) => {
          const hasChildren = group.items.length > 0 && !group.tek;
          const isOpen = open[group.id] ?? false;
          const active = groupIsActive(pathname, group);
          const siblingHrefs = group.items.map((i) => i.href.split("?")[0]);

          if (!hasChildren) {
            return (
              <Link
                key={group.id}
                href={group.href || "/dashboard"}
                className={`flex items-center gap-2 rounded-md px-2.5 py-2 transition ${
                  active
                    ? "bg-baykus-primary/90 text-white border-l-2 border-sky-300"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <span className="w-5 text-center opacity-90">{group.icon}</span>
                <span className="truncate font-medium">{group.label}</span>
              </Link>
            );
          }

          return (
            <div key={group.id} className="mb-0.5">
              <div
                className={`flex items-center rounded-md ${
                  active ? "bg-slate-800/80" : ""
                }`}
              >
                <Link
                  href={group.href || group.items[0].href}
                  className={`flex flex-1 items-center gap-2 px-2.5 py-2 transition truncate ${
                    active ? "text-white" : "text-slate-300 hover:text-white"
                  }`}
                >
                  <span className="w-5 text-center opacity-90">{group.icon}</span>
                  <span className="truncate font-medium">{group.label}</span>
                </Link>
                <button
                  type="button"
                  aria-label={isOpen ? "Kapat" : "Aç"}
                  onClick={() => toggle(group.id)}
                  className="px-2 py-2 text-slate-400 hover:text-white text-xs"
                >
                  {isOpen ? "−" : "+"}
                </button>
              </div>
              {isOpen && (
                <div className="ml-3 border-l border-slate-700 pl-1 space-y-0.5 mb-1">
                  {group.items.map((item) => {
                    const leafActive = leafIsActive(pathname, item.href, siblingHrefs);
                    return (
                      <Link
                        key={item.href + item.label}
                        href={item.href}
                        className={`block rounded-md px-2.5 py-1.5 text-[12px] transition truncate ${
                          leafActive
                            ? "bg-baykus-primary text-white"
                            : "text-slate-400 hover:bg-slate-800 hover:text-white"
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-700/80 space-y-2">
        <button
          onClick={logout}
          className="w-full rounded-md bg-slate-800/80 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700"
        >
          Çıkış Yap
        </button>
        <div className="text-[9px] text-slate-500 text-center leading-tight">
          Baykuş Baskı · © 2026
        </div>
      </div>
    </aside>
  );
}
