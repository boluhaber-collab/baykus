"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Masaüstü Excelden Müşteri → ortak sihirbaz (/tools/import) */
export default function CustomerImportRedirect() {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.replace("/tools/import?type=customers"), 400);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <div className="max-w-lg mx-auto mt-10 space-y-4">
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-5 py-4">
        <h1 className="text-lg font-bold text-slate-900">Excelden Müşteri Aktar</h1>
        <p className="text-sm text-slate-600 mt-1">
          Masaüstü «Excelden Müşteri» akışı ortak içe aktarma sihirbazına taşındı. Şablon indirme, CSV/XLSX
          ayrıştırma ve önizleme burada.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/tools/import?type=customers" className="bk-btn bk-btn-primary text-sm">
          Sihirbaza git
        </Link>
        <Link href="/customers" className="bk-btn bk-btn-ghost text-sm">
          Müşteri listesi
        </Link>
      </div>
      <p className="text-xs text-baykus-muted">Yönlendiriliyor…</p>
    </div>
  );
}
