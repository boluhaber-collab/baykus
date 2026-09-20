"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch, downloadAuthFile } from "@/lib/api";

type Doc = {
  id: number;
  title: string;
  category: string | null;
  original_filename: string;
  content_type: string | null;
  size_bytes: number;
  notes: string | null;
  created_at: string | null;
};

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function DocumentsPage() {
  const [items, setItems] = useState<Doc[]>([]);
  const [q, setQ] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      const qs = params.toString();
      setItems(await apiFetch<Doc[]>(`/api/documents${qs ? `?${qs}` : ""}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Dosya seçin");
      return;
    }
    setError("");
    setMsg("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", title.trim() || file.name);
    if (category) fd.append("category", category);
    if (notes) fd.append("notes", notes);
    try {
      await apiFetch("/api/documents", { method: "POST", body: fd });
      setMsg("Evrak yüklendi");
      setTitle("");
      setCategory("");
      setNotes("");
      setFile(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yükleme hatası");
    }
  }

  async function remove(id: number) {
    if (!confirm("Evrakı silmek istiyor musunuz?")) return;
    try {
      await apiFetch(`/api/documents/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silme hatası");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold">Evrak Dolabı</h2>
        <p className="text-xs text-baykus-muted">
          Genel belgeler · sipariş tasarımları sipariş kartında ·{" "}
          <Link href="/settings/backups" className="text-baykus-primary hover:underline">
            yedekler
          </Link>
        </p>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{msg}</div>}

      <form onSubmit={upload} className="rounded border bg-white p-3 grid md:grid-cols-4 gap-2 text-sm">
        <label className="md:col-span-2">
          Başlık
          <input className="bk-input mt-0.5" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dosya adı kullanılır" />
        </label>
        <label>
          Kategori
          <input className="bk-input mt-0.5" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="hukuk, lojistik…" />
        </label>
        <label>
          Dosya
          <input
            required
            type="file"
            className="bk-input mt-0.5 text-xs"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
        <label className="md:col-span-3">
          Not
          <input className="bk-input mt-0.5" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="flex items-end">
          <button type="submit" className="bk-btn bk-btn-primary text-xs w-full">
            Yükle
          </button>
        </div>
      </form>

      <div className="flex gap-2 items-end">
        <label className="text-sm flex-1">
          Ara
          <input className="bk-input mt-0.5 block w-full" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => void load()}>
          Yenile
        </button>
      </div>

      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Başlık</th>
              <th>Kategori</th>
              <th>Dosya</th>
              <th className="text-right">Boyut</th>
              <th>Tarih</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((d) => (
              <tr key={d.id}>
                <td className="font-medium">{d.title}</td>
                <td>{d.category || "—"}</td>
                <td className="font-mono text-[11px]">{d.original_filename}</td>
                <td className="text-right tabular-nums">{fmtSize(d.size_bytes)}</td>
                <td className="text-xs">
                  {d.created_at ? new Date(d.created_at).toLocaleString("tr-TR") : "—"}
                </td>
                <td className="text-right space-x-2 text-xs">
                  <button
                    type="button"
                    className="text-baykus-primary hover:underline"
                    onClick={() =>
                      downloadAuthFile(`/api/documents/${d.id}/download`, d.original_filename)
                    }
                  >
                    İndir
                  </button>
                  <button type="button" className="text-red-600 hover:underline" onClick={() => remove(d.id)}>
                    Sil
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-baykus-muted py-8">
                  Evrak yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
