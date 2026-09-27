"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { NAV_GROUPS, NavGroup, filterNavByLockMode, orderNavGroups } from "@/lib/nav";
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
      const ordered = orderNavGroups(NAV_GROUPS, s.sol_menu_sirasi, s.sol_menu_adlari);
      setGroups(filterNavByLockMode(ordered, s.user_mode, s.sol_menu_adlari));
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
        if (g.id === activeGroupId && !g.tek) next[g.id] = true;
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
    <aside className="bk-sidebar flex w-[15.5rem] shrink-0 flex-col text-white min-h-screen border-r border-black/40">
      <div className="px-3 py-3 border-b border-white/10 flex flex-col items-center gap-1.5">
        <Image
          src="/ana_ekran_logo.png"
          alt="Baykuş"
          width={64}
          height={64}
          className="object-contain drop-shadow"
          priority
        />
        <div className="text-center leading-tight">
          <div className="text-[15px] font-bold tracking-tight lowercase first-letter:uppercase">
            baykuş
          </div>
          <div className="text-[9px] text-slate-400 mt-0.5 tracking-[0.12em] uppercase">
            Baskı Takip Sistemi
          </div>
        </div>
      </div>

      <nav className="flex-1 px-1.5 py-2 space-y-0.5 overflow-y-auto text-[13px]">
        {groups.map((group) => {
          const hasChildren = group.items.length > 0;
          const isOpen = open[group.id] ?? false;
          const active = groupIsActive(pathname, group);
          const siblingHrefs = group.items.map((i) => i.href.split("?")[0]);
          const showExpand = hasChildren && !group.tek;

          if (!hasChildren || group.tek) {
            return (
              <Link
                key={group.id}
                href={group.href || "/dashboard"}
                className={`bk-sidebar-item ${active ? "active-bar" : ""}`}
              >
                <span className="w-5 text-center text-[15px] opacity-95">{group.icon}</span>
                <span className="truncate flex-1 font-medium">{group.label}</span>
                {hasChildren && group.tek && (
                  <span className="text-slate-500 text-[11px] font-light select-none" aria-hidden>
                    +
                  </span>
                )}
              </Link>
            );
          }

          return (
            <div key={group.id} className="mb-0.5">
              <div className={`flex items-center rounded-md ${active ? "bg-[#232d3d]" : ""}`}>
                <Link
                  href={group.href || group.items[0].href}
                  className={`flex flex-1 items-center gap-2 px-2.5 py-2 transition truncate ${
                    active ? "text-white font-semibold" : "text-slate-300 hover:text-white"
                  }`}
                >
                  <span className="w-5 text-center text-[15px] opacity-95">{group.icon}</span>
                  <span className="truncate font-medium">{group.label}</span>
                </Link>
                {showExpand && (
                  <button
                    type="button"
                    aria-label={isOpen ? "Kapat" : "Aç"}
                    onClick={() => toggle(group.id)}
                    className="px-2.5 py-2 text-slate-400 hover:text-white text-sm font-light leading-none"
                  >
                    {isOpen ? "−" : "+"}
                  </button>
                )}
              </div>
              {isOpen && (
                <div className="ml-3 border-l border-slate-700/80 pl-1 space-y-0.5 mb-1 mt-0.5">
                  {group.items.map((item) => {
                    const leafActive = leafIsActive(pathname, item.href, siblingHrefs);
                    return (
                      <Link
                        key={item.href + item.label}
                        href={item.href}
                        className={`block rounded-md px-2.5 py-1.5 text-[12px] transition truncate ${
                          leafActive
                            ? "bg-[#2a3548] text-white font-medium"
                            : "text-slate-400 hover:bg-[#1e2736] hover:text-white"
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

      <div className="p-3 border-t border-white/10 space-y-2">
        <button
          onClick={logout}
          className="w-full rounded-md bg-[#232d3d] px-3 py-2 text-xs text-slate-200 hover:bg-[#2a3548]"
        >
          Çıkış Yap
        </button>
        <div className="text-[9px] text-slate-500 text-center leading-tight">
          Engin KARAKÖZ · © 2026
          <br />
          Baykuş Baskı
        </div>
      </div>
    </aside>
  );
}
