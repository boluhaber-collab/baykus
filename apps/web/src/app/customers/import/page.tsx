"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Masaüstü Excelden Müşteri → ortak sihirbaz */
export default function CustomerImportRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/tools/import");
  }, [router]);
  return <p className="text-sm text-baykus-muted p-4">Excel içe aktarma sihirbazına yönlendiriliyor…</p>;
}
