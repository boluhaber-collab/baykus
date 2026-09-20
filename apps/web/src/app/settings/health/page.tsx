"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, getApiBase } from "@/lib/api";

type Health = { status?: string; [k: string]: unknown };

export default function HealthPage() {
  const [data, setData] = useState<Health | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const base = typeof window !== "undefined" ? getApiBase() : "";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Public /health on API (no /api prefix)
      const res = await fetch(`${getApiBase()}/health`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      // fallback via authenticated path if any
      try {
        const s = await apiFetch<Health>("/api/dashboard/summary");
        setData({ status: "ok", via: "dashboard", products_hint: s.products_count });
      } catch (e2) {
        setError(e instanceof Error ? e.message : "Sağlık kontrolü başarısız");
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-3 max-w-xl">
      <div>
        <h2 className="text-base font-bold">Sistem sağlığı</h2>
        <p className="text-xs text-baykus-muted">API: {base || "—"}</p>
      </div>
      <button type="button" className="bk-btn bk-btn-primary text-xs" onClick={load} disabled={loading}>
        {loading ? "Kontrol…" : "Yeniden kontrol et"}
      </button>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {data && (
        <pre className="bk-card p-3 text-xs overflow-auto bg-slate-900 text-emerald-300">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
