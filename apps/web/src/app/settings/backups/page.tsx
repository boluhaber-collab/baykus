"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BackupInfo, apiFetch, downloadAuthFile } from "@/lib/api";

type Checklist = {
  ok: boolean;
  backup_dir: string;
  backup_count: number;
  latest: string | null;
  db_engine: string;
  checklist: { step: number; title: string; detail: string }[];
  warnings: string[];
};

function BackupsPageInner() {
  const sp = useSearchParams();
  const tab = sp.get("tab") === "test" ? "test" : "list";
  const [items, setItems] = useState<BackupInfo[]>([]);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [verifyDetail, setVerifyDetail] = useState<{
    filename: string;
    ok: boolean;
    message: string;
    sample?: string[];
  } | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [list, cl] = await Promise.all([
        apiFetch<BackupInfo[]>("/api/settings/backups"),
        apiFetch<Checklist>("/api/settings/backups/restore-checklist").catch(() => null),
      ]);
      setItems(list);
      setChecklist(cl);
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

  async function verify(filename: string) {
    setBusy(true);
    setError("");
    setMsg("");
    setVerifyDetail(null);
    try {
      const r = await apiFetch<{
        ok: boolean;
        message: string;
        entries?: number;
        sample?: string[];
        filename?: string;
      }>(`/api/settings/backups/${encodeURIComponent(filename)}/verify`, { method: "POST" });
      setMsg(r.ok ? `✓ ${r.message}` : `✗ ${r.message}`);
      setVerifyDetail({
        filename,
        ok: r.ok,
        message: r.message,
        sample: r.sample,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Doğrulama hatası");
    } finally {
      setBusy(false);
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
          <h1 className="text-2xl font-bold">Yedekleme Yönetimi</h1>
          <p className="text-sm text-slate-500">
            SQLite/DB + uploads → zip · indirme · Yedek Test Et · güvenli geri yükleme kontrol listesi
            (otomatik restore / DPAPI yok)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={create}
            disabled={busy}
            className="rounded-lg text-white px-4 py-2 text-sm disabled:opacity-50"
            style={{ backgroundColor: "#198754" }}
          >
            {busy ? "Oluşturuluyor…" : "Yedek Al"}
          </button>
          <a
            href="#restore-checklist"
            className="rounded-lg px-4 py-2 text-sm text-white"
            style={{ backgroundColor: "#7c3aed" }}
          >
            Yedek Test / Kontrol
          </a>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}
      {msg && <div className="mb-4 rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm">{msg}</div>}

      <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        Başka bilgisayara geçerken burada <strong>Yedek Al</strong> ile zip oluşturup indirin; yeni
        ortamda kontrol listesine uyarak DB + uploads&apos;ı manuel geri koyun. Program sürümü
        korunur; sırlar / DPAPI taşınmaz.
      </div>

      {checklist && (
        <div className="mb-4 rounded-xl border bg-white p-4 shadow-sm text-sm grid md:grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-slate-500">Yedek klasörü</div>
            <div className="font-mono text-xs break-all">{checklist.backup_dir}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Toplam tam yedek</div>
            <div className="font-bold text-lg">{checklist.backup_count}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Motor / Son yedek</div>
            <div>
              {checklist.db_engine} · {checklist.latest || "—"}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto mb-6">
        <div className="px-4 py-3 border-b bg-slate-50 font-medium text-sm">Tam Yedekler</div>
        <table className="min-w-full text-sm">
          <thead className="bg-white text-left text-slate-600">
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
                <td className="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                  <button
                    onClick={() => verify(b.filename)}
                    className="text-violet-700 hover:underline"
                    style={{ color: "#7c3aed" }}
                  >
                    Yedek Test Et
                  </button>
                  <button onClick={() => download(b.filename)} className="text-baykus-700 hover:underline">
                    İndir
                  </button>
                  <button onClick={() => remove(b.filename)} className="text-red-600 hover:underline">
                    Sil
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  Henüz yedek yok — «Yedek Al» ile oluşturun
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(tab === "test" || verifyDetail || checklist) && (
        <div id="restore-checklist" className="rounded-xl border bg-white shadow-sm p-4 mb-4">
          <h2 className="font-bold text-lg mb-2" style={{ color: "#7c3aed" }}>
            Yedek Test Et / Geri Yükleme Kontrol Listesi
          </h2>
          <p className="text-sm text-slate-500 mb-3">
            Otomatik geri yükleme yoktur (güvenli). Zip bütünlüğünü test edin; ardından kontrol
            listesini izleyin.
          </p>
          {verifyDetail && (
            <div
              className={`mb-4 rounded-lg px-4 py-3 text-sm ${
                verifyDetail.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"
              }`}
            >
              <div className="font-semibold">
                {verifyDetail.ok ? "Tamam" : "Hata"} · {verifyDetail.filename}
              </div>
              <div>{verifyDetail.message}</div>
              {verifyDetail.sample && verifyDetail.sample.length > 0 && (
                <ul className="mt-2 font-mono text-xs list-disc pl-4">
                  {verifyDetail.sample.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {checklist && (
            <>
              <ol className="space-y-2 text-sm mb-4">
                {checklist.checklist.map((c) => (
                  <li key={c.step} className="flex gap-3 rounded-lg border border-slate-100 p-3">
                    <span className="shrink-0 w-7 h-7 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center">
                      {c.step}
                    </span>
                    <div>
                      <div className="font-semibold">{c.title}</div>
                      <div className="text-slate-600">{c.detail}</div>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
                <div className="font-semibold mb-1">Uyarılar</div>
                <ul className="list-disc pl-5 space-y-1">
                  {checklist.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function BackupsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Yükleniyor…</p>}>
      <BackupsPageInner />
    </Suspense>
  );
}
