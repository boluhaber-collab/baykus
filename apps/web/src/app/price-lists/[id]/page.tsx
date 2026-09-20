"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PriceList, Product, apiFetch, formatMoney, getToken } from "@/lib/api";

type EditItem = {
  key: string;
  product_id: string;
  description: string;
  supplier_name: string;
  purchase_price: string;
  blank_price: string;
  printed_price: string;
  embroidered_price: string;
  notes: string;
};

function authHeaders(): HeadersInit {
  const t = typeof getToken === "function" ? getToken() : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function PriceListDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [list, setList] = useState<PriceList | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [items, setItems] = useState<EditItem[]>([]);
  const [q, setQ] = useState("");
  const [editPricesKey, setEditPricesKey] = useState<string | null>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
          supplier_name: it.supplier_name || "",
          purchase_price: String(it.purchase_price ?? 0),
          blank_price: String(it.blank_price ?? it.unit_price ?? 0),
          printed_price: String(it.printed_price ?? 0),
          embroidered_price: String(it.embroidered_price ?? 0),
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

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((i) =>
      [i.description, i.supplier_name, i.notes].join(" ").toLowerCase().includes(needle),
    );
  }, [items, q]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
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
              unit_price: Number(i.blank_price) || 0,
              supplier_name: i.supplier_name || null,
              purchase_price: Number(i.purchase_price) || 0,
              blank_price: Number(i.blank_price) || 0,
              printed_price: Number(i.printed_price) || 0,
              embroidered_price: Number(i.embroidered_price) || 0,
              notes: i.notes || null,
            })),
        }),
      });
      setList(updated);
      setMsg("✓ Fiyat listesi kaydedildi");
      await load();
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

  async function download(fmt: "csv" | "pdf") {
    try {
      const res = await fetch(`${apiBase}/api/price-lists/${id}/export?fmt=${fmt}`, {
        headers: authHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fiyat_listesi_${id}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dışa aktarma hatası");
    }
  }

  function openPrint() {
    window.open(`${apiBase}/api/price-lists/${id}/export?fmt=html`, "_blank");
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

  const editing = editPricesKey ? items.find((i) => i.key === editPricesKey) : null;

  return (
    <div className="space-y-3">
      <Link href="/price-lists" className="text-sm text-baykus-primary hover:underline">
        ← Fiyat listeleri
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">{list.name}</h2>
          <p className="text-xs text-baykus-muted">Fiyat / Maliyet › Fiyat Listesi · baskılı / baskısız / nakışlı</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={openPrint}>
            Yazdır
          </button>
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => download("csv")}>
            Excel/CSV
          </button>
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => download("pdf")}>
            PDF
          </button>
        </div>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{msg}</div>}

      <form onSubmit={save} className="space-y-3">
        <div className="grid md:grid-cols-2 gap-3 rounded border bg-white p-3">
          <label className="text-sm">
            <span className="text-[11px] text-baykus-muted">Başlık / Ad</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="bk-input mt-0.5" required />
          </label>
          <label className="text-sm flex items-center gap-2 mt-5">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Aktif
          </label>
          <label className="text-sm md:col-span-2">
            <span className="text-[11px] text-baykus-muted">Açıklama</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="bk-input mt-0.5" rows={2} />
          </label>
        </div>

        <div className="rounded border bg-white p-3 space-y-2">
          <div className="flex flex-wrap justify-between gap-2 items-center">
            <h3 className="font-semibold text-sm">Kalemler ({items.length})</h3>
            <div className="flex gap-2">
              <input className="bk-input max-w-[200px]" placeholder="Ürün / tedarikçi ara…" value={q} onChange={(e) => setQ(e.target.value)} />
              <button
                type="button"
                className="bk-btn bk-btn-ghost text-xs"
                onClick={() =>
                  setItems((prev) => [
                    ...prev,
                    {
                      key: Math.random().toString(36).slice(2),
                      product_id: "",
                      description: "",
                      supplier_name: "",
                      purchase_price: "0",
                      blank_price: "0",
                      printed_price: "0",
                      embroidered_price: "0",
                      notes: "",
                    },
                  ])
                }
              >
                + Kalem
              </button>
            </div>
          </div>

          <div className="bk-table-wrap">
            <table className="bk-table text-xs">
              <thead>
                <tr>
                  <th>Ürün</th>
                  <th>Tedarikçi</th>
                  <th className="text-right">Alış</th>
                  <th className="text-right">Baskısız</th>
                  <th className="text-right">Baskılı</th>
                  <th className="text-right">Nakışlı</th>
                  <th>Not</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it) => (
                  <tr key={it.key} className="align-top">
                    <td className="min-w-[140px]">
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
                                    blank_price: prod ? String(prod.base_price) : x.blank_price,
                                    purchase_price: prod ? String(prod.purchase_price ?? 0) : x.purchase_price,
                                  }
                                : x,
                            ),
                          );
                        }}
                        className="bk-input mb-1"
                      >
                        <option value="">— Manuel —</option>
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
                        className="bk-input"
                        placeholder="Ürün adı"
                      />
                    </td>
                    <td>
                      <input
                        value={it.supplier_name}
                        onChange={(e) =>
                          setItems((prev) => prev.map((x) => (x.key === it.key ? { ...x, supplier_name: e.target.value } : x)))
                        }
                        className="bk-input w-28"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={it.purchase_price}
                        onChange={(e) =>
                          setItems((prev) => prev.map((x) => (x.key === it.key ? { ...x, purchase_price: e.target.value } : x)))
                        }
                        className="bk-input w-20 text-right"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={it.blank_price}
                        onChange={(e) =>
                          setItems((prev) => prev.map((x) => (x.key === it.key ? { ...x, blank_price: e.target.value } : x)))
                        }
                        className="bk-input w-20 text-right"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={it.printed_price}
                        onChange={(e) =>
                          setItems((prev) => prev.map((x) => (x.key === it.key ? { ...x, printed_price: e.target.value } : x)))
                        }
                        className="bk-input w-20 text-right"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={it.embroidered_price}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((x) => (x.key === it.key ? { ...x, embroidered_price: e.target.value } : x)),
                          )
                        }
                        className="bk-input w-20 text-right"
                      />
                    </td>
                    <td>
                      <input
                        value={it.notes}
                        onChange={(e) =>
                          setItems((prev) => prev.map((x) => (x.key === it.key ? { ...x, notes: e.target.value } : x)))
                        }
                        className="bk-input w-28"
                      />
                    </td>
                    <td className="text-right whitespace-nowrap space-x-2">
                      <button type="button" className="text-[#0f766e] hover:underline" onClick={() => setEditPricesKey(it.key)}>
                        Fiyatlar
                      </button>
                      <button
                        type="button"
                        className="text-red-600 hover:underline"
                        onClick={() => setItems((prev) => prev.filter((x) => x.key !== it.key))}
                      >
                        Sil
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center text-baykus-muted py-6">
                      Kalem yok
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex gap-2">
          <button type="submit" className="bk-btn text-white text-xs" style={{ background: "#15803d" }}>
            Kaydet / Güncelle
          </button>
          <button type="button" onClick={remove} className="bk-btn text-xs border border-red-200 text-red-700">
            Listeyi Sil
          </button>
        </div>
      </form>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl overflow-hidden">
            <div className="bg-[#0f766e] text-white px-4 py-3">
              <div className="font-bold">{editing.description || "Seçili ürün"}</div>
              <div className="text-xs text-teal-100">Alış ve satış fiyatlarını birlikte güncelleyin.</div>
            </div>
            <div className="p-4 space-y-3 text-sm">
              {(
                [
                  ["purchase_price", "Alış Fiyatı"],
                  ["blank_price", "Baskısız Fiyat"],
                  ["printed_price", "Baskılı Fiyat"],
                  ["embroidered_price", "Nakışlı Fiyat"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{label}</span>
                  <span className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.01"
                      className="bk-input w-32 text-right"
                      value={editing[key]}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x) => (x.key === editing.key ? { ...x, [key]: e.target.value } : x)),
                        )
                      }
                    />
                    <span className="text-slate-400 text-xs">TL</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 bg-slate-50 px-4 py-3">
              <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => setEditPricesKey(null)}>
                Vazgeç
              </button>
              <button
                type="button"
                className="bk-btn text-white text-xs"
                style={{ background: "#15803d" }}
                onClick={() => {
                  setMsg(`✓ ${editing.description} için dört fiyat alanı güncellendi (kaydetmeyi unutmayın).`);
                  setEditPricesKey(null);
                }}
              >
                Uygula
              </button>
            </div>
          </div>
        </div>
      )}

      {list.items && list.items.length > 0 && (
        <div className="text-xs text-slate-400">
          Örnek baskısız: {formatMoney(Number(list.items[0]?.blank_price ?? list.items[0]?.unit_price ?? 0))}
        </div>
      )}
    </div>
  );
}
