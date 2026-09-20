"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getApiBase } from "@/lib/api";

type Check = { name: string; status: string; detail?: string };
type Health = {
  status?: string;
  service?: string;
  database?: { ok?: boolean; engine?: string; table_count?: number; error?: string | null };
  sqlite_tables?: { table: string; rows: number | null }[];
  checks?: Check[];
  [k: string]: unknown;
};

export default function HealthPage() {
  const [data, setData] = useState<Health | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"genel" | "sqlite" | "ham">("genel");
  const base = typeof window !== "undefined" ? getApiBase() : "";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${getApiBase()}/health`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sağlık kontrolü başarısız");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = [
    { label: "Durum", value: data?.status || "—", color: data?.status === "ok" ? "#198754" : "#be123c" },
    { label: "DB Motor", value: data?.database?.engine || "—", color: "#475569" },
    { label: "Tablo", value: String(data?.database?.table_count ?? "—"), color: "#2563eb" },
    { label: "Kontrol", value: String(data?.checks?.length ?? 0), color: "#0f766e" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Sistem Sağlık Merkezi</h2>
          <p className="text-xs text-baykus-muted">API: {base || "—"} · sır yok · masaüstü genel bakış</p>
        </div>
        <div className="flex gap-2">
          <Link href="/settings/database" className="bk-btn bk-btn-ghost text-xs">
            Merkezi DB / VPS
          </Link>
          <Link href="/settings/backups" className="bk-btn bk-btn-ghost text-xs">
            Yedekleme
          </Link>
          <button type="button" className="bk-btn bk-btn-primary text-xs" onClick={load} disabled={loading}>
            {loading ? "Kontrol…" : "Yenile"}
          </button>
        </div>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {cards.map((c) => (
          <div key={c.label} className="rounded text-white px-3 py-2" style={{ background: c.color }}>
            <div className="text-[10px] font-semibold opacity-90">{c.label}</div>
            <div className="text-lg font-bold">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-1 border-b">
        {(
          [
            ["genel", "Genel Bakış"],
            ["sqlite", "SQLite Tabloları"],
            ["ham", "Ham JSON"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-3 py-1.5 text-xs font-semibold ${tab === k ? "border-b-2 border-baykus-primary text-baykus-primary" : "text-slate-500"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "genel" && (
        <div className="bk-table-wrap">
          <table className="bk-table text-sm">
            <thead>
              <tr>
                <th>Kontrol</th>
                <th>Durum</th>
                <th>Detay</th>
              </tr>
            </thead>
            <tbody>
              {(data?.checks || []).map((c) => (
                <tr key={c.name}>
                  <td className="font-medium">{c.name}</td>
                  <td>
                    <span
                      className={`text-xs font-semibold ${
                        c.status === "Tamam" ? "text-emerald-700" : c.status === "Uyarı" ? "text-amber-700" : "text-red-700"
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="text-xs text-baykus-muted">{c.detail || "—"}</td>
                </tr>
              ))}
              {(data?.checks || []).length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center text-baykus-muted py-6">
                    Veri yok
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "sqlite" && (
        <div className="bk-table-wrap max-h-96 overflow-auto">
          <table className="bk-table text-sm">
            <thead>
              <tr>
                <th>Tablo</th>
                <th className="text-right">Satır</th>
              </tr>
            </thead>
            <tbody>
              {(data?.sqlite_tables || []).map((r) => (
                <tr key={r.table}>
                  <td className="font-mono text-xs">{r.table}</td>
                  <td className="text-right tabular-nums">{r.rows ?? "—"}</td>
                </tr>
              ))}
              {(data?.sqlite_tables || []).length === 0 && (
                <tr>
                  <td colSpan={2} className="text-center text-baykus-muted py-6">
                    SQLite değil veya tablo listesi boş
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "ham" && data && (
        <pre className="bk-card p-3 text-xs overflow-auto bg-slate-900 text-emerald-300 max-h-96">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
