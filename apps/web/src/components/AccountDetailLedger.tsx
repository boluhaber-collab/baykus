"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { formatMoney } from "@/lib/api";
import {
  accountAciklama,
  accountHesap,
  accountKullanici,
  formatTrDate,
  hareketLabel,
} from "@/lib/bhNote";

export type AccountLedgerRow = {
  id: number;
  movement_date: string;
  movement_type: string;
  note?: string | null;
  amount: number;
  direction: string;
  running_balance?: number | null;
  customer_name?: string | null;
  bank_account_name?: string | null;
  created_by_user_name?: string | null;
};

export type AccountDetailLedgerProps = {
  breadcrumbHref: string;
  breadcrumbLabel: string;
  title: string;
  subtitle?: string | null;
  accountType?: string | null;
  balance: number;
  actions: ReactNode;
  /** Inline panel under actions (forms). */
  panel?: ReactNode;
  error?: string;
  okMsg?: string;
  movements: AccountLedgerRow[];
  hareketFallback: Record<string, string>;
  emptyLabel?: string;
};

/**
 * BizimHesap Hesaplarım detail layout:
 * header (name + Bakiye) · action chips · full-width ledger
 * columns: Tarih | İşlem | Kullanıcı | Hesap | Açıklama | Borç | Alacak | Bakiye
 */
export default function AccountDetailLedger({
  breadcrumbHref,
  breadcrumbLabel,
  title,
  subtitle,
  accountType,
  balance,
  actions,
  panel,
  error,
  okMsg,
  movements,
  hareketFallback,
  emptyLabel = "Hareket yok",
}: AccountDetailLedgerProps) {
  return (
    <div className="space-y-3">
      <div className="text-xs text-baykus-muted">
        <Link href={breadcrumbHref} className="text-baykus-primary hover:underline">
          {breadcrumbLabel}
        </Link>
        <span className="mx-1">›</span>
        <span className="font-medium text-baykus-text">{title}</span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 leading-tight">{title}</h1>
            {accountType ? (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-700">
                {accountType}
              </span>
            ) : null}
          </div>
          {subtitle ? <p className="text-xs text-baykus-muted font-mono mt-0.5">{subtitle}</p> : null}
        </div>
        <div className="text-right">
          <div className="text-[11px] text-baykus-muted uppercase tracking-wide">Bakiye</div>
          <div className="text-lg font-bold tabular-nums text-slate-900">
            Bakiye : {formatMoney(Number(balance))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">{actions}</div>

      {error ? <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div> : null}
      {okMsg ? <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{okMsg}</div> : null}

      {panel}

      <div className="bk-table-wrap">
        <table className="bk-table text-sm">
          <thead>
            <tr>
              <th>Tarih</th>
              <th>İşlem</th>
              <th>Kullanıcı</th>
              <th>Hesap</th>
              <th>Açıklama</th>
              <th className="text-right">Borç</th>
              <th className="text-right">Alacak</th>
              <th className="text-right">Bakiye</th>
            </tr>
          </thead>
          <tbody>
            {movements.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-baykus-muted py-8">
                  {emptyLabel}
                </td>
              </tr>
            )}
            {movements.map((m) => {
              const isIn = m.direction === "in";
              const amt = Number(m.amount);
              const borc = isIn ? amt : 0;
              const alacak = isIn ? 0 : amt;
              const islem = hareketLabel(m.movement_type, m.note, hareketFallback);
              const kullanici = accountKullanici(m.note, m.created_by_user_name);
              const hesap = accountHesap(m.note, m.customer_name);
              const aciklama = accountAciklama(m.note);
              return (
                <tr key={m.id}>
                  <td className="whitespace-nowrap text-xs">{formatTrDate(m.movement_date)}</td>
                  <td className="whitespace-nowrap font-medium">{islem}</td>
                  <td className="text-xs text-slate-600">{kullanici || "—"}</td>
                  <td className="text-xs max-w-[140px] truncate" title={hesap || undefined}>
                    {hesap || "—"}
                  </td>
                  <td className="text-xs text-slate-700 max-w-[280px] truncate" title={aciklama || undefined}>
                    {aciklama || "—"}
                  </td>
                  <td className="text-right tabular-nums text-emerald-700">
                    {borc ? formatMoney(borc) : ""}
                  </td>
                  <td className="text-right tabular-nums text-red-700">
                    {alacak ? formatMoney(alacak) : ""}
                  </td>
                  <td className="text-right tabular-nums font-medium text-slate-800">
                    {m.running_balance != null ? formatMoney(Number(m.running_balance)) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
