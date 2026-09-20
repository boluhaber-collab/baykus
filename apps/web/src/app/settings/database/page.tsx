"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type DbSettings = {
  postgres_host?: string;
  postgres_port?: string;
  postgres_db?: string;
  postgres_user?: string;
  postgres_ssl?: string;
};

export default function DatabaseSettingsPage() {
  const [form, setForm] = useState({
    postgres_host: "",
    postgres_port: "5432",
    postgres_db: "baykus",
    postgres_user: "",
    postgres_ssl: "Hayır",
  });
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    apiFetch<DbSettings>("/api/settings/app")
      .then((s) =>
        setForm({
          postgres_host: s.postgres_host || "",
          postgres_port: s.postgres_port || "5432",
          postgres_db: s.postgres_db || "baykus",
          postgres_user: s.postgres_user || "",
          postgres_ssl: s.postgres_ssl || "Hayır",
        }),
      )
      .catch((e) => setError(e instanceof Error ? e.message : "Yükleme hatası"));
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(""); setMsg("");
    try {
      await apiFetch("/api/settings/app", { method: "PUT", body: JSON.stringify(form) });
      setMsg("Bağlantı bilgileri kaydedildi. Şifre güvenlik için saklanmaz.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    }
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <h2 className="text-base font-bold">Merkezi DB / VPS</h2>
        <p className="text-xs text-baykus-muted">
          PostgreSQL bağlantı alanları · yalnızca uygulama ayarı JSON&apos;unda · şifre git&apos;e yazılmaz
        </p>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{msg}</div>}
      <form onSubmit={save} className="bk-card p-4 space-y-3 text-sm">
        {(
          [
            ["postgres_host", "Host"],
            ["postgres_port", "Port"],
            ["postgres_db", "Veritabanı"],
            ["postgres_user", "Kullanıcı"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <label className="block text-xs text-baykus-muted mb-1">{label}</label>
            <input
              className="bk-input"
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              autoComplete="off"
            />
          </div>
        ))}
        <div>
          <label className="block text-xs text-baykus-muted mb-1">SSL</label>
          <select className="bk-input" value={form.postgres_ssl} onChange={(e) => setForm({ ...form, postgres_ssl: e.target.value })}>
            <option>Hayır</option>
            <option>Evet</option>
          </select>
        </div>
        <p className="text-[11px] text-amber-800 bg-amber-50 rounded px-2 py-1.5">
          Şifre alanı bilerek yok — canlı sırları repoya/ayara yazmayın. Bağlantı için ortam değişkeni veya sunucu secrets kullanın.
        </p>
        <button type="submit" className="bk-btn bk-btn-primary">Kaydet</button>
      </form>
    </div>
  );
}
