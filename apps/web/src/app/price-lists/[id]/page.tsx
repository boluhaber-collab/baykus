"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { PriceList, Product, apiFetch, formatMoney } from "@/lib/api";

type EditItem = {
  key: string;
  product_id: string;
  description: string;
  unit_price: string;
  notes: string;
};

export default function PriceListDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [list, setList] = useState<PriceList | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [items, setItems] = useState<EditItem[]>([]);

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await apiFetch<PriceList>(`/api/price-lists/${id}`);
      setList(data);
      setName(data.name);
      setDescription(data.description || "");
      setIsActive(data.is_active);
      setItems(
        (data.items || []).map((it) => ({
          key: String(it.id ?? Math.random().toString(36).slice(2)),
          product_id: it.product_id != null ? String(it.product_id) : "",
          description: it.description,
          unit_price: String(it.unit_price ?? 0),
          notes: it.notes || "",
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [id]);

  useEffect(() => {
    if (Number.isFinite(id)) void load();
    void apiFetch<Product[]>("/api/products").then(setProducts).catch(() => undefined);
  }, [id, load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const updated = await apiFetch<PriceList>(`/api/price-lists/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: name.trim(),
          description: description || null,
          is_active: isActive,
          items: items
            .filter((i) => i.description.trim())
            .map((i) => ({
              product_id: i.product_id ? Number(i.product_id) : null,
              description: i.description.trim(),
              unit_price: Number(i.unit_price) || 0,
              notes: i.notes || null,
            })),
        }),
      });
      setList(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    }
  }

  async function remove() {
    if (!confirm("Bu fiyat listesini silmek istiyor musunuz?")) return;
    try {
      await apiFetch(`/api/price-lists/${id}`, { method: "DELETE" });
      router.push("/price-lists");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Silme hatası");
    }
  }

  if (!list && !error) return <div className="text-slate-500">Yükleniyor…</div>;
  if (!list) {
    return (
      <div>
        <p className="text-red-600 mb-4">{error}</p>
        <Link href="/price-lists">← Geri</Link>
      </div>
    );
  }

  return (
    <div>
      <Link href="/price-lists" className="text-sm text-baykus-600 hover:underline">
        ← Fiyat listeleri
      </Link>
      <h1 className="text-2xl font-bold mt-2 mb-4">{list.name}</h1>
      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}

      <form onSubmit={save} className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4 rounded-xl border bg-white p-4 shadow-sm">
          <label className="text-sm">
            <span className="text-slate-500">Ad</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" required />
          </label>
          <label className="text-sm flex items-center gap-2 mt-6">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Aktif
          </label>
          <label className="text-sm md:col-span-2">
            <span className="text-slate-500">Açıklama</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" rows={2} />
          </label>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="flex justify-between">
            <h2 className="font-semibold text-sm">Kalemler</h2>
            <button
              type="button"
              className="text-sm text-baykus-600"
              onClick={() =>
                setItems((prev) => [
                  ...prev,
                  {
                    key: Math.random().toString(36).slice(2),
                    product_id: "",
                    description: "",
                    unit_price: "0",
                    notes: "",
                  },
                ])
              }
            >
              + Kalem
            </button>
          </div>
          {items.map((it) => (
            <div key={it.key} className="grid md:grid-cols-5 gap-2 border-t pt-3">
              <select
                value={it.product_id}
                onChange={(e) => {
                  const pid = e.target.value;
                  const prod = products.find((p) => String(p.id) === pid);
                  setItems((prev) =>
                    prev.map((x) =>
                      x.key === it.key
                        ? {
                            ...x,
                            product_id: pid,
                            description: prod?.name || x.description,
                            unit_price: prod ? String(prod.base_price) : x.unit_price,
                          }
                        : x,
                    ),
                  );
                }}
                className="rounded-lg border px-2 py-1.5 text-sm"
              >
                <option value="">Ürün</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                value={it.description}
                onChange={(e) =>
                  setItems((prev) => prev.map((x) => (x.key === it.key ? { ...x, description: e.target.value } : x)))
                }
                placeholder="Açıklama"
                className="rounded-lg border px-2 py-1.5 text-sm md:col-span-2"
              />
              <input
                type="number"
                step="0.01"
                value={it.unit_price}
                onChange={(e) =>
                  setItems((prev) => prev.map((x) => (x.key === it.key ? { ...x, unit_price: e.target.value } : x)))
                }
                className="rounded-lg border px-2 py-1.5 text-sm"
              />
              <button type="button" className="text-xs text-red-600" onClick={() => setItems((prev) => prev.filter((x) => x.key !== it.key))}>
                Sil
              </button>
            </div>
          ))}
          {items.length === 0 && <p className="text-sm text-slate-400">Kalem yok</p>}
        </div>

        <div className="flex gap-2">
          <button type="submit" className="rounded-lg bg-baykus-600 text-white px-4 py-2 text-sm">
            Kaydet
          </button>
          <button type="button" onClick={remove} className="rounded-lg border border-red-200 text-red-700 px-4 py-2 text-sm">
            Sil
          </button>
        </div>
      </form>

      {list.items && list.items.length > 0 && (
        <div className="mt-6 text-xs text-slate-400">
          Son kayıtlı kalem sayısı: {list.items.length} · örnek fiyat{" "}
          {formatMoney(Number(list.items[0]?.unit_price || 0))}
        </div>
      )}
    </div>
  );
}
