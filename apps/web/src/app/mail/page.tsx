"use client";

import Link from "next/link";
import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Customer, apiFetch, downloadAuthFile, downloadPdf } from "@/lib/api";
import { formatTrDateTime } from "@/lib/dates";
import { printPdfFromApi } from "@/lib/printPdf";
import StatusFooter from "@/components/StatusFooter";
import { notifyMailUnreadChanged } from "@/components/MailAlertCard";

type MailAttachment = {
  filename: string;
  content_type: string;
  size: number;
  stored_name: string;
};

type MailMsg = {
  id: number;
  account_id?: number | null;
  account_name?: string | null;
  folder: string;
  direction: string;
  from_addr: string;
  to_addrs: string;
  cc_addrs?: string | null;
  subject: string;
  body_text: string;
  body_html?: string | null;
  date_sent?: string | null;
  is_read: boolean;
  customer_id?: number | null;
  customer_name?: string | null;
  error?: string | null;
  attachments?: MailAttachment[];
};

type MailAccount = {
  id: number;
  label: string;
  display_name: string;
  is_default: boolean;
  active: boolean;
  from_email?: string;
  effective_from?: string;
  smtp_configured: boolean;
  imap_configured: boolean;
  last_sync_at?: string | null;
  last_ok?: boolean | null;
  last_message?: string;
};

type AccountsResp = {
  accounts: MailAccount[];
  default_account_id: number | null;
};

type AccountFilter = "all" | number;

const ACCOUNT_FILTER_KEY = "baykus.mail.accountFilter";

/** API naive UTC datetime → yerel GG.AA.YYYY SS:DD */
function utcLabel(iso: string | null | undefined, empty = "—"): string {
  if (!iso) return empty;
  const s = String(iso);
  return formatTrDateTime(/[Zz]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`, empty);
}

type SyncStatus = {
  last_sync_at?: string | null;
  last_ok?: boolean | null;
  last_message?: string;
  imported?: number;
  imap_configured?: boolean;
  autosync_interval_minutes?: number;
};

type Tab = "inbox" | "sent" | "compose";

const LIST_POLL_MS = 5 * 60 * 1000; // 5 dk — yerel liste yenileme

function formatBytes(n: number): string {
  if (!n || n < 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function MailPageInner() {
  const sp = useSearchParams();
  const initialCompose = sp.get("compose") === "1" || sp.get("tab") === "compose";
  const customerIdParam = sp.get("customer_id");
  const toParam = sp.get("to") || "";
  const accountParam = sp.get("account_id");

  const [tab, setTab] = useState<Tab>(initialCompose ? "compose" : "inbox");
  const [messages, setMessages] = useState<MailMsg[]>([]);
  const [selected, setSelected] = useState<MailMsg | null>(null);
  const [accounts, setAccounts] = useState<MailAccount[] | null>(null);
  const [defaultAccountId, setDefaultAccountId] = useState<number | null>(null);
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("all");
  const [filterRestored, setFilterRestored] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [compose, setCompose] = useState({
    to: toParam,
    cc: "",
    subject: "",
    body: "",
    customer_id: customerIdParam ? Number(customerIdParam) : ("" as number | ""),
    account_id: (accountParam ? Number(accountParam) : "") as number | "",
  });

  const loadAccounts = useCallback(async () => {
    try {
      const r = await apiFetch<AccountsResp>("/api/mail/accounts");
      setAccounts(r.accounts);
      setDefaultAccountId(r.default_account_id);
      // Seçili hesap silindiyse Tümü'ne dön
      setAccountFilter((cur) => (cur !== "all" && !r.accounts.some((a) => a.id === cur) ? "all" : cur));
      // Gönderen hesap: boşsa / geçersizse varsayılanı seç
      setCompose((c) => {
        const valid = c.account_id !== "" && r.accounts.some((a) => a.id === c.account_id && a.active);
        return valid ? c : { ...c, account_id: r.default_account_id ?? "" };
      });
    } catch {
      /* ignore */
    }
  }, []);

  const loadSyncStatus = useCallback(async () => {
    try {
      const qs = accountFilter === "all" ? "" : `?account_id=${accountFilter}`;
      const s = await apiFetch<SyncStatus>(`/api/mail/sync-status${qs}`);
      setSyncStatus(s);
    } catch {
      /* ignore */
    }
  }, [accountFilter]);

  // URL account_id varsa onu kullan; yoksa son seçilen hesabı hatırla
  useEffect(() => {
    try {
      if (accountParam && Number.isFinite(Number(accountParam))) {
        setAccountFilter(Number(accountParam));
      } else {
        const raw = window.localStorage.getItem(ACCOUNT_FILTER_KEY);
        const n = raw && raw !== "all" ? Number(raw) : NaN;
        if (Number.isFinite(n)) setAccountFilter(n);
      }
    } catch {
      /* ignore */
    }
    setFilterRestored(true);
  }, [accountParam]);

  useEffect(() => {
    if (!filterRestored) return;
    try {
      window.localStorage.setItem(ACCOUNT_FILTER_KEY, String(accountFilter));
    } catch {
      /* ignore */
    }
  }, [accountFilter, filterRestored]);

  const loadMessages = useCallback(
    async (folder: "inbox" | "sent") => {
      setError("");
      try {
        const params = new URLSearchParams({ folder, limit: "100" });
        if (q.trim()) params.set("q", q.trim());
        if (customerIdParam) params.set("customer_id", customerIdParam);
        if (accountFilter !== "all") params.set("account_id", String(accountFilter));
        const rows = await apiFetch<MailMsg[]>(`/api/mail/messages?${params}`);
        setMessages(rows);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Liste yüklenemedi");
      }
    },
    [q, customerIdParam, accountFilter],
  );

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    if (!filterRestored) return;
    void loadSyncStatus();
  }, [loadSyncStatus, filterRestored]);

  useEffect(() => {
    if (!filterRestored) return;
    if (tab === "inbox" || tab === "sent") {
      void loadMessages(tab);
      setSelected(null);
    }
  }, [tab, loadMessages, filterRestored]);

  // Yerel listeyi 5 dakikada bir yenile + senkron durumunu oku
  useEffect(() => {
    if (tab !== "inbox" && tab !== "sent") return;
    const id = window.setInterval(() => {
      void loadMessages(tab);
      void loadSyncStatus();
    }, LIST_POLL_MS);
    return () => window.clearInterval(id);
  }, [tab, loadMessages, loadSyncStatus]);

  // Prefill from customer
  useEffect(() => {
    if (!customerIdParam) return;
    const id = Number(customerIdParam);
    if (!Number.isFinite(id)) return;
    void (async () => {
      try {
        const c = await apiFetch<Customer>(`/api/customers/${id}`);
        setCompose((prev) => ({
          ...prev,
          customer_id: id,
          to: prev.to || c.email || "",
          subject: prev.subject || `${c.company || c.name} — Baykuş Baskı`,
        }));
      } catch {
        /* ignore */
      }
    })();
  }, [customerIdParam]);

  const unread = useMemo(
    () => messages.filter((m) => !m.is_read && m.folder === "inbox").length,
    [messages],
  );

  const sonSenkronLabel = useMemo(() => {
    if (!syncStatus?.last_sync_at) return "Henüz senkron yok";
    return utcLabel(syncStatus.last_sync_at);
  }, [syncStatus]);

  const activeAccounts = useMemo(() => (accounts || []).filter((a) => a.active), [accounts]);
  const selectedAccount = useMemo(
    () => (accountFilter === "all" ? null : (accounts || []).find((a) => a.id === accountFilter) || null),
    [accounts, accountFilter],
  );
  const syncableCount = useMemo(() => {
    const list = selectedAccount ? [selectedAccount] : accounts || [];
    return list.filter((a) => a.active && a.imap_configured).length;
  }, [accounts, selectedAccount]);
  const composeAccount = useMemo(
    () => (accounts || []).find((a) => a.id === compose.account_id) || null,
    [accounts, compose.account_id],
  );
  const multiAccount = (accounts || []).length > 1;

  const accountWarning = useMemo(() => {
    if (accounts === null) return "";
    if (accounts.length === 0) return "Henüz e-posta hesabı eklenmedi. ";
    if (selectedAccount) {
      if (!selectedAccount.active) return `${selectedAccount.display_name} pasif — senkron ve gönderim kapalı. `;
      if (!selectedAccount.smtp_configured && !selectedAccount.imap_configured)
        return `${selectedAccount.display_name}: SMTP / IMAP henüz yapılandırılmadı. `;
      if (!selectedAccount.smtp_configured) return `${selectedAccount.display_name}: SMTP (gönderim) ayarları eksik. `;
      if (!selectedAccount.imap_configured) return `${selectedAccount.display_name}: IMAP (alma) ayarları eksik. `;
      return "";
    }
    if (activeAccounts.length === 0) return "Aktif e-posta hesabı yok. ";
    if (!activeAccounts.some((a) => a.imap_configured)) return "Hiçbir aktif hesapta IMAP (alma) ayarı hazır değil. ";
    if (!activeAccounts.some((a) => a.smtp_configured)) return "Hiçbir aktif hesapta SMTP (gönderim) ayarı hazır değil. ";
    return "";
  }, [accounts, selectedAccount, activeAccounts]);


  // Dashboard / derin link: ?msg=id ile mesajı aç
  useEffect(() => {
    const msgId = sp.get("msg");
    if (!msgId || !messages.length) return;
    const id = Number(msgId);
    if (!Number.isFinite(id)) return;
    const row = messages.find((m) => m.id === id);
    if (row && (!selected || selected.id !== id)) {
      void openMessage(row);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, sp]);

  async function openMessage(m: MailMsg) {
    setError("");
    try {
      const wasUnread = !m.is_read;
      const full = await apiFetch<MailMsg>(`/api/mail/messages/${m.id}`);
      setSelected(full);
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, is_read: true } : x)));
      if (wasUnread) notifyMailUnreadChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mesaj açılamadı");
    }
  }

  async function syncInbox() {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const qs = accountFilter === "all" ? "" : `&account_id=${accountFilter}`;
      const r = await apiFetch<{ ok: boolean; message: string }>(`/api/mail/sync?limit=40${qs}`, {
        method: "POST",
      });
      if (r.ok) setMsg(r.message);
      else setError(r.message);
      await loadSyncStatus();
      void loadAccounts();
      if (tab === "inbox") await loadMessages("inbox");
      else setTab("inbox");
      notifyMailUnreadChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Senkron hatası");
    } finally {
      setBusy(false);
    }
  }

  async function sendMail(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMsg("");
    try {
      await apiFetch("/api/mail/send", {
        method: "POST",
        body: JSON.stringify({
          to: compose.to,
          cc: compose.cc || null,
          subject: compose.subject,
          body: compose.body,
          customer_id: compose.customer_id === "" ? null : Number(compose.customer_id),
          account_id: compose.account_id === "" ? null : Number(compose.account_id),
        }),
      });
      setMsg(
        `E-posta gönderildi${composeAccount ? ` (${composeAccount.display_name})` : ""} ve Gönderilenler'e kaydedildi`,
      );
      setCompose((c) => ({ ...c, subject: "", body: "" }));
      setTab("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gönderilemedi");
    } finally {
      setBusy(false);
    }
  }

  function replyTo() {
    if (!selected) return;
    const msgAccount = (accounts || []).find((a) => a.id === selected.account_id && a.active);
    setCompose({
      to: selected.direction === "in" ? selected.from_addr : selected.to_addrs,
      cc: "",
      subject: selected.subject.startsWith("Re:") ? selected.subject : `Re: ${selected.subject}`,
      body: `\n\n---\n${selected.from_addr} yazmıştı:\n${selected.body_text}`,
      customer_id: selected.customer_id || "",
      // Yanıt, mailin geldiği hesaptan gider (aktifse); değilse varsayılan
      account_id: msgAccount ? msgAccount.id : (defaultAccountId ?? ""),
    });
    setTab("compose");
  }

  async function printSelected() {
    if (!selected) return;
    setError("");
    try {
      await printPdfFromApi(`/api/mail/messages/${selected.id}/pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yazdırma hatası");
    }
  }

  async function downloadSelectedPdf() {
    if (!selected) return;
    setError("");
    try {
      const safe = (selected.subject || `mail-${selected.id}`)
        .replace(/[\\/:*?"<>|]+/g, "_")
        .slice(0, 80);
      await downloadPdf(`/api/mail/messages/${selected.id}/pdf`, `${safe || "mail"}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF indirilemedi");
    }
  }

  async function downloadSelectedEml() {
    if (!selected) return;
    setError("");
    try {
      const safe = (selected.subject || `mail-${selected.id}`)
        .replace(/[\\/:*?"<>|]+/g, "_")
        .slice(0, 80);
      await downloadAuthFile(`/api/mail/messages/${selected.id}/eml`, `${safe || "mail"}.eml`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "EML indirilemedi");
    }
  }

  const input =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-baykus-500";

  return (
    <div className="space-y-2 pb-2">
      <div className="bk-sticky-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-baykus-text leading-tight">E-Posta</h1>
          <p className="text-[11px] text-baykus-muted">
            SMTP ile gönder · IMAP ile gelen kutusu · tüm aktif hesaplar 30 dk&apos;da bir otomatik senkron
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Son senkron: <span className="font-medium text-slate-700">{sonSenkronLabel}</span>
            {syncStatus?.last_ok === false && syncStatus.last_message ? (
              <span className="text-amber-700"> · {syncStatus.last_message}</span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/settings/mail"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            E-Posta Ayarları
          </Link>
          <button
            type="button"
            disabled={busy || syncableCount === 0}
            onClick={() => void syncInbox()}
            title={
              selectedAccount
                ? `${selectedAccount.display_name} senkronize edilir`
                : "Aktif ve IMAP'i hazır tüm hesaplar senkronize edilir"
            }
            className="rounded-lg bg-sky-700 text-white px-3 py-2 text-sm disabled:opacity-50"
          >
            {busy ? "Senkronize ediliyor…" : selectedAccount || !multiAccount ? "Gelenleri Senkronize Et" : "Tüm Hesapları Senkronize Et"}
          </button>
        </div>
      </div>

      {accountWarning && (
        <div className="rounded border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2 text-sm">
          {accountWarning}
          <Link href="/settings/mail" className="font-semibold underline">
            Ayarları aç →
          </Link>
        </div>
      )}

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{msg}</div>}

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        {(
          [
            { id: "inbox" as const, label: `Gelen Kutusu${unread ? ` (${unread})` : ""}` },
            { id: "sent" as const, label: "Gönderilenler" },
            { id: "compose" as const, label: "Yeni E-Posta" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === t.id ? "bg-baykus-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
        {tab !== "compose" && accounts && accounts.length > 0 && (
          <label className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-xs text-slate-600">Hesap</span>
            <select
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              value={accountFilter === "all" ? "all" : String(accountFilter)}
              onChange={(e) => {
                const v = e.target.value;
                setAccountFilter(v === "all" ? "all" : Number(v));
                setSelected(null);
              }}
            >
              <option value="all">Tümü</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.display_name}
                  {a.is_default ? " · varsayılan" : ""}
                  {a.active ? "" : " · pasif"}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {(tab === "inbox" || tab === "sent") && (
        <div className="grid lg:grid-cols-[340px_1fr] gap-3 min-h-[420px]">
          <div className="rounded border bg-white overflow-hidden flex flex-col">
            <div className="p-2 border-b flex gap-2">
              <input
                className={input}
                placeholder="Ara (konu, adres…)"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void loadMessages(tab);
                }}
              />
              <button
                type="button"
                className="rounded-lg border px-3 text-sm shrink-0"
                onClick={() => void loadMessages(tab)}
              >
                Ara
              </button>
            </div>
            <div className="overflow-y-auto flex-1 max-h-[520px] divide-y">
              {messages.length === 0 && (
                <div className="p-4 text-sm text-slate-500">
                  {tab === "inbox"
                    ? "Gelen kutusu boş. Senkronize Et ile IMAP'ten çekin."
                    : "Gönderilen yok."}
                </div>
              )}
              {messages.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => void openMessage(m)}
                  className={`w-full text-left px-3 py-2 hover:bg-slate-50 ${
                    selected?.id === m.id ? "bg-sky-50" : ""
                  } ${!m.is_read && tab === "inbox" ? "font-semibold" : ""}`}
                >
                  <div className="text-xs text-slate-500 truncate">
                    {tab === "inbox" ? m.from_addr : m.to_addrs}
                  </div>
                  <div className="text-sm text-slate-900 truncate">{m.subject || "(konu yok)"}</div>
                  <div className="text-[11px] text-slate-400 flex justify-between gap-2">
                    <span className="truncate">
                      {accountFilter === "all" && multiAccount && m.account_name ? (
                        <span className="mr-1 rounded bg-slate-100 px-1 text-slate-600">{m.account_name}</span>
                      ) : null}
                      {m.customer_name || ""}
                    </span>
                    <span className="shrink-0">{m.date_sent ? utcLabel(m.date_sent, "") : ""}</span>
                  </div>
                  {m.error && <div className="text-[11px] text-red-600 truncate">{m.error}</div>}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded border bg-white p-4 min-h-[320px]">
            {!selected ? (
              <p className="text-sm text-slate-500">Okumak için soldan bir mesaj seçin.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">{selected.subject}</h2>
                    <div className="text-xs text-slate-600 mt-1 space-y-0.5">
                      <div>
                        <span className="text-slate-400">Kimden:</span> {selected.from_addr}
                      </div>
                      <div>
                        <span className="text-slate-400">Kime:</span> {selected.to_addrs}
                      </div>
                      {selected.cc_addrs && (
                        <div>
                          <span className="text-slate-400">Cc:</span> {selected.cc_addrs}
                        </div>
                      )}
                      <div>
                        <span className="text-slate-400">Tarih:</span>{" "}
                        {utcLabel(selected.date_sent)}
                      </div>
                      {selected.account_name && (
                        <div>
                          <span className="text-slate-400">Hesap:</span> {selected.account_name}
                        </div>
                      )}
                      {selected.customer_name && (
                        <div>
                          <span className="text-slate-400">Cari:</span>{" "}
                          {selected.customer_id ? (
                            <Link
                              href={`/customers/${selected.customer_id}`}
                              className="text-baykus-700 hover:underline"
                            >
                              {selected.customer_name}
                            </Link>
                          ) : (
                            selected.customer_name
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void printSelected()}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                    >
                      Yazdır
                    </button>
                    <button
                      type="button"
                      onClick={() => void downloadSelectedPdf()}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                    >
                      PDF İndir
                    </button>
                    <button
                      type="button"
                      onClick={() => void downloadSelectedEml()}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                    >
                      EML İndir
                    </button>
                    <button
                      type="button"
                      onClick={replyTo}
                      className="rounded-lg bg-baykus-700 text-white px-3 py-1.5 text-sm"
                    >
                      Yanıtla
                    </button>
                  </div>
                </div>

                {selected.attachments && selected.attachments.length > 0 && (
                  <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-xs font-semibold text-slate-600 mb-1">Ekler</div>
                    <ul className="space-y-1">
                      {selected.attachments.map((a) => (
                        <li key={a.stored_name} className="text-sm">
                          <button
                            type="button"
                            className="text-baykus-700 hover:underline"
                            onClick={() =>
                              void downloadAuthFile(
                                `/api/mail/messages/${selected.id}/attachments/${encodeURIComponent(a.stored_name)}`,
                                a.filename || a.stored_name,
                              )
                            }
                          >
                            {a.filename || a.stored_name}
                          </button>
                          {a.size ? (
                            <span className="text-[11px] text-slate-400 ml-2">
                              {formatBytes(a.size)}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <pre className="whitespace-pre-wrap text-sm text-slate-800 font-sans border-t pt-3">
                  {selected.body_text || "(içerik yok)"}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "compose" && (
        <form onSubmit={sendMail} className="rounded border bg-white p-4 space-y-3 max-w-3xl">
          <label className="block text-sm">
            <span className="text-slate-600 text-xs">Gönderen hesap *</span>
            <select
              className={input}
              required
              value={compose.account_id === "" ? "" : String(compose.account_id)}
              onChange={(e) =>
                setCompose({ ...compose, account_id: e.target.value === "" ? "" : Number(e.target.value) })
              }
            >
              {activeAccounts.length === 0 && <option value="">Aktif hesap yok — ayarlardan ekleyin</option>}
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id} disabled={!a.smtp_configured}>
                  {a.display_name}
                  {a.is_default ? " · varsayılan" : ""}
                  {a.smtp_configured ? "" : " · SMTP eksik"}
                </option>
              ))}
            </select>
            {composeAccount?.effective_from && (
              <span className="text-[11px] text-slate-500">Kimden: {composeAccount.effective_from}</span>
            )}
          </label>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-slate-600 text-xs">Kime *</span>
              <input
                className={input}
                required
                value={compose.to}
                onChange={(e) => setCompose({ ...compose, to: e.target.value })}
                placeholder="musteri@ornek.com"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 text-xs">Cc</span>
              <input
                className={input}
                value={compose.cc}
                onChange={(e) => setCompose({ ...compose, cc: e.target.value })}
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-slate-600 text-xs">Konu</span>
            <input
              className={input}
              value={compose.subject}
              onChange={(e) => setCompose({ ...compose, subject: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600 text-xs">Mesaj</span>
            <textarea
              className={input}
              rows={12}
              value={compose.body}
              onChange={(e) => setCompose({ ...compose, body: e.target.value })}
              required
            />
          </label>
          {compose.customer_id !== "" && (
            <p className="text-xs text-slate-500">
              Bu gönderim müşteri/cari #{compose.customer_id} ile ilişkilendirilecek.{" "}
              <Link href={`/customers/${compose.customer_id}`} className="underline">
                Cari kartı
              </Link>
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || !composeAccount || !composeAccount.active || !composeAccount.smtp_configured}
              className="rounded-lg bg-emerald-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {busy ? "Gönderiliyor…" : "Gönder"}
            </button>
            <Link href="/settings/mail" className="rounded-lg border px-4 py-2 text-sm">
              E-posta hesapları
            </Link>
          </div>
        </form>
      )}

      <StatusFooter
        onRefresh={() => {
          void loadAccounts();
          void loadSyncStatus();
          if (tab === "inbox" || tab === "sent") void loadMessages(tab);
        }}
      />
    </div>
  );
}

export default function MailPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-slate-500">E-posta yükleniyor…</div>}>
      <MailPageInner />
    </Suspense>
  );
}
