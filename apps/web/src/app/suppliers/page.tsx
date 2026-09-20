"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Supplier, apiFetch, formatMoney } from "@/lib/api";

export default function SuppliersPage() {
  const [items, setItems] = useState<Supplier[]>([]);
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
      const data = await apiFetch<Supplier[]>(`/api/suppliers${qs ? `?${qs}` : ""}`);
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
    if (!confirm("Bu tedarikçiyi silmek istediğinize emin misiniz?")) return;
    try {
      await apiFetch(`/api/suppliers/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silme hatası");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tedarikçiler</h1>
          <p className="text-slate-500 text-sm">Kartlar · borç bakiyesi · ekstre</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/payables"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Açık borçlar
          </Link>
          <Link
            href="/purchases"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Satın alma
          </Link>
          <Link
            href="/suppliers/new"
            className="rounded-lg bg-baykus-600 text-white px-4 py-2 text-sm font-medium"
          >
            + Yeni Tedarikçi
          </Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Ara</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ad, kod, telefon…"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-56"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Durum</label>
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value as "all" | "true" | "false")}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">Tümü</option>
            <option value="true">Aktif</option>
            <option value="false">Pasif</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 pb-2">
          <input
            type="checkbox"
            checked={hasBalance}
            onChange={(e) => setHasBalance(e.target.checked)}
          />
          Sadece bakiyesi olanlar
        </label>
        <button onClick={load} className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm">
          Filtrele
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3">Kod</th>
              <th className="px-4 py-3">Ad</th>
              <th className="px-4 py-3">Şehir</th>
              <th className="px-4 py-3">Telefon</th>
              <th className="px-4 py-3 text-right">Borç</th>
              <th className="px-4 py-3">Durum</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => {
              const bal = Number(s.balance ?? 0);
              return (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{s.code || "—"}</td>
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/suppliers/${s.id}`} className="text-baykus-700 hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{s.city || "—"}</td>
                  <td className="px-4 py-3">{s.phone || "—"}</td>
                  <td
                    className={`px-4 py-3 text-right font-medium tabular-nums ${
                      bal > 0 ? "text-amber-700" : bal < 0 ? "text-emerald-700" : "text-slate-500"
                    }`}
                  >
                    {formatMoney(bal)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                        s.is_active !== false
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {s.is_active !== false ? "Aktif" : "Pasif"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    <Link href={`/suppliers/${s.id}`} className="text-baykus-600 hover:underline">
                      Detay
                    </Link>
                    <button onClick={() => onDelete(s.id)} className="text-red-600 hover:underline">
                      Sil
                    </button>
                  </td>
                </tr>
              );
            })}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Tedarikçi yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
