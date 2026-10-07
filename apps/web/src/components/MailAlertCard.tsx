"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

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

function shortFrom(addr: string): string {
  const raw = (addr || "").trim();
  if (!raw) return "Bilinmeyen";
  const m = raw.match(/^"?([^"<]+)"?\s*<([^>]+)>/);
  if (m) return (m[1] || m[2]).trim();
  return raw.length > 28 ? `${raw.slice(0, 26)}…` : raw;
}

function previewLine(latest: MailUnreadPreview[] | undefined): string {
  const m = latest?.[0];
  if (!m) return "Yeni e-posta yok";
  const from = shortFrom(m.from_addr);
  const subj = (m.subject || "(konu yok)").trim();
  const line = `${from} — ${subj}`;
  return line.length > 42 ? `${line.slice(0, 40)}…` : line;
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
      // ağ / geçici hata — eski veriyi tut
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

/** Ana sayfa KPI şeridi — kompakt e-posta kartı (Stok Değeri yerine, en sağ) */
export default function MailKpiCard() {
  const { data, denied } = useMailUnreadSummary(true);

  if (denied) return null;

  if (data == null) {
    return (
      <div className="bk-dash-kpi bk-dash-kpi--mail" style={{ backgroundColor: "#475569" }} aria-busy>
        <div className="amt">—</div>
        <div className="lbl">E-Posta</div>
        <div className="sub">Yükleniyor…</div>
      </div>
    );
  }

  if (!data.configured) {
    return (
      <Link
        href="/settings/mail"
        className="bk-dash-kpi bk-dash-kpi--mail"
        style={{ backgroundColor: "#78716c" }}
        title="E-posta ayarları"
      >
        <div className="amt">✉</div>
        <div className="lbl">E-Posta</div>
        <div className="sub">Ayarlanmamış</div>
      </Link>
    );
  }

  const unread = data.total_unread || 0;
  const hasUnread = unread > 0;
  const href = "/mail";
  const sub = hasUnread ? previewLine(data.latest) : "Yeni e-posta yok";

  return (
    <Link
      href={href}
      className={`bk-dash-kpi bk-dash-kpi--mail ${hasUnread ? "bk-dash-kpi--mail-hot" : ""}`}
      style={{ backgroundColor: hasUnread ? "#0284c7" : "#334155" }}
      title={hasUnread ? `${unread} okunmamış e-posta` : "Gelen kutusu"}
    >
      <div className="amt">{unread}</div>
      <div className="lbl">
        E-Posta
        {hasUnread ? <span className="bk-mail-kpi-dot" aria-hidden /> : null}
      </div>
      <div className="sub">{sub}</div>
    </Link>
  );
}
