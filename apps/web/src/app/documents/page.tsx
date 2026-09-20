"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BackupInfo, apiFetch, downloadAuthFile } from "@/lib/api";

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function DocumentsPage() {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setBackups(await apiFetch<BackupInfo[]>("/api/settings/backups"));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Yedek listesi alınamadı (admin gerekir). Tasarım dosyaları sipariş detayından yönetilir.",
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function download(filename: string) {
    try {
      await downloadAuthFile(`/api/settings/backups/${encodeURIComponent(filename)}`, filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : "İndirme hatası");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold">Evrak Dolabı</h2>
        <p className="text-xs text-baykus-muted">
          Yedekler ve sistem dosyaları · sipariş tasarım dosyaları ilgili sipariş kartındadır
        </p>
      </div>

      <div className="bk-hub-grid">
        <Link href="/settings/backups" className="bk-hub-card">
          <span className="title">Yedekleme merkezi</span>
          <span className="desc">Veritabanı yedeği oluştur / indir</span>
        </Link>
        <Link href="/orders" className="bk-hub-card">
          <span className="title">Sipariş evrakları</span>
          <span className="desc">İş emri PDF ve tasarım yüklemeleri</span>
        </Link>
        <Link href="/quotes" className="bk-hub-card">
          <span className="title">Teklif PDF</span>
          <span className="desc">Teklif belgelerini indirin</span>
        </Link>
      </div>

      {error && <div className="rounded bg-amber-50 text-amber-900 px-3 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{msg}</div>}

      <div>
        <div className="text-sm font-semibold mb-1.5">Yedek dosyaları</div>
        <div className="bk-table-wrap">
          <table className="bk-table">
            <thead>
              <tr>
                <th>Dosya</th>
                <th className="text-right">Boyut</th>
                <th>Tarih</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.filename}>
                  <td className="font-mono text-[11px]">{b.filename}</td>
                  <td className="text-right tabular-nums">{fmtSize(b.size_bytes)}</td>
                  <td className="text-xs">
                    {b.created_at
                      ? new Date(b.created_at).toLocaleString("tr-TR")
                      : "—"}
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      className="text-baykus-primary hover:underline text-xs"
                      onClick={() => download(b.filename)}
                    >
                      İndir
                    </button>
                  </td>
                </tr>
              ))}
              {backups.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-baykus-muted py-8">
                    Henüz yedek yok —{" "}
                    <Link href="/settings/backups" className="text-baykus-primary hover:underline">
                      Yedekleme
                    </Link>
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
