"use client";

import Link from "next/link";
import { ReactNode, useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/api";
import { sanitizeDisplayNote } from "@/lib/bhNote";

export type PartyActionItem = {
  label: string;
  href?: string;
  onClick?: () => void;
};

export type PartyAction = {
  key: string;
  label: string;
  icon?: string;
  href?: string;
  onClick?: () => void;
  variant: "navy" | "green" | "white" | "purple" | "cyan" | "yellow" | "orange";
  menu?: PartyActionItem[];
};

export type PartyPanelSpec = {
  key: string;
  title: string;
  children: ReactNode;
  footerHref?: string;
  footerLabel?: string;
  footerOnClick?: () => void;
  defaultOpen?: boolean;
  /** Honest note under header (e.g. returns module absent). */
  note?: string;
};

export type PartyCardLayoutProps = {
  role: "customer" | "supplier";
  breadcrumbHref: string;
  breadcrumbLabel: string;
  /** Large title (company / name). */
  title: string;
  contactPerson?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  /** Open cari balance — shown on peach KPI. */
  openBalance: number;
  /** Sub-label under açık bakiye (e.g. alacaklı / borçlu). */
  openBalanceSub?: string;
  actions: PartyAction[];
  /** Left column panels (usually one: purchases / sales). */
  leftPanels: PartyPanelSpec[];
  /** Right column panels (payments + returns). */
  rightPanels: PartyPanelSpec[];
  error?: string;
  okMsg?: string;
  /** Secondary/deeper content kept below the first-view dashboard. */
  children?: ReactNode;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function ActionChip({ action }: { action: PartyAction }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const cls = `bk-party-chip bk-party-chip--${action.variant}`;
  const hasMenu = Boolean(action.menu && action.menu.length > 0);
  const hasPrimary = Boolean(action.onClick || action.href);
  const iconLabel = (
    <>
      {action.icon ? <span aria-hidden>{action.icon}</span> : null}
      <span>{action.label}</span>
    </>
  );

  const menuPanel =
    open && hasMenu ? (
      <div className="bk-party-chip-menu" role="menu">
        {action.menu!.map((item, i) =>
          item.href ? (
            <Link
              key={i}
              href={item.href}
              role="menuitem"
              onClick={() => {
                item.onClick?.();
                setOpen(false);
              }}
            >
              {item.label}
            </Link>
          ) : (
            <button
              key={i}
              type="button"
              role="menuitem"
              onClick={() => {
                item.onClick?.();
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ),
        )}
      </div>
    ) : null;

  if (!hasMenu) {
    if (action.href) {
      const external = /^https?:\/\//i.test(action.href) || action.href.startsWith("sms:");
      if (external) {
        return (
          <a
            href={action.href}
            className={cls}
            target="_blank"
            rel="noopener noreferrer"
            onClick={action.onClick}
          >
            {iconLabel}
          </a>
        );
      }
      return (
        <Link href={action.href} className={cls} onClick={action.onClick}>
          {iconLabel}
        </Link>
      );
    }
    return (
      <button type="button" className={cls} onClick={action.onClick}>
        {iconLabel}
      </button>
    );
  }

  // Menu only: whole chip toggles dropdown (no silent primary side-effect).
  if (!hasPrimary) {
    return (
      <div className="bk-party-chip-wrap" ref={wrapRef}>
        <button
          type="button"
          className={cls}
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((v) => !v)}
        >
          {iconLabel}
          <span aria-hidden>▾</span>
        </button>
        {menuPanel}
      </div>
    );
  }

  // Split: primary = onClick/href; caret = menu toggle only (never runs primary).
  const caret = (
    <button
      type="button"
      className={`${cls} bk-party-chip-caret`}
      aria-expanded={open}
      aria-haspopup="menu"
      aria-label={`${action.label} menü`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen((v) => !v);
      }}
    >
      <span aria-hidden>▾</span>
    </button>
  );

  if (action.href) {
    const external = /^https?:\/\//i.test(action.href) || action.href.startsWith("sms:");
    return (
      <div className="bk-party-chip-wrap bk-party-chip-wrap--split" ref={wrapRef}>
        {external ? (
          <a
            href={action.href}
            className={`${cls} bk-party-chip-primary`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={action.onClick}
          >
            {iconLabel}
          </a>
        ) : (
          <Link
            href={action.href}
            className={`${cls} bk-party-chip-primary`}
            onClick={action.onClick}
          >
            {iconLabel}
          </Link>
        )}
        {caret}
        {menuPanel}
      </div>
    );
  }

  return (
    <div className="bk-party-chip-wrap bk-party-chip-wrap--split" ref={wrapRef}>
      <button
        type="button"
        className={`${cls} bk-party-chip-primary`}
        onClick={action.onClick}
      >
        {iconLabel}
      </button>
      {caret}
      {menuPanel}
    </div>
  );
}

function CollapsiblePanel({ panel }: { panel: PartyPanelSpec }) {
  const [open, setOpen] = useState(panel.defaultOpen !== false);
  return (
    <div className="bk-party-panel">
      <button
        type="button"
        className="bk-party-panel-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="bk-party-panel-title">{panel.title}</span>
        <span
          className={`bk-party-panel-chevron ${open ? "" : "bk-party-panel-chevron--closed"}`}
          aria-hidden
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="bk-party-panel-body">
          {panel.note ? <div className="bk-party-panel-note">{panel.note}</div> : null}
          {panel.children}
          {(panel.footerHref || panel.footerOnClick) ? (
            <div className="bk-party-panel-footer">
              {panel.footerHref ? (
                <Link href={panel.footerHref} onClick={panel.footerOnClick}>
                  {panel.footerLabel || "tamamı için tıklayın..."}
                </Link>
              ) : (
                <button
                  type="button"
                  className="text-[#c2410c] text-[0.8125rem] font-semibold hover:underline"
                  onClick={panel.footerOnClick}
                >
                  {panel.footerLabel || "tamamı için tıklayın..."}
                </button>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * BizimHesap-style müşteri/tedarikçi kart ilk görünüm:
 * header · KPI (açık/çek/senet) · action chips · navy collapsible panels.
 */
export default function PartyCardLayout({
  role,
  breadcrumbHref,
  breadcrumbLabel,
  title,
  contactPerson,
  phone,
  address,
  notes,
  openBalance,
  openBalanceSub,
  actions,
  leftPanels,
  rightPanels,
  error,
  okMsg,
  children,
}: PartyCardLayoutProps) {
  const noteText = sanitizeDisplayNote(notes);
  const addr = [address].filter(Boolean).join(" ").trim();

  return (
    <div className="bk-party pb-2">
      <div className="text-xs text-baykus-muted">
        <Link href={breadcrumbHref} className="text-baykus-primary hover:underline">
          {breadcrumbLabel}
        </Link>
        <span className="mx-1">›</span>
        <span className="font-medium text-baykus-text">{title}</span>
      </div>

      <div className={`bk-party-header ${role === "customer" ? "bk-party-header--customer" : ""}`}>
        <div className="bk-party-avatar" aria-hidden>
          {initials(title)}
        </div>
        <div className="bk-party-identity">
          <h1 className="bk-party-name">{title}</h1>
          <div className="bk-party-meta">
            {contactPerson ? (
              <div className="bk-party-meta-row">
                <span className="bk-party-meta-icon" aria-hidden>
                  👤
                </span>
                <span>{contactPerson}</span>
              </div>
            ) : null}
            {phone ? (
              <div className="bk-party-meta-row">
                <span className="bk-party-meta-icon" aria-hidden>
                  📞
                </span>
                <a href={`tel:${phone.replace(/\s/g, "")}`} className="hover:underline">
                  {phone}
                </a>
              </div>
            ) : null}
            {addr ? (
              <div className="bk-party-meta-row">
                <span className="bk-party-meta-icon" aria-hidden>
                  🏠
                </span>
                <span>{addr}</span>
              </div>
            ) : null}
          </div>
        </div>
        <div className={`bk-party-notes ${noteText ? "" : "bk-party-notes--empty"}`}>
          {noteText || "Notlar — henüz kayıt yok."}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      ) : null}
      {okMsg ? (
        <div className="rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm">{okMsg}</div>
      ) : null}

      <div className="bk-party-kpi">
        <div className="bk-party-kpi-card bk-party-kpi-card--peach">
          <span className="bk-party-kpi-icon" aria-hidden>
            💵
          </span>
          <div className="min-w-0 flex-1">
            <div className="bk-party-kpi-label">Açık Bakiye</div>
            <div className="bk-party-kpi-value truncate">{formatMoney(openBalance)}</div>
            {openBalanceSub ? <div className="bk-party-kpi-sub">{openBalanceSub}</div> : null}
          </div>
        </div>
        <div className="bk-party-kpi-card bk-party-kpi-card--cyan">
          <span className="bk-party-kpi-icon" aria-hidden>
            🏷
          </span>
          <div className="min-w-0 flex-1">
            <div className="bk-party-kpi-label">Çek Bakiyesi</div>
            <div className="bk-party-kpi-value">{formatMoney(0)}</div>
            <div className="bk-party-kpi-sub">çek modülü yok</div>
          </div>
        </div>
        <div className="bk-party-kpi-card bk-party-kpi-card--mint">
          <span className="bk-party-kpi-icon" aria-hidden>
            🏷
          </span>
          <div className="min-w-0 flex-1">
            <div className="bk-party-kpi-label">Senet Bakiyesi</div>
            <div className="bk-party-kpi-value">{formatMoney(0)}</div>
            <div className="bk-party-kpi-sub">senet modülü yok</div>
          </div>
        </div>
      </div>

      <div className="bk-party-actions">
        {actions.map((a) => (
          <ActionChip key={a.key} action={a} />
        ))}
      </div>

      <div className="bk-party-grid">
        <div className="bk-party-col">
          {leftPanels.map((p) => (
            <CollapsiblePanel key={p.key} panel={p} />
          ))}
        </div>
        <div className="bk-party-col">
          {rightPanels.map((p) => (
            <CollapsiblePanel key={p.key} panel={p} />
          ))}
        </div>
      </div>

      {children ? <div className="bk-party-secondary">{children}</div> : null}
    </div>
  );
}

/** Build wa.me / sms link from a phone string; null if unusable. */
export function partySmsHref(phone: string | null | undefined): string | null {
  const raw = (phone || "").replace(/\D/g, "");
  if (!raw) return null;
  let digits = raw;
  if (digits.startsWith("0")) digits = "90" + digits.slice(1);
  if (!digits.startsWith("90")) digits = "90" + digits;
  return `https://wa.me/${digits}`;
}
