"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { PriceList, apiFetch } from "@/lib/api";

export default function PriceListsPage() {
  const [items, setItems] = useState<PriceList[]>([]);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setItems(await apiFetch<PriceList[]>("/api/price-lists"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createList(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError("");
    try {
      const created = await apiFetch<PriceList>("/api/price-lists", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          description: description || null,
          items: [],
        }),
      });
      setName("");
      setDescription("");
      window.location.href = `/price-lists/${created.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Oluşturma hatası");
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Fiyat listeleri</h1>
        <p className="text-sm text-slate-500">Ürün / varyant bazlı fiyat tanımları</p>
      </div>
      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}

      <form onSubmit={createList} className="mb-6 rounded-xl border bg-white p-4 shadow-sm flex flex-wrap gap-2 items-end">
        <label className="text-sm">
          <span className="text-slate-500">Yeni liste adı</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block rounded-lg border px-3 py-2"
            required
          />
        </label>
        <label className="text-sm grow min-w-[200px]">
          <span className="text-slate-500">Açıklama</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 block w-full rounded-lg border px-3 py-2"
          />
        </label>
        <button type="submit" className="rounded-lg bg-baykus-600 text-white px-4 py-2 text-sm">
          Oluştur
        </button>
      </form>

      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3">Ad</th>
              <th className="px-4 py-3">Para birimi</th>
              <th className="px-4 py-3">Kalem</th>
              <th className="px-4 py-3">Durum</th>
              <th className="px-4 py-3">Geçerlilik</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((pl) => (
              <tr key={pl.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">
                  <Link href={`/price-lists/${pl.id}`} className="text-baykus-700 hover:underline">
                    {pl.name}
                  </Link>
                </td>
                <td className="px-4 py-3">{pl.currency}</td>
                <td className="px-4 py-3">{pl.item_count ?? pl.items?.length ?? 0}</td>
                <td className="px-4 py-3">{pl.is_active ? "Aktif" : "Pasif"}</td>
                <td className="px-4 py-3 text-slate-500">
                  {[pl.valid_from, pl.valid_to].filter(Boolean).join(" → ") || "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/price-lists/${pl.id}`} className="text-baykus-600 hover:underline">
                    Aç
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Liste yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
