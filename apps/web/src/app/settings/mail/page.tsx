"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatTrDateTime } from "@/lib/dates";
import StatusFooter from "@/components/StatusFooter";

type MailAccount = {
  id: number;
  label: string;
  display_name: string;
  is_default: boolean;
  active: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string; // maskeli
  smtp_use_tls: boolean;
  from_name: string;
  from_email: string;
  imap_host: string;
  imap_port: number;
  imap_user: string;
  imap_password: string; // maskeli
  imap_use_ssl: boolean;
  imap_folder: string;
  smtp_configured: boolean;
  imap_configured: boolean;
  effective_from?: string;
  last_sync_at?: string | null;
  last_ok?: boolean | null;
  last_message?: string;
};

type AccountsResp = {
  accounts: MailAccount[];
  default_account_id: number | null;
  storage_path: string;
};

type Form = Omit<MailAccount, "id" | "display_name" | "smtp_configured" | "imap_configured"> & {
  id: number | null;
};

const EMPTY_FORM: Form = {
  id: null,
  label: "",
  is_default: false,
  active: true,
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
};

/** API naive UTC datetime → yerel GG.AA.YYYY SS:DD */
function utcLabel(iso: string | null | undefined, empty = "—"): string {
  if (!iso) return empty;
  const s = String(iso);
  return formatTrDateTime(/[Zz]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`, empty);
}

function domainFromEmail(email: string): string {
  const m = (email || "").trim().toLowerCase().match(/@([^@\s>]+)$/);
  return m ? m[1] : "";
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[11px] ${
        ok ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
      }`}
    >
      {label}: {ok ? "hazır" : "eksik"}
    </span>
  );
}

export default function MailSettingsPage() {
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [storagePath, setStoragePath] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [smtpPw, setSmtpPw] = useState("");
  const [imapPw, setImapPw] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const r = await apiFetch<AccountsResp>("/api/mail/accounts");
      setAccounts(r.accounts);
      setStoragePath(r.storage_path);
      return r.accounts;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası (admin gerekli)");
      return [] as MailAccount[];
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const editing = form !== null;
  const editingAccount = form?.id != null ? accounts.find((a) => a.id === form.id) || null : null;

  function startNew() {
    setForm({ ...EMPTY_FORM, is_default: accounts.length === 0 });
    setSmtpPw("");
    setImapPw("");
    setMsg("");
    setError("");
  }

  function startEdit(a: MailAccount) {
    setForm({
      id: a.id,
      label: a.label,
      is_default: a.is_default,
      active: a.active,
      smtp_host: a.smtp_host,
      smtp_port: a.smtp_port,
      smtp_user: a.smtp_user,
      smtp_password: a.smtp_password,
      smtp_use_tls: a.smtp_use_tls,
      from_name: a.from_name,
      from_email: a.from_email,
      imap_host: a.imap_host,
      imap_port: a.imap_port,
      imap_user: a.imap_user,
      imap_password: a.imap_password,
      imap_use_ssl: a.imap_use_ssl,
      imap_folder: a.imap_folder,
    });
    setSmtpPw("");
    setImapPw("");
    setMsg("");
    setError("");
  }

  function cancelEdit() {
    setForm(null);
    setSmtpPw("");
    setImapPw("");
  }

  function body(f: Form): Record<string, unknown> {
    const b: Record<string, unknown> = {
      label: f.label,
      active: f.active,
      is_default: f.is_default,
      smtp_host: f.smtp_host,
      smtp_port: Number(f.smtp_port) || 587,
      smtp_user: f.smtp_user,
      smtp_use_tls: f.smtp_use_tls,
      from_name: f.from_name,
      from_email: f.from_email,
      imap_host: f.imap_host,
      imap_port: Number(f.imap_port) || 993,
      imap_user: f.imap_user,
      imap_use_ssl: f.imap_use_ssl,
      imap_folder: f.imap_folder || "INBOX",
    };
    // Boş şifre → gönderilmez, API kayıtlı şifreyi korur / kullanır
    if (smtpPw.trim()) b.smtp_password = smtpPw.trim();
    if (imapPw.trim()) b.imap_password = imapPw.trim();
    return b;
  }

  async function persist(f: Form): Promise<MailAccount> {
    if (f.id == null) {
      return apiFetch<MailAccount>("/api/mail/settings/accounts", {
        method: "POST",
        body: JSON.stringify(body(f)),
      });
    }
    return apiFetch<MailAccount>(`/api/mail/settings/accounts/${f.id}`, {
      method: "PUT",
      body: JSON.stringify(body(f)),
    });
  }

  async function save(e?: FormEvent) {
    if (e) e.preventDefault();
    if (!form) return;
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const saved = await persist(form);
      await load();
      startEdit(saved);
      setMsg(`${saved.display_name} kaydedildi (şifre yerel dosyada — veritabanında değil)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    } finally {
      setBusy(false);
    }
  }

  async function test(kind: "smtp" | "imap") {
    if (!form) return;
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const payload: Record<string, unknown> = { ...body(form) };
      let accountId = form.id;
      // Kayıtlı hesap: önce otomatik kaydet (Kaydet'e basmak gerekmez)
      if (accountId != null) {
        try {
          const saved = await persist(form);
          accountId = saved.id;
          await load();
          startEdit(saved);
        } catch (saveErr) {
          console.warn("mail account auto-save failed", saveErr);
        }
      }
      if (accountId != null) payload.account_id = accountId;
      const r = await apiFetch<{ ok: boolean; message: string }>(`/api/mail/settings/test-${kind}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        setMsg(form.id == null ? `${r.message} — hesabı eklemek için Kaydet'e basın` : r.message);
      } else setError(r.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test hatası");
    } finally {
      setBusy(false);
    }
  }

  async function setDefault(a: MailAccount) {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      await apiFetch(`/api/mail/settings/accounts/${a.id}/default`, { method: "POST" });
      await load();
      if (form?.id === a.id) setForm((f) => (f ? { ...f, is_default: true, active: true } : f));
      setMsg(`${a.display_name} varsayılan gönderen hesap yapıldı`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "İşlem hatası");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(a: MailAccount) {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      await apiFetch(`/api/mail/settings/accounts/${a.id}`, {
        method: "PUT",
        body: JSON.stringify({ active: !a.active }),
      });
      await load();
      if (form?.id === a.id) setForm((f) => (f ? { ...f, active: !a.active } : f));
      setMsg(`${a.display_name} ${a.active ? "pasif yapıldı (senkron ve gönderim kapalı)" : "aktif edildi"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "İşlem hatası");
    } finally {
      setBusy(false);
    }
  }

  async function remove(a: MailAccount) {
    if (
      !confirm(
        `"${a.display_name}" hesabı silinsin mi?\n\nKayıtlı şifresi de silinir. Bu hesaba ait mailler kutuda kalır.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const r = await apiFetch<{ ok: boolean; message: string }>(`/api/mail/settings/accounts/${a.id}`, {
        method: "DELETE",
      });
      if (form?.id === a.id) cancelEdit();
      await load();
      setMsg(r.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silme hatası");
    } finally {
      setBusy(false);
    }
  }

  function applyPreset(kind: "gmail" | "outlook" | "yandex" | "cpanel") {
    if (!form) return;
    if (kind === "gmail") {
      setForm({
        ...form,
        smtp_host: "smtp.gmail.com",
        smtp_port: 587,
        smtp_use_tls: true,
        imap_host: "imap.gmail.com",
        imap_port: 993,
        imap_use_ssl: true,
        imap_folder: "INBOX",
      });
      setMsg("Gmail şablonu uygulandı — Uygulama şifresi kullanın (normal şifre genelde çalışmaz)");
    } else if (kind === "outlook") {
      setForm({
        ...form,
        smtp_host: "smtp.office365.com",
        smtp_port: 587,
        smtp_use_tls: true,
        imap_host: "outlook.office365.com",
        imap_port: 993,
        imap_use_ssl: true,
        imap_folder: "INBOX",
      });
      setMsg("Outlook şablonu uygulandı — kullanıcı/şifre ve gönderen adresini doldurun");
    } else if (kind === "yandex") {
      setForm({
        ...form,
        smtp_host: "smtp.yandex.com",
        smtp_port: 465,
        smtp_use_tls: false,
        imap_host: "imap.yandex.com",
        imap_port: 993,
        imap_use_ssl: true,
        imap_folder: "INBOX",
      });
      setMsg("Yandex şablonu uygulandı — kullanıcı/şifre ve gönderen adresini doldurun");
    } else {
      const domain = domainFromEmail(form.from_email) || domainFromEmail(form.smtp_user) || "";
      const host = domain ? `mail.${domain}` : "mail.ornek.com";
      setForm({
        ...form,
        smtp_host: host,
        smtp_port: 465,
        smtp_use_tls: false,
        imap_host: host,
        imap_port: 993,
        imap_use_ssl: true,
        imap_folder: "INBOX",
      });
      setMsg(
        "cPanel / Hosting şablonu uygulandı — sunucu mail.<alanadı>, SMTP 465 SSL, IMAP 993 SSL. Alan adı boşsa önce e-posta adresini yazıp şablona tekrar basın.",
      );
    }
  }

  const input =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-baykus-500";

  return (
    <div className="space-y-3 pb-2 max-w-5xl">
      <div className="bk-sticky-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/settings" className="text-xs text-baykus-primary hover:underline">
            ← Ayarlar
          </Link>
          <h1 className="text-lg font-bold mt-1 leading-tight">E-Posta Ayarları</h1>
          <p className="text-[11px] text-baykus-muted">
            Birden fazla e-posta hesabı · SMTP (gönder) + IMAP (al) · şifreler yerel dosyada saklanır
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={startNew}
            disabled={busy}
            className="rounded-lg bg-baykus-700 text-white px-3 py-2 text-sm disabled:opacity-50"
          >
            + Yeni Hesap
          </button>
          <Link href="/mail" className="rounded-lg bg-sky-700 text-white px-3 py-2 text-sm">
            E-Posta kutusuna git →
          </Link>
        </div>
      </div>

      <div className="rounded border border-sky-200 bg-sky-50 text-sky-950 px-3 py-2 text-sm space-y-1">
        <p className="font-semibold text-[13px]">Nasıl çalışır?</p>
        <ol className="list-decimal ml-4 text-xs space-y-0.5">
          <li>
            <strong>+ Yeni Hesap</strong> ile istediğiniz kadar hesap ekleyin; her hesabın kendi SMTP/IMAP ayarı vardır.
          </li>
          <li>
            <strong>Varsayılan</strong> hesap, Yeni E-Posta ve müşteri/cari/tedarikçi kartlarından gönderimde otomatik seçilir
            (gönderirken değiştirilebilir).
          </li>
          <li>Pasif hesaplar senkronize edilmez ve gönderimde kullanılamaz; mailleri kutuda kalır.</li>
          <li>Gelen kutusu, aktif ve IMAP&apos;i hazır tüm hesaplar için 30 dakikada bir otomatik güncellenir.</li>
          <li>Gmail için &quot;Uygulama şifresi&quot; kullanın; cPanel için genelde mail.alanadiniz.com, SMTP 465 / IMAP 993 SSL.</li>
        </ol>
        {storagePath && <p className="text-[11px] text-sky-800 mt-1">Yerel dosya: {storagePath}</p>}
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm whitespace-pre-wrap">{error}</div>}
      {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{msg}</div>}

      <section className="rounded border bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">Hesap</th>
              <th className="text-left px-3 py-2">Durum</th>
              <th className="text-left px-3 py-2">Son senkron</th>
              <th className="text-right px-3 py-2">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {accounts.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-slate-500">
                  Henüz e-posta hesabı yok. <strong>+ Yeni Hesap</strong> ile ekleyin.
                </td>
              </tr>
            )}
            {accounts.map((a) => (
              <tr key={a.id} className={form?.id === a.id ? "bg-sky-50" : a.active ? "" : "bg-slate-50 text-slate-500"}>
                <td className="px-3 py-2 align-top">
                  <div className="font-medium flex flex-wrap items-center gap-1.5">
                    {a.label || a.display_name}
                    {a.is_default && (
                      <span className="rounded bg-baykus-700 text-white px-1.5 py-0.5 text-[10px]">Varsayılan</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">{a.effective_from || a.smtp_user || "—"}</div>
                </td>
                <td className="px-3 py-2 align-top space-x-1 whitespace-nowrap">
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-[11px] ${
                      a.active ? "bg-sky-100 text-sky-800" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {a.active ? "Aktif" : "Pasif"}
                  </span>
                  <Badge ok={a.smtp_configured} label="SMTP" />
                  <Badge ok={a.imap_configured} label="IMAP" />
                </td>
                <td className="px-3 py-2 align-top text-xs">
                  <div>{utcLabel(a.last_sync_at)}</div>
                  {a.last_ok === false && a.last_message ? (
                    <div className="text-amber-700 max-w-[260px] truncate" title={a.last_message}>
                      {a.last_message}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="flex flex-wrap justify-end gap-1">
                    <button type="button" className="rounded border px-2 py-1 text-xs hover:bg-slate-50" onClick={() => startEdit(a)}>
                      Düzenle
                    </button>
                    {!a.is_default && (
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded border px-2 py-1 text-xs hover:bg-slate-50"
                        onClick={() => void setDefault(a)}
                      >
                        Varsayılan yap
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded border px-2 py-1 text-xs hover:bg-slate-50"
                      onClick={() => void toggleActive(a)}
                    >
                      {a.active ? "Pasif yap" : "Aktif et"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded border border-red-300 text-red-700 px-2 py-1 text-xs hover:bg-red-50"
                      onClick={() => void remove(a)}
                    >
                      Sil
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {editing && form && (
        <form onSubmit={(e) => void save(e)} className="space-y-4 rounded border-2 border-sky-200 bg-slate-50/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-sm">
              {form.id == null ? "Yeni e-posta hesabı" : `Hesabı düzenle: ${editingAccount?.display_name || form.label}`}
            </h2>
            <div className="flex flex-wrap gap-2 items-center">
              {editingAccount && (
                <>
                  <Badge ok={editingAccount.smtp_configured} label="SMTP" />
                  <Badge ok={editingAccount.imap_configured} label="IMAP" />
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded border bg-white px-3 py-1.5 text-xs" onClick={() => applyPreset("gmail")}>
              Gmail şablonu
            </button>
            <button type="button" className="rounded border bg-white px-3 py-1.5 text-xs" onClick={() => applyPreset("outlook")}>
              Outlook şablonu
            </button>
            <button type="button" className="rounded border bg-white px-3 py-1.5 text-xs" onClick={() => applyPreset("yandex")}>
              Yandex şablonu
            </button>
            <button type="button" className="rounded border bg-white px-3 py-1.5 text-xs" onClick={() => applyPreset("cpanel")}>
              cPanel / Hosting
            </button>
          </div>

          <section className="rounded border bg-white p-4 space-y-3">
            <h3 className="font-semibold text-sm">Genel</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="text-xs text-slate-600">Hesap adı (örn. Satış, Muhasebe)</span>
                <input
                  className={input}
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="Boşsa e-posta adresi kullanılır"
                />
              </label>
              <div className="flex flex-col justify-end gap-1 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                  Aktif (senkron + gönderim)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.is_default}
                    disabled={editingAccount?.is_default}
                    onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                  />
                  Varsayılan gönderen hesap
                </label>
              </div>
            </div>
          </section>

          <section className="rounded border bg-white p-4 space-y-3">
            <h3 className="font-semibold text-sm">SMTP — Gönderim</h3>
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
                <input
                  className={input}
                  value={form.smtp_user}
                  onChange={(e) => setForm({ ...form, smtp_user: e.target.value })}
                  autoComplete="off"
                />
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
            <h3 className="font-semibold text-sm">IMAP — Alma</h3>
            <p className="text-xs text-slate-500">Kullanıcı/şifre boş bırakılırsa SMTP bilgileri kullanılır.</p>
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
                <input
                  className={input}
                  value={form.imap_user}
                  onChange={(e) => setForm({ ...form, imap_user: e.target.value })}
                  autoComplete="off"
                />
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
              {form.id == null ? "Hesabı Ekle" : "Kaydet"}
            </button>
            <button type="button" className="rounded-lg border bg-white px-4 py-2 text-sm" onClick={cancelEdit}>
              Kapat
            </button>
          </div>
        </form>
      )}

      <StatusFooter onRefresh={load} />
    </div>
  );
}
