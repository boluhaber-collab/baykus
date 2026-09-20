"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import { getToken } from "@/lib/api";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const isLogin = pathname === "/login";

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
      <main className="flex-1 overflow-auto min-w-0">
        <div className="mx-auto max-w-7xl px-4 py-4 md:px-6 md:py-5">{children}</div>
      </main>
    </div>
  );
}
