"use client";

import Link from "next/link";
import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Customer, apiFetch } from "@/lib/api";
import { formatTrDateTime } from "@/lib/dates";
import StatusFooter from "@/components/StatusFooter";

type MailMsg = {
  id: number;
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
};

type MailSettings = {
  smtp_configured: boolean;
  imap_configured: boolean;
  from_email?: string;
};

type Tab = "inbox" | "sent" | "compose";

function MailPageInner() {
  const sp = useSearchParams();
  const initialCompose = sp.get("compose") === "1" || sp.get("tab") === "compose";
  const customerIdParam = sp.get("customer_id");
  const toParam = sp.get("to") || "";

  const [tab, setTab] = useState<Tab>(initialCompose ? "compose" : "inbox");
  const [messages, setMessages] = useState<MailMsg[]>([]);
  const [selected, setSelected] = useState<MailMsg | null>(null);
  const [settings, setSettings] = useState<MailSettings | null>(null);
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
  });

  const loadSettings = useCallback(async () => {
    try {
      const s = await apiFetch<MailSettings>("/api/mail/settings");
      setSettings(s);
    } catch {
      /* ignore for non-admin */
    }
  }, []);

  const loadMessages = useCallback(async (folder: "inbox" | "sent") => {
    setError("");
    try {
      const params = new URLSearchParams({ folder, limit: "100" });
      if (q.trim()) params.set("q", q.trim());
      if (customerIdParam) params.set("customer_id", customerIdParam);
      const rows = await apiFetch<MailMsg[]>(`/api/mail/messages?${params}`);
      setMessages(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Liste yüklenemedi");
    }
  }, [q, customerIdParam]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (tab === "inbox" || tab === "sent") {
      void loadMessages(tab);
      setSelected(null);
    }
  }, [tab, loadMessages]);

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

  const unread = useMemo(() => messages.filter((m) => !m.is_read && m.folder === "inbox").length, [messages]);

  async function openMessage(m: MailMsg) {
    setError("");
    try {
      const full = await apiFetch<MailMsg>(`/api/mail/messages/${m.id}`);
      setSelected(full);
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, is_read: true } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mesaj açılamadı");
    }
  }

  async function syncInbox() {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const r = await apiFetch<{ ok: boolean; message: string }>("/api/mail/sync?limit=40", {
        method: "POST",
      });
      setMsg(r.message);
      if (tab === "inbox") await loadMessages("inbox");
      else setTab("inbox");
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
        }),
      });
      setMsg("E-posta gönderildi ve Gönderilenler'e kaydedildi");
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
    setCompose({
      to: selected.direction === "in" ? selected.from_addr : selected.to_addrs,
      cc: "",
      subject: selected.subject.startsWith("Re:") ? selected.subject : `Re: ${selected.subject}`,
      body: `\n\n---\n${selected.from_addr} yazmıştı:\n${selected.body_text}`,
      customer_id: selected.customer_id || "",
    });
    setTab("compose");
  }

  const input =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-baykus-500";

  return (
    <div className="space-y-2 pb-2">
      <div className="bk-sticky-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-baykus-text leading-tight">E-Posta</h1>
          <p className="text-[11px] text-baykus-muted">
            SMTP ile gönder · IMAP ile gelen kutusu · müşteri carisine bağlanır
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/settings/mail" className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
            E-Posta Ayarları
          </Link>
          <button
            type="button"
            disabled={busy || !settings?.imap_configured}
            onClick={() => void syncInbox()}
            className="rounded-lg bg-sky-700 text-white px-3 py-2 text-sm disabled:opacity-50"
          >
            Gelenleri Senkronize Et
          </button>
        </div>
      </div>

      {settings && (!settings.smtp_configured || !settings.imap_configured) && (
        <div className="rounded border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2 text-sm">
          {!settings.smtp_configured && !settings.imap_configured
            ? "SMTP / IMAP henüz yapılandırılmadı. "
            : !settings.smtp_configured
              ? "SMTP (gönderim) ayarları eksik. "
              : "IMAP (alma) ayarları eksik. "}
          <Link href="/settings/mail" className="font-semibold underline">
            Ayarları aç →
          </Link>
        </div>
      )}

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{msg}</div>}

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
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
                    <span className="truncate">{m.customer_name || ""}</span>
                    <span className="shrink-0">{m.date_sent ? formatTrDateTime(m.date_sent) : ""}</span>
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
                        {selected.date_sent ? formatTrDateTime(selected.date_sent) : "—"}
                      </div>
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
                  <button
                    type="button"
                    onClick={replyTo}
                    className="rounded-lg bg-baykus-700 text-white px-3 py-1.5 text-sm"
                  >
                    Yanıtla
                  </button>
                </div>
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
              disabled={busy || settings?.smtp_configured === false}
              className="rounded-lg bg-emerald-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {busy ? "Gönderiliyor…" : "Gönder"}
            </button>
            <Link href="/settings/mail" className="rounded-lg border px-4 py-2 text-sm">
              SMTP ayarları
            </Link>
          </div>
        </form>
      )}

      <StatusFooter
        onRefresh={() => {
          void loadSettings();
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
