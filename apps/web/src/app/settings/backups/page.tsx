"use client";

import { useCallback, useEffect, useState } from "react";
import { BackupInfo, apiFetch, downloadAuthFile } from "@/lib/api";

export default function BackupsPage() {
  const [items, setItems] = useState<BackupInfo[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setItems(await apiFetch<BackupInfo[]>("/api/settings/backups"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası (admin gerekir)");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const r = await apiFetch<{ filename: string; size_bytes: number; message: string }>(
        "/api/settings/backups",
        { method: "POST" },
      );
      setMsg(r.message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yedekleme hatası");
    } finally {
      setBusy(false);
    }
  }

  async function download(filename: string) {
    try {
      await downloadAuthFile(`/api/settings/backups/${encodeURIComponent(filename)}`, filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : "İndirme hatası");
    }
  }

  async function remove(filename: string) {
    if (!confirm(`${filename} silinsin mi?`)) return;
    await apiFetch(`/api/settings/backups/${encodeURIComponent(filename)}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Yedekleme</h1>
          <p className="text-sm text-slate-500">
            SQLite/DB + uploads → zip · <strong>geri yükleme manuel</strong> (zip içindeki RESTORE.txt)
          </p>
        </div>
        <button
          onClick={create}
          disabled={busy}
          className="rounded-lg bg-baykus-700 text-white px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy ? "Oluşturuluyor…" : "Yedek oluştur"}
        </button>
      </div>
      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}
      {msg && <div className="mb-4 rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm">{msg}</div>}

      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Geri yükleme henüz otomatik değil. Zip&apos;i indirip uygulamayı durdurun; DB dosyasını ve
        uploads/ klasörünü geri koyun, ardından yeniden başlatın.
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2">Dosya</th>
              <th className="px-4 py-2">Boyut</th>
              <th className="px-4 py-2">Tarih</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <tr key={b.filename} className="border-t">
                <td className="px-4 py-2 font-mono text-xs">{b.filename}</td>
                <td className="px-4 py-2">{(b.size_bytes / 1024).toFixed(1)} KB</td>
                <td className="px-4 py-2">{new Date(b.created_at).toLocaleString("tr-TR")}</td>
                <td className="px-4 py-2 text-right space-x-2">
                  <button onClick={() => download(b.filename)} className="text-baykus-700 hover:underline">İndir</button>
                  <button onClick={() => remove(b.filename)} className="text-red-600 hover:underline">Sil</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">Henüz yedek yok</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
