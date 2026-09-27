"use client";

import { hubByKey } from "@/lib/reportCatalog";
import { ReportHubPage } from "@/components/reports/ReportTiles";

export default function Page() {
  const hub = hubByKey("sales-purchases");
  if (!hub) return <div className="p-4 text-sm text-red-600">Hub bulunamadı</div>;
  return <ReportHubPage hub={hub} />;
}
