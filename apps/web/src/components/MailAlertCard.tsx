"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatTrDateTime } from "@/lib/dates";

export type MailUnreadPreview = {
  id: number;
  account_id?: number | null;
  account_name?: string | null;
  from_addr: string;
  subject: string;
  date_sent?: string | null;
};

export type MailUnreadAccountCount = {
  account_id?: number | null;
  account_name: string;
  unread: number;
};

export type MailUnreadSummary = {
  configured: boolean;
  total_unread: number;
  account_count: number;
  accounts: MailUnreadAccountCount[];
  latest: MailUnreadPreview[];
};

const POLL_MS = 5 * 60 * 1000;
export const MAIL_UNREAD_EVENT = "baykus-mail-unread";

/** API naive UTC datetime → yerel GG.AA.YYYY SS:DD */
function utcLabel(iso: string | null | undefined, empty = "—"): string {
  if (!iso) return empty;
  const s = String(iso);
  return formatTrDateTime(/[Zz]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`, empty);
}

function shortFrom(addr: string): string {
  const raw = (addr || "").trim();
  if (!raw) return "Bilinmeyen";
  const m = raw.match(/^"?([^"<]+)"?\s*<([^>]+)>/);
  if (m) return (m[1] || m[2]).trim();
  return raw.length > 36 ? `${raw.slice(0, 34)}…` : raw;
}

export function useMailUnreadSummary(enabled = true) {
  const [data, setData] = useState<MailUnreadSummary | null>(null);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const s = await apiFetch<MailUnreadSummary>("/api/mail/unread-summary");
      setData(s);
      setDenied(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/izin vermiyor|Yetkisiz|403/i.test(msg)) {
        setDenied(true);
        setData(null);
        return;
      }
      // ağ / geçici hata — kartı gizleme, eski veriyi tut
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const t = window.setInterval(() => void load(), POLL_MS);
    function onVis() {
      if (document.visibilityState === "visible") void load();
    }
    function onRefresh() {
      void load();
    }
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener(MAIL_UNREAD_EVENT, onRefresh);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener(MAIL_UNREAD_EVENT, onRefresh);
    };
  }, [enabled, load]);

  return { data, denied, reload: load };
}

export function notifyMailUnreadChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(MAIL_UNREAD_EVENT));
  }
}

/** Ana sayfa — dikkat çekici e-posta uyarısı */
export default function MailAlertCard() {
  const { data, denied } = useMailUnreadSummary(true);

  if (denied || data == null) return null;

  if (!data.configured) {
    return (
      <div className="bk-mail-alert bk-mail-alert--idle">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="bk-mail-alert-icon" aria-hidden>
              ✉
            </span>
            <div>
              <div className="text-sm font-extrabold tracking-wide">E-POSTA</div>
              <div className="text-xs opacity-90 mt-0.5">
                E-posta hesabı ayarlanmamış — SMTP/IMAP ekleyin.
              </div>
            </div>
          </div>
          <Link
            href="/settings/mail"
            className="shrink-0 rounded-md bg-white/20 hover:bg-white/30 px-3 py-2 text-xs font-bold"
          >
            E-posta ayarlanmamış → Ayarlar
          </Link>
        </div>
      </div>
    );
  }

  const unread = data.total_unread;
  const hasUnread = unread > 0;
  const multi = data.account_count > 1;
  const withUnread = (data.accounts || []).filter((a) => a.unread > 0);

  return (
    <div className={`bk-mail-alert ${hasUnread ? "bk-mail-alert--hot" : "bk-mail-alert--calm"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <span className={`bk-mail-alert-icon ${hasUnread ? "bk-mail-alert-pulse" : ""}`} aria-hidden>
            ✉
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-extrabold tracking-wide">
                {hasUnread ? "YENİ E-POSTA" : "E-POSTA"}
              </div>
              {hasUnread && (
                <span className="bk-mail-badge bk-mail-badge--pulse">{unread} okunmamış</span>
              )}
            </div>
            {!hasUnread ? (
              <div className="text-xs opacity-90 mt-0.5">Yeni e-posta yok</div>
            ) : (
              <>
                {multi && withUnread.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {withUnread.map((a) => (
                      <Link
                        key={String(a.account_id ?? a.account_name)}
                        href={
                          a.account_id != null
                            ? `/mail?account_id=${a.account_id}`
                            : "/mail"
                        }
                        className="rounded bg-white/15 hover:bg-white/25 px-2 py-0.5 text-[11px] font-semibold"
                        title={`${a.account_name} gelen kutusu`}
                      >
                        {a.account_name}: {a.unread}
                      </Link>
                    ))}
                  </div>
                )}
                <ul className="mt-2 space-y-1">
                  {data.latest.map((m) => (
                    <li key={m.id} className="text-xs leading-snug">
                      <Link
                        href={
                          m.account_id != null
                            ? `/mail?account_id=${m.account_id}&msg=${m.id}`
                            : `/mail?msg=${m.id}`
                        }
                        className="hover:underline"
                      >
                        <span className="font-bold">{shortFrom(m.from_addr)}</span>
                        <span className="opacity-80"> — {m.subject || "(konu yok)"}</span>
                        <span className="opacity-70 ml-1 tabular-nums">
                          · {utcLabel(m.date_sent)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {hasUnread && (
            <div className="text-3xl font-black tabular-nums leading-none">{unread}</div>
          )}
          <Link
            href="/mail"
            className="rounded-md bg-white text-sky-800 hover:bg-sky-50 px-3.5 py-2 text-xs font-extrabold shadow-sm"
          >
            Gelen Kutusuna Git
          </Link>
        </div>
      </div>
    </div>
  );
}
