"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export default function QuotesPage() {
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch("/api/quotes").then(setData).catch((e) => setError(e.message));
  }, []);
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Teklifler</h1>
      <p className="text-slate-500 mb-6 text-sm">Teklif listesi (stub)</p>
      {error && <p className="text-red-600 mb-4">{error}</p>}
      <pre className="rounded-xl border border-slate-200 bg-white p-4 text-xs overflow-auto shadow-sm">
        {data ? JSON.stringify(data, null, 2) : "Yükleniyor…"}
      </pre>
    </div>
  );
}
