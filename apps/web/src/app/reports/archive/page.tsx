"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch, downloadAuthFile } from "@/lib/api";

type Doc = {
  id: number;
  title: string;
  category: string | null;
  archive_tag: string | null;
  original_filename: string;
  size_bytes: number;
  created_at: string | null;
};

export default function ArchiveCenterPage() {
  const [items, setItems] = useState<Doc[]>([]);
  const [tag, setTag] = useState("arsiv");
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (tag) params.set("archive_tag", tag);
      setItems(await apiFetch<Doc[]>(`/api/documents?${params}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [tag]);

  useEffect(() => { void load(); }, [load]);

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!file) { setError("Dosya seçin"); return; }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", title.trim() || file.name);
    fd.append("category", "Arşiv");
    fd.append("archive_tag", tag || "arsiv");
    try {
      await apiFetch("/api/documents", { method: "POST", body: fd });
      setTitle(""); setFile(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yükleme hatası");
    }
  }

  async function remove(id: number) {
    if (!confirm("Arşivden silinsin mi?")) return;
    try {
      await apiFetch(`/api/documents/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silme hatası");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Belge Arşiv Merkezi</h2>
          <p className="text-xs text-baykus-muted">Arşiv etiketli evraklar · <Link href="/documents" className="text-baykus-primary hover:underline">Evrak Dolabı</Link></p>
        </div>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      <form onSubmit={upload} className="bk-card p-3 grid md:grid-cols-4 gap-2 text-sm">
        <input className="bk-input" placeholder="Başlık" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="bk-input" placeholder="Arşiv etiketi" value={tag} onChange={(e) => setTag(e.target.value)} />
        <input type="file" className="bk-input" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <button type="submit" className="bk-btn bk-btn-primary">Arşive ekle</button>
      </form>
      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead><tr><th>Başlık</th><th>Etiket</th><th>Dosya</th><th>Tarih</th><th></th></tr></thead>
          <tbody>
            {items.map((d) => (
              <tr key={d.id}>
                <td className="font-medium">{d.title}</td>
                <td><span className="rounded bg-slate-100 px-2 py-0.5 text-[11px]">{d.archive_tag || d.category || "—"}</span></td>
                <td className="text-xs">{d.original_filename}</td>
                <td className="text-xs">{d.created_at ? new Date(d.created_at).toLocaleDateString("tr-TR") : "—"}</td>
                <td className="text-right space-x-2 text-xs whitespace-nowrap">
                  <button type="button" className="text-baykus-primary hover:underline"
                    onClick={() => downloadAuthFile(`/api/documents/${d.id}/download`, d.original_filename)}>İndir</button>
                  <button type="button" className="text-red-600 hover:underline" onClick={() => remove(d.id)}>Sil</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={5} className="text-center text-baykus-muted py-8">Arşiv boş</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
