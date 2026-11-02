"use client";

import { DragEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { VariantOverviewItem, VariantOverviewKind, apiFetch } from "@/lib/api";
import { compareSizes } from "@/lib/stockFilters";

const KIND_INFO: Record<string, { label: string; hint: string; placeholder: string }> = {
  Renk: { label: "Renk", hint: "Ürün varyantındaki Renk alanı", placeholder: "Örn. PASTEL MAVİ" },
  Beden: { label: "Beden", hint: "Ürün varyantındaki Beden alanı", placeholder: "Örn. XL, 5/6, 30*40 CM" },
  Baskı: { label: "Baskı", hint: "Ürün varyantındaki Baskı türü alanı", placeholder: "Örn. DTF, Süblimasyon" },
};

const input =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-baykus-500";

function trUpper(v: string): string {
  return v.toLocaleUpperCase("tr");
}

function usageText(it: VariantOverviewItem): string {
  if (!it.variant_count) return "Kullanılmıyor";
  return `${it.variant_count} varyant · ${it.product_count} ürün`;
}

export default function VariantSettingsPanel() {
  const [data, setData] = useState<VariantOverviewKind[]>([]);
  const [kind, setKind] = useState("Renk");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newNote, setNewNote] = useState("");
  const [filter, setFilter] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editNote, setEditNote] = useState("");
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await apiFetch<VariantOverviewKind[]>("/api/settings/variants/overview");
      setData(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Varyantlar yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const current = useMemo(() => data.find((k) => k.kind === kind), [data, kind]);
  const listed = useMemo(() => (current?.items || []).filter((i) => i.in_settings && i.id != null), [current]);
  const missing = useMemo(() => (current?.items || []).filter((i) => !i.in_settings), [current]);
  const needle = filter.trim().toLocaleLowerCase("tr");
  const visibleListed = needle
    ? listed.filter((i) => `${i.value} ${i.note || ""}`.toLocaleLowerCase("tr").includes(needle))
    : listed;
  const visibleMissing = needle
    ? missing.filter((i) => i.value.toLocaleLowerCase("tr").includes(needle))
    : missing;
  const canReorder = !needle && !busy && editId == null;
  const isAttrKind = kind in KIND_INFO;
  const upperKind = kind === "Renk" || kind === "Beden";

  function flash(text: string) {
    setMsg(text);
    setError("");
    window.setTimeout(() => setMsg((m) => (m === text ? "" : m)), 4000);
  }

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem başarısız");
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function addValue(e?: FormEvent, value?: string) {
    e?.preventDefault();
    const v = (value ?? newValue).trim();
    if (!v) {
      setError("Değer yazın.");
      return;
    }
    const ok = await run(() =>
      apiFetch("/api/settings/variants", {
        method: "POST",
        body: JSON.stringify({ kind, value: v, note: value ? null : newNote.trim() || null }),
      }),
    );
    if (ok !== undefined) {
      if (!value) {
        setNewValue("");
        setNewNote("");
      }
      flash(`${v} eklendi`);
      await load();
    }
  }

  async function syncMissing() {
    const res = await run(() =>
      apiFetch<{ total: number }>(`/api/settings/variants/sync?kind=${encodeURIComponent(kind)}`, { method: "POST" }),
    );
    if (res) {
      flash(`${res.total} değer listeye eklendi`);
      await load();
    }
  }

  async function saveOrder(ids: number[]) {
    // İyimser güncelle
    setData((rows) =>
      rows.map((k) => {
        if (k.kind !== kind) return k;
        const byId = new Map(k.items.filter((i) => i.id != null).map((i) => [i.id as number, i]));
        const ordered = ids.map((id, idx) => ({ ...byId.get(id)!, sort_order: idx }));
        return { ...k, items: [...ordered, ...k.items.filter((i) => !i.in_settings)] };
      }),
    );
    const res = await run(() =>
      apiFetch("/api/settings/variants/reorder", { method: "POST", body: JSON.stringify({ kind, ids }) }),
    );
    if (res === undefined) await load();
    else flash("Sıra kaydedildi");
  }

  function move(id: number, delta: number) {
    const ids = listed.map((i) => i.id as number);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]!);
    void saveOrder(ids);
  }

  function autoSort(mode: "beden" | "az") {
    const sorted = [...listed].sort((a, b) =>
      mode === "beden" ? compareSizes(a.value, b.value) : a.value.localeCompare(b.value, "tr", { numeric: true }),
    );
    void saveOrder(sorted.map((i) => i.id as number));
  }

  function onDragStart(e: DragEvent, id: number) {
    if (!canReorder) return;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(id));
    setDragId(id);
  }

  function onDrop(e: DragEvent, targetId: number) {
    e.preventDefault();
    const from = dragId ?? Number(e.dataTransfer.getData("text/plain"));
    setDragId(null);
    setDragOverId(null);
    if (!from || from === targetId) return;
    const ids = listed.map((i) => i.id as number);
    const fi = ids.indexOf(from);
    const ti = ids.indexOf(targetId);
    if (fi < 0 || ti < 0) return;
    ids.splice(ti, 0, ids.splice(fi, 1)[0]!);
    void saveOrder(ids);
  }

  function startEdit(it: VariantOverviewItem) {
    setEditId(it.id);
    setEditValue(it.value);
    setEditNote(it.note || "");
  }

  async function saveEdit(it: VariantOverviewItem) {
    const v = editValue.trim();
    if (!v) {
      setError("Değer boş olamaz.");
      return;
    }
    const renamed = (upperKind ? trUpper(v) : v) !== it.value;
    if (renamed && it.variant_count > 0) {
      const okk = confirm(
        `"${it.value}" → "${v}"\n\nBu değer ${it.variant_count} ürün varyantında (${it.product_count} ürün) kullanılıyor. ` +
          "Ürünlerdeki değer ve varyant adları da yeni değerle güncellenecek. Stok ve geçmiş hareketler değişmez.\n\nDevam edilsin mi?",
      );
      if (!okk) return;
    }
    const res = await run(() =>
      apiFetch<{ updated_variants: number }>(`/api/settings/variants/${it.id}`, {
        method: "PUT",
        body: JSON.stringify({ value: v, note: editNote.trim() || null, propagate: true }),
      }),
    );
    if (res) {
      setEditId(null);
      flash(res.updated_variants ? `Kaydedildi · ${res.updated_variants} ürün varyantı güncellendi` : "Kaydedildi");
      await load();
    }
  }

  async function remove(it: VariantOverviewItem) {
    if (it.variant_count > 0) return;
    if (!confirm(`"${it.value}" listeden silinsin mi?`)) return;
    const res = await run(() => apiFetch(`/api/settings/variants/${it.id}`, { method: "DELETE" }).then(() => true));
    if (res) {
      flash(`${it.value} silindi`);
      await load();
    }
  }

  const info = KIND_INFO[kind] || { label: kind, hint: "Eski katalog türü (ürün varyantına bağlı değil)", placeholder: "Değer" };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-sm text-slate-800">Varyant Yönetimi</h2>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Ürün kartındaki <b>VARYANT</b> sekmesinde Renk / Beden / Baskı açılır listeleri buradaki değerlerden ve
              sıradan gelir. Ürüne yeni bir değer yazılırsa kayıtta bu listeye otomatik eklenir. Kullanılan bir değer
              silinemez; yeniden adlandırınca ürünlerdeki değer de güncellenir.
            </p>
          </div>
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => void load()} disabled={busy}>
            Yenile
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {data.map((k) => {
            const n = k.items.filter((i) => i.in_settings).length;
            const miss = k.items.length - n;
            return (
              <button
                key={k.kind}
                type="button"
                onClick={() => {
                  setKind(k.kind);
                  setEditId(null);
                  setFilter("");
                }}
                className={`bk-btn text-xs ${kind === k.kind ? "bk-btn-primary" : "bk-btn-ghost"}`}
              >
                {KIND_INFO[k.kind]?.label || k.kind}
                <span className="ml-1.5 rounded-full bg-black/10 px-1.5 text-[10px]">{n}</span>
                {miss > 0 && <span className="ml-1 rounded-full bg-amber-400 text-amber-950 px-1.5 text-[10px]">+{miss}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm">{msg}</div>}

      <form onSubmit={(e) => void addValue(e)} className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="text-xs font-semibold text-slate-600 mb-2">
          Yeni {info.label.toLocaleLowerCase("tr")} ekle <span className="font-normal text-slate-400">· {info.hint}</span>
        </div>
        <div className="grid gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_auto]">
          <input
            className={input}
            placeholder={info.placeholder}
            value={newValue}
            onChange={(e) => setNewValue(upperKind ? trUpper(e.target.value) : e.target.value)}
          />
          <input className={input} placeholder="Not (isteğe bağlı)" value={newNote} onChange={(e) => setNewNote(e.target.value)} />
          <button type="submit" disabled={busy} className="rounded-lg bg-emerald-600 text-white px-5 py-2 text-sm font-bold disabled:opacity-50">
            + Ekle
          </button>
        </div>
      </form>

      {isAttrKind && missing.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex flex-wrap items-center justify-between gap-2">
          <span>
            Ürünlerde kullanılan <b>{missing.length}</b> {info.label.toLocaleLowerCase("tr")} değeri bu listede yok.
          </span>
          <button type="button" className="bk-btn text-xs text-white" style={{ background: "#d97706" }} disabled={busy} onClick={() => void syncMissing()}>
            Tümünü listeye ekle
          </button>
        </div>
      )}

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b flex flex-wrap items-center gap-2">
          <span className="font-semibold text-sm mr-auto">
            {info.label} listesi <span className="text-slate-400 font-normal">({listed.length})</span>
          </span>
          <input
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm w-48"
            placeholder="Ara…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {kind === "Beden" && (
            <button type="button" className="bk-btn bk-btn-ghost text-xs" disabled={busy || !listed.length} onClick={() => autoSort("beden")}>
              XS → XL sırala
            </button>
          )}
          <button type="button" className="bk-btn bk-btn-ghost text-xs" disabled={busy || !listed.length} onClick={() => autoSort("az")}>
            A → Z sırala
          </button>
        </div>
        {!canReorder && needle && (
          <div className="px-4 py-1.5 text-[11px] text-slate-500 bg-slate-50 border-b">Sıralamak için aramayı temizleyin.</div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-2 py-2 w-16">Sıra</th>
                <th className="px-3 py-2">Değer</th>
                <th className="px-3 py-2">Not</th>
                <th className="px-3 py-2 whitespace-nowrap">Kullanım</th>
                <th className="px-3 py-2 text-right w-44">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-400">Yükleniyor…</td>
                </tr>
              )}
              {!loading &&
                visibleListed.map((it, idx) => {
                  const editing = editId === it.id;
                  return (
                    <tr
                      key={it.id}
                      onDragOver={(e) => {
                        if (!canReorder || dragId == null) return;
                        e.preventDefault();
                        if (dragOverId !== it.id) setDragOverId(it.id);
                      }}
                      onDrop={(e) => onDrop(e, it.id as number)}
                      className={`border-t ${dragId === it.id ? "opacity-50" : ""} ${
                        dragOverId === it.id && dragId !== it.id ? "outline outline-2 outline-[#0f766e] outline-offset-[-2px]" : ""
                      } ${editing ? "bg-sky-50" : "hover:bg-slate-50"}`}
                    >
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <span
                          draggable={canReorder}
                          onDragStart={(e) => onDragStart(e, it.id as number)}
                          onDragEnd={() => {
                            setDragId(null);
                            setDragOverId(null);
                          }}
                          title={canReorder ? "Sürükleyip bırakın" : ""}
                          className={`inline-block select-none px-1 text-slate-400 ${canReorder ? "cursor-grab" : "opacity-30"}`}
                        >
                          ⋮⋮
                        </span>
                        <span className="text-[11px] text-slate-400 tabular-nums">{idx + 1}</span>
                      </td>
                      <td className="px-3 py-1.5 font-medium text-slate-800">
                        {editing ? (
                          <input
                            autoFocus
                            className={input}
                            value={editValue}
                            onChange={(e) => setEditValue(upperKind ? trUpper(e.target.value) : e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveEdit(it);
                              if (e.key === "Escape") setEditId(null);
                            }}
                          />
                        ) : (
                          it.value
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-slate-500">
                        {editing ? (
                          <input className={input} value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Not" />
                        ) : (
                          it.note || "—"
                        )}
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-xs">
                        <span className={it.variant_count ? "text-slate-700" : "text-slate-400"}>{usageText(it)}</span>
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex justify-end gap-1">
                          {editing ? (
                            <>
                              <button type="button" className="bk-btn bk-btn-primary text-xs" disabled={busy} onClick={() => void saveEdit(it)}>
                                Kaydet
                              </button>
                              <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => setEditId(null)}>
                                Vazgeç
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="bk-btn bk-btn-ghost text-xs px-2"
                                title="Yukarı"
                                disabled={!canReorder || idx === 0}
                                onClick={() => move(it.id as number, -1)}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className="bk-btn bk-btn-ghost text-xs px-2"
                                title="Aşağı"
                                disabled={!canReorder || idx === visibleListed.length - 1}
                                onClick={() => move(it.id as number, 1)}
                              >
                                ↓
                              </button>
                              <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => startEdit(it)}>
                                Düzenle
                              </button>
                              <button
                                type="button"
                                className="rounded-lg border border-red-200 text-red-600 px-2 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                                disabled={busy || it.variant_count > 0}
                                title={
                                  it.variant_count > 0
                                    ? `${it.variant_count} ürün varyantında kullanılıyor; silinemez (yeniden adlandırabilirsiniz)`
                                    : "Listeden sil"
                                }
                                onClick={() => void remove(it)}
                              >
                                Sil
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              {!loading &&
                visibleMissing.map((it) => (
                  <tr key={`m-${it.value}`} className="border-t bg-amber-50/50">
                    <td className="px-2 py-1.5 text-[11px] text-amber-700">—</td>
                    <td className="px-3 py-1.5 font-medium text-slate-700">{it.value}</td>
                    <td className="px-3 py-1.5 text-xs text-amber-700">Ürünlerde var, listede yok</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-xs text-slate-700">{usageText(it)}</td>
                    <td className="px-3 py-1.5 text-right">
                      <button type="button" className="bk-btn bk-btn-ghost text-xs" disabled={busy} onClick={() => void addValue(undefined, it.value)}>
                        + Listeye ekle
                      </button>
                    </td>
                  </tr>
                ))}
              {!loading && visibleListed.length === 0 && visibleMissing.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                    {needle ? "Eşleşen değer yok" : `Henüz ${info.label.toLocaleLowerCase("tr")} değeri yok — yukarıdan ekleyin.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
