"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type DbSettings = {
  postgres_host?: string;
  postgres_port?: string;
  postgres_db?: string;
  postgres_user?: string;
  postgres_ssl?: string;
  merkezi_db_turu?: string;
  sunucu_lokasyon?: string;
};

export default function DatabaseSettingsPage() {
  const [form, setForm] = useState({
    merkezi_db_turu: "PostgreSQL",
    postgres_host: "",
    postgres_port: "5432",
    postgres_db: "baykus",
    postgres_user: "",
    postgres_ssl: "Hayır",
    sunucu_lokasyon: "",
  });
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    apiFetch<DbSettings>("/api/settings/app")
      .then((s) =>
        setForm({
          merkezi_db_turu: s.merkezi_db_turu || "PostgreSQL",
          postgres_host: s.postgres_host || "",
          postgres_port: s.postgres_port || "5432",
          postgres_db: s.postgres_db || "baykus",
          postgres_user: s.postgres_user || "",
          postgres_ssl: s.postgres_ssl || "Hayır",
          sunucu_lokasyon: s.sunucu_lokasyon || "",
        }),
      )
      .catch((e) => setError(e instanceof Error ? e.message : "Yükleme hatası"));
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    try {
      await apiFetch("/api/settings/app", { method: "PUT", body: JSON.stringify(form) });
      setMsg("Bağlantı bilgileri kaydedildi. Şifre güvenlik için saklanmaz.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    }
  }

  const checklist = [
    { label: "Merkezi DB Türü", ok: !!form.merkezi_db_turu, detail: form.merkezi_db_turu },
    { label: "VPS Sunucu / Host", ok: !!form.postgres_host, detail: form.postgres_host || "Sunucu girilmemiş" },
    { label: "Veritabanı", ok: !!form.postgres_db, detail: form.postgres_db || "Veritabanı girilmemiş" },
    { label: "DB Kullanıcısı", ok: !!form.postgres_user, detail: form.postgres_user || "Kullanıcı girilmemiş" },
    { label: "SSL", ok: true, detail: form.postgres_ssl },
    { label: "Şifre alanı", ok: true, detail: "Bilerek yok — secrets/env kullanın" },
  ];

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Merkezi DB / VPS</h2>
          <p className="text-xs text-baykus-muted">
            Host alanları · şifre yok · SQLite yerel bootstrap korunur
          </p>
        </div>
        <Link href="/settings/health" className="bk-btn bk-btn-ghost text-xs">
          Sistem Sağlık
        </Link>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{msg}</div>}

      <div className="bk-table-wrap">
        <table className="bk-table text-sm">
          <thead>
            <tr>
              <th>Kontrol</th>
              <th>Durum</th>
              <th>Detay</th>
            </tr>
          </thead>
          <tbody>
            {checklist.map((c) => (
              <tr key={c.label}>
                <td>{c.label}</td>
                <td className={c.ok ? "text-emerald-700 font-semibold text-xs" : "text-amber-700 font-semibold text-xs"}>
                  {c.ok ? "Tamam" : "Eksik"}
                </td>
                <td className="text-xs text-baykus-muted">{c.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={save} className="bk-card p-4 space-y-3 text-sm">
        <div>
          <label className="block text-xs text-baykus-muted mb-1">Merkezi DB Türü</label>
          <select
            className="bk-input"
            value={form.merkezi_db_turu}
            onChange={(e) => setForm({ ...form, merkezi_db_turu: e.target.value })}
          >
            <option>PostgreSQL</option>
            <option>MySQL</option>
          </select>
        </div>
        {(
          [
            ["postgres_host", "Host / VPS Sunucu"],
            ["postgres_port", "Port"],
            ["postgres_db", "Veritabanı"],
            ["postgres_user", "Kullanıcı"],
            ["sunucu_lokasyon", "Sunucu lokasyon notu"],
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
          Şifre alanı bilerek yok — canlı sırları repoya/ayara yazmayın. Yerel geliştirmede SQLite bootstrap kullanın
          (<code>python -m app.bootstrap_sqlite</code>). SQLite → merkezi DB aktarım / DPAPI webde yok.
        </p>
        <button type="submit" className="bk-btn bk-btn-primary">
          Kaydet
        </button>
      </form>
    </div>
  );
}
