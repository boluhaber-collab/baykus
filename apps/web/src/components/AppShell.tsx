"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { getToken } from "@/lib/api";
import { useBaykusHotkeys } from "@/hooks/useBaykusHotkeys";
import GlobalSearchOverlay from "./GlobalSearchOverlay";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const isLogin = pathname === "/login";

  useBaykusHotkeys(!isLogin && ready);

  useEffect(() => {
    if (isLogin) {
      setReady(true);
      return;
    }
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [pathname, isLogin, router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-baykus-bg text-baykus-muted text-sm">
        Yükleniyor…
      </div>
    );
  }

  if (isLogin) return <>{children}</>;

  return (
    <div className="flex min-h-screen bg-baykus-bg text-baykus-text">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <TopBar />
        <GlobalSearchOverlay />
        <main className="flex-1 overflow-auto min-w-0">
          <div className="mx-auto max-w-[1400px] px-3 py-3 md:px-4 md:py-4">{children}</div>
        </main>
      </div>
    </div>
  );
}
