"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import StatusFooter from "@/components/StatusFooter";

type MailSettings = {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  smtp_use_tls: boolean;
  from_name: string;
  from_email: string;
  imap_host: string;
  imap_port: number;
  imap_user: string;
  imap_password: string;
  imap_use_ssl: boolean;
  imap_folder: string;
  smtp_configured: boolean;
  imap_configured: boolean;
  config_path: string;
};

const EMPTY: MailSettings = {
  smtp_host: "",
  smtp_port: 587,
  smtp_user: "",
  smtp_password: "",
  smtp_use_tls: true,
  from_name: "Baykuş Baskı",
  from_email: "",
  imap_host: "",
  imap_port: 993,
  imap_user: "",
  imap_password: "",
  imap_use_ssl: true,
  imap_folder: "INBOX",
  smtp_configured: false,
  imap_configured: false,
  config_path: "",
};

function domainFromEmail(email: string): string {
  const m = (email || "").trim().toLowerCase().match(/@([^@\s>]+)$/);
  return m ? m[1] : "";
}

export default function MailSettingsPage() {
  const [form, setForm] = useState<MailSettings>(EMPTY);
  const [smtpPw, setSmtpPw] = useState("");
  const [imapPw, setImapPw] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const s = await apiFetch<MailSettings>("/api/mail/settings");
      setForm(s);
      setSmtpPw("");
      setImapPw("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası (admin gerekli)");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function settingsBody(includePasswords: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = {
      smtp_host: form.smtp_host,
      smtp_port: Number(form.smtp_port) || 587,
      smtp_user: form.smtp_user,
      smtp_use_tls: form.smtp_use_tls,
      from_name: form.from_name,
      from_email: form.from_email,
      imap_host: form.imap_host,
      imap_port: Number(form.imap_port) || 993,
      imap_user: form.imap_user,
      imap_use_ssl: form.imap_use_ssl,
      imap_folder: form.imap_folder || "INBOX",
    };
    if (includePasswords) {
      // Blank password fields → omit so API keeps / uses saved password
      if (smtpPw.trim()) body.smtp_password = smtpPw.trim();
      if (imapPw.trim()) body.imap_password = imapPw.trim();
    }
    return body;
  }

  async function save(e?: FormEvent) {
    if (e) e.preventDefault();
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const s = await apiFetch<MailSettings>("/api/mail/settings", {
        method: "PUT",
        body: JSON.stringify(settingsBody(true)),
      });
      setForm(s);
      setSmtpPw("");
      setImapPw("");
      setMsg("E-posta ayarları kaydedildi (yerel dosya — veritabanında şifre yok)");
      return s;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function test(kind: "smtp" | "imap") {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      // Capture form+typed passwords now (blank password → omitted → API uses saved)
      const payload = settingsBody(true);

      // Auto-save so Kaydet is not required before test
      try {
        const saved = await apiFetch<MailSettings>("/api/mail/settings", {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setForm(saved);
        setSmtpPw("");
        setImapPw("");
      } catch (saveErr) {
        console.warn("mail settings auto-save failed", saveErr);
      }

      const r = await apiFetch<{ ok: boolean; message: string }>(`/api/mail/settings/test-${kind}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (r.ok) setMsg(r.message);
      else setError(r.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test hatası");
    } finally {
      setBusy(false);
    }
  }

  function applyPreset(kind: "gmail" | "outlook" | "yandex" | "cpanel") {
    if (kind === "gmail") {
      setForm((f) => ({
        ...f,
        smtp_host: "smtp.gmail.com",
        smtp_port: 587,
        smtp_use_tls: true,
        imap_host: "imap.gmail.com",
        imap_port: 993,
        imap_use_ssl: true,
        imap_folder: "INBOX",
      }));
      setMsg("Gmail şablonu uygulandı — Uygulama şifresi kullanın (normal şifre genelde çalışmaz)");
    } else if (kind === "outlook") {
      setForm((f) => ({
        ...f,
        smtp_host: "smtp.office365.com",
        smtp_port: 587,
        smtp_use_tls: true,
        imap_host: "outlook.office365.com",
        imap_port: 993,
        imap_use_ssl: true,
        imap_folder: "INBOX",
      }));
      setMsg("Outlook şablonu uygulandı — kullanıcı/şifre ve gönderen adresini doldurun");
    } else if (kind === "yandex") {
      setForm((f) => ({
        ...f,
        smtp_host: "smtp.yandex.com",
        smtp_port: 465,
        smtp_use_tls: false,
        imap_host: "imap.yandex.com",
        imap_port: 993,
        imap_use_ssl: true,
        imap_folder: "INBOX",
      }));
      setMsg("Yandex şablonu uygulandı — kullanıcı/şifre ve gönderen adresini doldurun");
    } else {
      setForm((f) => {
        const domain =
          domainFromEmail(f.from_email) ||
          domainFromEmail(f.smtp_user) ||
          "";
        const host = domain ? `mail.${domain}` : "mail.ornek.com";
        return {
          ...f,
          smtp_host: host,
          smtp_port: 465,
          smtp_use_tls: false,
          imap_host: host,
          imap_port: 993,
          imap_use_ssl: true,
          imap_folder: "INBOX",
        };
      });
      setMsg(
        "cPanel / Hosting şablonu uygulandı — sunucu mail.<alanadı> (gönderen veya kullanıcı e-postasından), SMTP 465 SSL, IMAP 993 SSL. Alan adı boşsa önce e-posta adresini yazıp şablona tekrar basın.",
      );
    }
  }

  const input =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-baykus-500";

  return (
    <div className="space-y-3 pb-2 max-w-3xl">
      <div className="bk-sticky-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/settings" className="text-xs text-baykus-primary hover:underline">
            ← Ayarlar
          </Link>
          <h1 className="text-lg font-bold mt-1 leading-tight">E-Posta Ayarları</h1>
          <p className="text-[11px] text-baykus-muted">
            SMTP (gönder) + IMAP (al) · şifreler yerel dosyada saklanır · bulut zorunluluğu yok
          </p>
        </div>
        <Link href="/mail" className="rounded-lg bg-sky-700 text-white px-3 py-2 text-sm">
          E-Posta kutusuna git →
        </Link>
      </div>

      <div className="rounded border border-sky-200 bg-sky-50 text-sky-950 px-3 py-2 text-sm space-y-1">
        <p className="font-semibold text-[13px]">Nasıl yapılandırılır?</p>
        <ol className="list-decimal ml-4 text-xs space-y-0.5">
          <li>Hazır şablon seçin (Gmail / Outlook / Yandex / cPanel) veya kendi sunucu bilgilerinizi girin.</li>
          <li>Gmail için &quot;Uygulama şifresi&quot; kullanın (normal hesap şifresi çoğu zaman çalışmaz).</li>
          <li>
            cPanel / hosting e-postası için genelde sunucu <code className="bg-white/70 px-1 rounded">mail.alanadiniz.com</code>,
            SMTP 465 (SSL) ve IMAP 993 (SSL) kullanılır.
          </li>
          <li>
            Alanları doldurup <strong>SMTP Test / IMAP Test</strong>e basın — formdaki değerler gönderilir ve otomatik kaydedilir
            (şifre alanı boşsa kayıtlı şifre kullanılır).
          </li>
          <li>
            <Link href="/mail" className="underline font-medium">
              E-Posta
            </Link>{" "}
            menüsünden gönderin veya gelenleri senkronize edin.
          </li>
        </ol>
        {form.config_path && (
          <p className="text-[11px] text-sky-800 mt-1">Yerel dosya: {form.config_path}</p>
        )}
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm whitespace-pre-wrap">{error}</div>}
      {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{msg}</div>}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded border px-3 py-1.5 text-xs" onClick={() => applyPreset("gmail")}>
          Gmail şablonu
        </button>
        <button type="button" className="rounded border px-3 py-1.5 text-xs" onClick={() => applyPreset("outlook")}>
          Outlook şablonu
        </button>
        <button type="button" className="rounded border px-3 py-1.5 text-xs" onClick={() => applyPreset("yandex")}>
          Yandex şablonu
        </button>
        <button type="button" className="rounded border px-3 py-1.5 text-xs" onClick={() => applyPreset("cpanel")}>
          cPanel / Hosting
        </button>
        <span
          className={`rounded px-2 py-1 text-xs ${form.smtp_configured ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
        >
          SMTP: {form.smtp_configured ? "hazır" : "eksik"}
        </span>
        <span
          className={`rounded px-2 py-1 text-xs ${form.imap_configured ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
        >
          IMAP: {form.imap_configured ? "hazır" : "eksik"}
        </span>
      </div>

      <form onSubmit={(e) => void save(e)} className="space-y-4">
        <section className="rounded border bg-white p-4 space-y-3">
          <h2 className="font-semibold text-sm">SMTP — Gönderim</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="text-xs text-slate-600">SMTP sunucu</span>
              <input className={input} value={form.smtp_host} onChange={(e) => setForm({ ...form, smtp_host: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="text-xs text-slate-600">Port</span>
              <input
                className={input}
                type="number"
                value={form.smtp_port}
                onChange={(e) => setForm({ ...form, smtp_port: Number(e.target.value) || 587 })}
              />
            </label>
            <label className="text-sm">
              <span className="text-xs text-slate-600">Kullanıcı</span>
              <input className={input} value={form.smtp_user} onChange={(e) => setForm({ ...form, smtp_user: e.target.value })} autoComplete="off" />
            </label>
            <label className="text-sm">
              <span className="text-xs text-slate-600">Şifre {form.smtp_password ? "(kayıtlı)" : ""}</span>
              <input
                className={input}
                type="password"
                value={smtpPw}
                onChange={(e) => setSmtpPw(e.target.value)}
                placeholder={form.smtp_password ? "Değiştirmek için yeni şifre" : "SMTP şifresi"}
                autoComplete="new-password"
              />
            </label>
            <label className="text-sm">
              <span className="text-xs text-slate-600">Gönderen adı</span>
              <input className={input} value={form.from_name} onChange={(e) => setForm({ ...form, from_name: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="text-xs text-slate-600">Gönderen e-posta</span>
              <input className={input} value={form.from_email} onChange={(e) => setForm({ ...form, from_email: e.target.value })} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.smtp_use_tls}
              onChange={(e) => setForm({ ...form, smtp_use_tls: e.target.checked })}
            />
            STARTTLS (port 587 için işaretli; 465 SSL için kaldırın)
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void test("smtp")}
            className="rounded-lg border border-emerald-600 text-emerald-800 px-3 py-1.5 text-sm"
          >
            SMTP Test
          </button>
        </section>

        <section className="rounded border bg-white p-4 space-y-3">
          <h2 className="font-semibold text-sm">IMAP — Alma</h2>
          <p className="text-xs text-slate-500">
            Kullanıcı/şifre boş bırakılırsa SMTP bilgileri kullanılır.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="text-xs text-slate-600">IMAP sunucu</span>
              <input className={input} value={form.imap_host} onChange={(e) => setForm({ ...form, imap_host: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="text-xs text-slate-600">Port</span>
              <input
                className={input}
                type="number"
                value={form.imap_port}
                onChange={(e) => setForm({ ...form, imap_port: Number(e.target.value) || 993 })}
              />
            </label>
            <label className="text-sm">
              <span className="text-xs text-slate-600">Kullanıcı (opsiyonel)</span>
              <input className={input} value={form.imap_user} onChange={(e) => setForm({ ...form, imap_user: e.target.value })} autoComplete="off" />
            </label>
            <label className="text-sm">
              <span className="text-xs text-slate-600">Şifre {form.imap_password ? "(kayıtlı)" : ""}</span>
              <input
                className={input}
                type="password"
                value={imapPw}
                onChange={(e) => setImapPw(e.target.value)}
                placeholder={form.imap_password ? "Değiştirmek için yeni şifre" : "Boş = SMTP şifresi"}
                autoComplete="new-password"
              />
            </label>
            <label className="text-sm">
              <span className="text-xs text-slate-600">Klasör</span>
              <input className={input} value={form.imap_folder} onChange={(e) => setForm({ ...form, imap_folder: e.target.value })} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.imap_use_ssl}
              onChange={(e) => setForm({ ...form, imap_use_ssl: e.target.checked })}
            />
            SSL (port 993)
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void test("imap")}
            className="rounded-lg border border-sky-600 text-sky-800 px-3 py-1.5 text-sm"
          >
            IMAP Test
          </button>
        </section>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-baykus-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Kaydet
          </button>
          <button type="button" className="rounded-lg border px-4 py-2 text-sm" onClick={() => void load()}>
            Yenile
          </button>
        </div>
      </form>

      <StatusFooter onRefresh={load} />
    </div>
  );
}
