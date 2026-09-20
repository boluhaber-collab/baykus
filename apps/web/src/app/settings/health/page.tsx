"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getApiBase } from "@/lib/api";

type Check = { name: string; status: string; detail?: string };
type Issue = {
  Kategori?: string;
  Önem?: string;
  Kayıt?: string;
  Detay?: string;
  Hedef?: string;
  [k: string]: string | undefined;
};
type Health = {
  status?: string;
  service?: string;
  database?: { ok?: boolean; engine?: string; table_count?: number; error?: string | null };
  sqlite_tables?: { table: string; rows: number | null }[];
  counts?: Record<string, number>;
  orphans?: Issue[];
  data_issues?: Issue[];
  checks?: Check[];
  [k: string]: unknown;
};

const HEDEF_HREF: Record<string, string> = {
  "Müşteri Merkezi": "/customers",
  "Müşteri Listesi": "/customers",
  "Sipariş Listesi": "/orders",
  "Kritik Stok": "/stock/critical",
  "Tedarikçi Kartları": "/suppliers",
  "Hesaplarım": "/finance/banks",
  "SQLite Kontrol": "/settings/database",
};

export default function HealthPage() {
  const [data, setData] = useState<Health | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"genel" | "kayit" | "saglik" | "sqlite" | "ham">("genel");
  const [onem, setOnem] = useState("Tümü");
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

  const issues = [...(data?.orphans || []), ...(data?.data_issues || [])];
  const filtered = issues.filter((i) => onem === "Tümü" || i.Önem === onem);

  const cards = [
    { label: "Program", value: data?.status || "—", color: data?.status === "ok" ? "#334155" : "#be123c" },
    { label: "Veri / DB", value: data?.database?.engine || "—", color: "#4f46e5" },
    { label: "SQLite / Tablo", value: String(data?.database?.table_count ?? "—"), color: "#0f766e" },
    {
      label: "Sağlık Sorunu",
      value: String(issues.length),
      color: issues.length ? "#be123c" : "#198754",
    },
    { label: "Kontrol", value: String(data?.checks?.length ?? 0), color: "#2563eb" },
  ];

  const countEntries = Object.entries(data?.counts || {});

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Sistem / Veri Sağlık Merkezi</h2>
          <p className="text-xs text-baykus-muted">
            API: {base || "—"} · masaüstü veri_saglik + sistem_saglik · salt okunur
          </p>
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

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {cards.map((c) => (
          <div key={c.label} className="rounded text-white px-3 py-2" style={{ background: c.color }}>
            <div className="text-[10px] font-semibold opacity-90">{c.label}</div>
            <div className="text-lg font-bold truncate">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/settings" className="bk-btn bk-btn-ghost text-xs">
          Ayarlar
        </Link>
        <Link href="/settings/audit" className="bk-btn bk-btn-ghost text-xs">
          İşlem Geçmişi
        </Link>
        <Link href="/stock/critical" className="bk-btn bk-btn-ghost text-xs">
          Kritik Stok
        </Link>
      </div>

      <div className="flex gap-1 border-b flex-wrap">
        {(
          [
            ["genel", "Genel Bakış"],
            ["kayit", "Kayıt Sayıları"],
            ["saglik", "Sağlık Sorunları"],
            ["sqlite", "SQLite Tabloları"],
            ["ham", "Ham JSON"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-3 py-1.5 text-xs font-semibold ${
              tab === k ? "border-b-2 border-baykus-primary text-baykus-primary" : "text-slate-500"
            }`}
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
                        c.status === "Tamam"
                          ? "text-emerald-700"
                          : c.status === "Uyarı"
                            ? "text-amber-700"
                            : "text-red-700"
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

      {tab === "kayit" && (
        <div className="grid sm:grid-cols-3 md:grid-cols-4 gap-2">
          {countEntries.map(([k, v]) => (
            <div key={k} className="bk-card p-3">
              <div className="text-[10px] uppercase text-slate-500 font-semibold">{k}</div>
              <div className="text-xl font-bold tabular-nums">{v}</div>
            </div>
          ))}
          {countEntries.length === 0 && (
            <div className="text-sm text-slate-400 col-span-full py-6 text-center">Kayıt özeti yok</div>
          )}
        </div>
      )}

      {tab === "saglik" && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Önem</span>
            <select className="bk-input text-xs max-w-[8rem]" value={onem} onChange={(e) => setOnem(e.target.value)}>
              {["Tümü", "Yüksek", "Orta", "Düşük"].map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-400 ml-auto">{filtered.length} kayıt</span>
          </div>
          <div className="bk-table-wrap">
            <table className="bk-table text-sm">
              <thead>
                <tr>
                  <th>Kategori</th>
                  <th>Önem</th>
                  <th>Kayıt</th>
                  <th>Detay</th>
                  <th>Hedef</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((i, idx) => (
                  <tr
                    key={idx}
                    className={
                      i.Önem === "Yüksek" ? "bg-red-50" : i.Önem === "Orta" ? "bg-amber-50" : undefined
                    }
                  >
                    <td>{i.Kategori}</td>
                    <td className="font-semibold text-xs">{i.Önem}</td>
                    <td>{i.Kayıt}</td>
                    <td className="text-xs text-slate-600">{i.Detay}</td>
                    <td>
                      {i.Hedef && HEDEF_HREF[i.Hedef] ? (
                        <Link href={HEDEF_HREF[i.Hedef]} className="text-baykus-primary hover:underline text-xs">
                          {i.Hedef}
                        </Link>
                      ) : (
                        <span className="text-xs">{i.Hedef || "—"}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-emerald-700 py-8 font-medium">
                      Sağlık sorunu bulunamadı
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
                    Tablo listesi yok (Postgres veya bağlantı yok)
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "ham" && (
        <pre className="bk-card p-3 text-[11px] overflow-auto max-h-[28rem] bg-slate-900 text-slate-100">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
