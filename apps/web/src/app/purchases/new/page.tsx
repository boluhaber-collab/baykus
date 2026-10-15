"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { CriticalStockItem, Supplier, apiFetch } from "@/lib/api";
import { localToday } from "@/lib/dates";
import LiveSearchSelect, { useSupplierSearch } from "@/components/LiveSearchSelect";
import PurchaseEntryForm from "@/components/PurchaseEntryForm";
type TalepRow = CriticalStockItem & {
  key: string;
  selected: boolean;
  talep: number;
  /** Editable alış fiyatı; blank by default — do not seed from catalog/sale price */
  alisFiyat: string;
};

function NewPurchaseForm() {
  const router = useRouter();
  const search = useSearchParams();
  const presetSupplier = search.get("supplier_id") || "";
  const editId = search.get("edit");
  const modeParam = editId ? "manuel" : search.get("mode") || "talep";

  const [tab, setTab] = useState<"talep" | "manuel">(modeParam === "manuel" ? "manuel" : "talep");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const supplierSearch = useSupplierSearch(suppliers, setSuppliers);
  const [supplierId, setSupplierId] = useState(presetSupplier);
  const [purchaseDate, setPurchaseDate] = useState(() => localToday());
  const [notes, setNotes] = useState("");
  const [confirmOnSave, setConfirmOnSave] = useState(true);
  const [kritik, setKritik] = useState("5");
  const [ara, setAra] = useState("");
  const [talepRows, setTalepRows] = useState<TalepRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const loadTalep = useCallback(async () => {
    setError("");
    try {
      const items = await apiFetch<CriticalStockItem[]>("/api/products/critical");
      const thr = Number(kritik) || 5;
      const needle = ara.trim().toLocaleLowerCase("tr");
      const mapped: TalepRow[] = items
        .filter((r) => r.stock_qty <= thr)
        .filter((r) => {
          if (!needle) return true;
          const hay = [r.supplier_name, r.category, r.product_name, r.variant_name, r.size, r.color, r.print_type]
            .join(" ")
            .toLocaleLowerCase("tr");
          return hay.includes(needle);
        })
        .map((r) => {
          const hedef = Math.max(thr, 1);
          const onerilen = Math.max(hedef - r.stock_qty, 1);
          return {
            ...r,
            key: `${r.product_id}-${r.variant_id ?? "p"}`,
            selected: false,
            talep: onerilen,
            // Leave alış empty — never prefill from product sale/list/purchase_price
            alisFiyat: "",
          };
        });
      setTalepRows(mapped);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kritik stok yüklenemedi");
    }
  }, [kritik, ara]);

  useEffect(() => {
    Promise.all([
      apiFetch<Supplier[]>("/api/suppliers?active=true&limit=1000"),
    ])
      .then(([s]) => {
        setSuppliers(s);
        if (!presetSupplier && s.length) setSupplierId(String(s[0]!.id));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Yükleme hatası"));
  }, [presetSupplier]);

  useEffect(() => {
    if (tab === "talep") void loadTalep();
  }, [tab, loadTalep]);

  const selectedTalep = useMemo(() => talepRows.filter((r) => r.selected), [talepRows]);
  const talepToplamAdet = selectedTalep.reduce((s, r) => s + Math.max(0, r.talep), 0);

  function toggleRow(key: string) {
    setTalepRows((rows) => rows.map((r) => (r.key === key ? { ...r, selected: !r.selected } : r)));
  }

  function setRowSelected(key: string, selected: boolean) {
    setTalepRows((rows) => rows.map((r) => (r.key === key ? { ...r, selected } : r)));
  }

  function toggleAll() {
    const allOn = talepRows.length > 0 && talepRows.every((r) => r.selected);
    setTalepRows((rows) => rows.map((r) => ({ ...r, selected: !allOn })));
  }

  async function convertTalep() {
    setLoading(true);
    setError("");
    setMsg("");
    try {
      if (!selectedTalep.length) throw new Error("Önce ürün seçin");
      // Group by supplier name → try match supplier; else use selected supplierId
      const payloadLines = selectedTalep.map((r) => ({
        description: [r.product_name, r.variant_name, r.size, r.color].filter(Boolean).join(" — "),
        quantity: Math.max(1, r.talep),
        // Use only the user-entered alış; never seed from product sale/list price
        unit_cost: (() => {
          const n = Number(r.alisFiyat);
          return Number.isFinite(n) && n >= 0 ? n : 0;
        })(),
        product_id: r.product_id,
        variant_id: r.variant_id ?? null,
      }));
      // If all selected share a supplier_name that matches a supplier, prefer it
      const names = [...new Set(selectedTalep.map((r) => (r.supplier_name || "").trim()).filter(Boolean))];
      let sid = supplierId;
      if (names.length === 1) {
        const match = suppliers.find(
          (s) => s.name.toLocaleLowerCase("tr") === names[0]!.toLocaleLowerCase("tr"),
        );
        if (match) sid = String(match.id);
      }
      if (!sid) throw new Error("Tedarikçi seçin");
      setSupplierId(sid);
      const created = await apiFetch<{ id: number }>("/api/purchases", {
        method: "POST",
        body: JSON.stringify({
          supplier_id: Number(sid),
          purchase_date: purchaseDate,
          notes: notes.trim() || "Satın Alma Talebi",
          tax_amount: 0,
          confirm: confirmOnSave,
          lines: payloadLines,
        }),
      });
      setMsg("Satın alma belgesi oluşturuldu");
      router.push(`/purchases/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dönüşüm hatası");
    } finally {
      setLoading(false);
    }
  }

  const input =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-baykus-500";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href="/purchases" className="text-sm text-baykus-600 hover:underline">
            ← Satın Alma
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">{editId ? "Alış Düzenle" : tab === "manuel" ? "Alış Gir" : "Satın Alma Talebi"}</h1>
          <p className="text-slate-500 text-sm">Tedarik Merkezi › Satın Alma Talebi · kritik stok → alış belgesi</p>
        </div>
        <div className="flex gap-2">
          <Link href="/stock/critical" className="bk-btn bk-btn-ghost text-xs">
            Kritik Stok
          </Link>
          <Link href="/suppliers" className="bk-btn bk-btn-ghost text-xs">
            Tedarikçiler
          </Link>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm">{msg}</div>}

      {!editId && (
      <div className="flex gap-2">
        <button
          type="button"
          className={`bk-btn text-xs ${tab === "talep" ? "bk-btn-primary" : "bk-btn-ghost"}`}
          onClick={() => setTab("talep")}
        >
          Kritik stok talebi
        </button>
        <button
          type="button"
          className={`bk-btn text-xs ${tab === "manuel" ? "bk-btn-primary" : "bk-btn-ghost"}`}
          onClick={() => setTab("manuel")}
        >
          Alış gir (perakende düzeni)
        </button>
      </div>
      )}

      {tab === "talep" && (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm grid sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Tedarikçi ara *</label>
          <LiveSearchSelect
            required
            value={supplierId}
            onChange={(id) => setSupplierId(id)}
            options={supplierSearch.options}
            fetchMatches={supplierSearch.fetchMatches}
            placeholder="Tedarikçi ara…"
            inputClassName={input}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Tarih</label>
          <input type="date" className={input} value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Notlar</label>
          <input className={input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Talep / irsaliye notu" />
        </div>
      </div>
      )}

      {tab === "talep" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3 rounded border bg-white px-3 py-2">
            <label className="text-xs">
              Kritik seviye
              <input
                className="bk-input mt-0.5 block w-20"
                value={kritik}
                onChange={(e) => setKritik(e.target.value)}
              />
            </label>
            <label className="text-xs">
              Ara
              <input
                className="bk-input mt-0.5 block min-w-[200px]"
                value={ara}
                onChange={(e) => setAra(e.target.value)}
                placeholder="Tedarikçi / ürün / beden…"
              />
            </label>
            <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={loadTalep}>
              Yenile
            </button>
            <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={toggleAll}>
              Tümünü seç / kaldır
            </button>
            <div className="ml-auto text-xs font-semibold text-teal-800">
              Seçilen ürün: {selectedTalep.length} | Talep edilen toplam: {talepToplamAdet} adet
              <span className="ml-2 font-normal text-slate-500">(Ekle veya satıra çift tık)</span>
            </div>
          </div>
          <div className="text-xs text-baykus-muted">Satın alma önerisi: {talepRows.length} ürün</div>

          <div className="bk-table-wrap max-h-[480px] overflow-auto">
            <table className="bk-table text-xs">
              <thead>
                <tr>
                  <th>Seç</th>
                  <th>Tedarikçi</th>
                  <th>Kategori</th>
                  <th>Ürün</th>
                  <th>Beden</th>
                  <th>Renk</th>
                  <th>Baskı</th>
                  <th className="text-right">Stok</th>
                  <th className="text-right">Talep Adedi</th>
                  <th className="text-right">Alış Fiyatı</th>
                  <th className="text-center">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {talepRows.map((r) => {
                  const stockWarn =
                    r.stock_qty < 0 ? "bg-red-50" : r.stock_qty < (Number(kritik) || 5) ? "bg-amber-50" : "";
                  const selectedCls = r.selected
                    ? "bg-teal-50 ring-1 ring-inset ring-teal-300"
                    : stockWarn;
                  return (
                  <tr
                    key={r.key}
                    className={`${selectedCls} cursor-pointer`}
                    title="Çift tıklayınca ekle / çıkar"
                    onDoubleClick={(e) => {
                      const t = e.target as HTMLElement;
                      if (t.closest("input, button, a, select, textarea, label")) return;
                      toggleRow(r.key);
                    }}
                  >
                    <td onDoubleClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={r.selected} onChange={() => toggleRow(r.key)} />
                    </td>
                    <td>{r.supplier_name || "—"}</td>
                    <td>{r.category || "—"}</td>
                    <td className="font-medium">
                      {r.product_name}
                      {r.variant_name ? ` / ${r.variant_name}` : ""}
                    </td>
                    <td>{r.size || "—"}</td>
                    <td>{r.color || "—"}</td>
                    <td>{r.print_type || "—"}</td>
                    <td className="text-right tabular-nums font-semibold text-red-700">{r.stock_qty}</td>
                    <td className="text-right" onDoubleClick={(e) => e.stopPropagation()}>
                      <input
                        type="number"
                        min={1}
                        className="bk-input w-20 text-right"
                        value={r.talep}
                        onChange={(e) => {
                          const n = Math.max(1, Number(e.target.value) || 1);
                          setTalepRows((rows) =>
                            rows.map((x) => (x.key === r.key ? { ...x, talep: n, selected: true } : x)),
                          );
                        }}
                      />
                    </td>
                    <td className="text-right" onDoubleClick={(e) => e.stopPropagation()}>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="bk-input w-28 text-right"
                        value={r.alisFiyat}
                        placeholder="—"
                        onChange={(e) => {
                          const v = e.target.value;
                          setTalepRows((rows) =>
                            rows.map((x) =>
                              x.key === r.key ? { ...x, alisFiyat: v, selected: true } : x,
                            ),
                          );
                        }}
                        aria-label="Alış fiyatı"
                      />
                    </td>
                    <td className="text-center whitespace-nowrap" onDoubleClick={(e) => e.stopPropagation()}>
                      {r.selected ? (
                        <button
                          type="button"
                          className="bk-btn text-[11px] px-2 py-1 bg-teal-600 text-white hover:bg-teal-700"
                          onClick={() => setRowSelected(r.key, false)}
                          title="Seçimden çıkar"
                        >
                          Eklendi · Çıkar
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="bk-btn bk-btn-primary text-[11px] px-2 py-1"
                          onClick={() => setRowSelected(r.key, true)}
                          title="Satın alma talebine ekle"
                        >
                          Ekle
                        </button>
                      )}
                    </td>
                  </tr>
                  );
                })}
                {talepRows.length === 0 && (
                  <tr>
                    <td colSpan={11} className="text-center text-baykus-muted py-8">
                      Kritik seviye altında ürün yok
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={confirmOnSave} onChange={(e) => setConfirmOnSave(e.target.checked)} />
            Dönüştürürken onayla (stok + tedarikçi borcu)
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading || !selectedTalep.length}
              onClick={() => void convertTalep()}
              className="rounded-lg text-white px-5 py-2 text-sm font-medium disabled:opacity-60"
              style={{ background: "#be123c" }}
            >
              {loading ? "Oluşturuluyor…" : "Satın Almaya Dönüştür"}
            </button>
            <Link href="/purchases" className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
              İptal
            </Link>
          </div>
        </div>
      )}

      {tab === "manuel" && <PurchaseEntryForm presetSupplier={presetSupplier} editId={editId} />}
    </div>
  );
}

export default function NewPurchasePage() {
  return (
    <Suspense fallback={<div className="text-slate-500">Yükleniyor…</div>}>
      <NewPurchaseForm />
    </Suspense>
  );
}
