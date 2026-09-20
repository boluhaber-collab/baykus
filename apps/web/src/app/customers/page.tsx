"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Customer, apiFetch, formatMoney } from "@/lib/api";

export default function CustomersPage() {
  const [items, setItems] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "true" | "false">("all");
  const [hasBalance, setHasBalance] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (activeFilter !== "all") params.set("active", activeFilter);
      if (hasBalance) params.set("has_balance", "true");
      const qs = params.toString();
      const data = await apiFetch<Customer[]>(`/api/customers${qs ? `?${qs}` : ""}`);
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }, [q, activeFilter, hasBalance]);

  useEffect(() => {
    load();
  }, [load]);

  async function onDelete(id: number) {
    if (!confirm("Bu müşteriyi silmek istediğinize emin misiniz?")) return;
    try {
      await apiFetch(`/api/customers/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silme hatası");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-baykus-text">Müşteriler</h1>
          <p className="text-baykus-muted text-sm">Kartlar · cari bakiye · ekstre</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/cari"
            className="rounded-lg border border-baykus-line px-4 py-2 text-sm hover:bg-baykus-bg"
          >
            Açık alacaklar
          </Link>
          <Link
            href="/customers/new"
            className="rounded-lg bg-baykus-primary text-white px-4 py-2 text-sm font-medium"
          >
            + Yeni Müşteri
          </Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-baykus-muted mb-1">Ara</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ad, kod, firma, telefon…"
            className="rounded-lg border border-baykus-line px-3 py-2 text-sm w-56"
          />
        </div>
        <div>
          <label className="block text-xs text-baykus-muted mb-1">Durum</label>
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value as "all" | "true" | "false")}
            className="rounded-lg border border-baykus-line px-3 py-2 text-sm"
          >
            <option value="all">Tümü</option>
            <option value="true">Aktif</option>
            <option value="false">Pasif</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-baykus-text pb-2">
          <input
            type="checkbox"
            checked={hasBalance}
            onChange={(e) => setHasBalance(e.target.checked)}
          />
          Sadece bakiyesi olanlar
        </label>
        <button
          onClick={load}
          className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm"
        >
          Filtrele
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}

      <div className="rounded-xl border border-baykus-line bg-white shadow-sm overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-baykus-bg text-left text-baykus-muted">
            <tr>
              <th className="px-3 py-2">Kod</th>
              <th className="px-3 py-2">Ad</th>
              <th className="px-3 py-2">Firma</th>
              <th className="px-3 py-2">Şehir</th>
              <th className="px-3 py-2">Telefon</th>
              <th className="px-3 py-2 text-right">Bakiye</th>
              <th className="px-3 py-2">Durum</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => {
              const bal = Number(c.balance ?? 0);
              return (
                <tr key={c.id} className="border-t border-baykus-line hover:bg-baykus-bg">
                  <td className="px-3 py-2 font-mono text-xs text-baykus-muted">{c.code || "—"}</td>
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/customers/${c.id}`} className="text-baykus-primary hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-baykus-muted">{c.company || "—"}</td>
                  <td className="px-3 py-2">{c.city || "—"}</td>
                  <td className="px-3 py-2">{c.phone || "—"}</td>
                  <td
                    className={`px-3 py-2 text-right font-medium tabular-nums ${
                      bal > 0 ? "text-amber-700" : bal < 0 ? "text-emerald-700" : "text-baykus-muted"
                    }`}
                  >
                    {formatMoney(bal)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                        c.is_active !== false
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-200 text-baykus-muted"
                      }`}
                    >
                      {c.is_active !== false ? "Aktif" : "Pasif"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
                    <Link href={`/customers/${c.id}`} className="text-baykus-primary hover:underline">
                      Detay
                    </Link>
                    <button onClick={() => onDelete(c.id)} className="text-red-600 hover:underline">
                      Sil
                    </button>
                  </td>
                </tr>
              );
            })}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  Müşteri yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
