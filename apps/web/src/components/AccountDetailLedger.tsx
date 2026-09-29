"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, formatMoney } from "@/lib/api";
import {
  accountAciklama,
  accountHesap,
  accountKullanici,
  formatTrDate,
  hareketLabel,
  isBhImportNote,
} from "@/lib/bhNote";
import { DEFAULT_DATE_SORT, DateSortDir, sortByDate } from "@/lib/dateSort";
import SortableDateHeader from "@/components/SortableDateHeader";

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

export type AccountLedgerKind = "cash" | "bank";

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
  /** cash → DELETE /api/finance/cash/movements/{id}; bank → /api/finance/bank-movements/{id} */
  ledgerKind?: AccountLedgerKind;
  onRowMutated?: () => void | Promise<void>;
  onRowError?: (message: string) => void;
  onRowOk?: (message: string) => void;
};

function printMovementSlip(m: AccountLedgerRow, accountTitle: string, islem: string) {
  const isIn = m.direction === "in";
  const amt = formatMoney(Number(m.amount));
  const aciklama = accountAciklama(m.note) || "—";
  const kullanici = accountKullanici(m.note, m.created_by_user_name) || "—";
  const hesap = accountHesap(m.note, m.customer_name) || "—";
  const w = window.open("", "_blank", "noopener,noreferrer,width=720,height=640");
  if (!w) return;
  w.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"/>
<title>Hareket #${m.id}</title>
<style>
  body{font-family:system-ui,sans-serif;padding:24px;color:#0f172a}
  h1{font-size:18px;margin:0 0 4px}
  .muted{color:#64748b;font-size:12px;margin-bottom:16px}
  table{border-collapse:collapse;width:100%;font-size:13px}
  td{padding:6px 8px;border-bottom:1px solid #e2e8f0}
  td:first-child{color:#64748b;width:140px}
  .actions{margin-top:20px}
  button{padding:8px 14px;font-size:13px;cursor:pointer}
</style></head><body>
<h1>${accountTitle}</h1>
<div class="muted">Hareket fişi · #${m.id}</div>
<table>
<tr><td>Tarih</td><td>${formatTrDate(m.movement_date)}</td></tr>
<tr><td>İşlem</td><td>${islem}</td></tr>
<tr><td>Kullanıcı</td><td>${kullanici}</td></tr>
<tr><td>Hesap</td><td>${hesap}</td></tr>
<tr><td>Açıklama</td><td>${aciklama}</td></tr>
<tr><td>${isIn ? "Borç (Giriş)" : "Alacak (Çıkış)"}</td><td><strong>${amt}</strong></td></tr>
</table>
<div class="actions"><button onclick="window.print()">Yazdır</button></div>
<script>window.onload=()=>{try{window.print()}catch(e){}}<\/script>
</body></html>`);
  w.document.close();
}

function RowIslemMenu({
  row,
  accountTitle,
  islem,
  ledgerKind,
  onRowMutated,
  onRowError,
  onRowOk,
}: {
  row: AccountLedgerRow;
  accountTitle: string;
  islem: string;
  ledgerKind?: AccountLedgerKind;
  onRowMutated?: () => void | Promise<void>;
  onRowError?: (message: string) => void;
  onRowOk?: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imported = isBhImportNote(row.note);
  const canDelete = Boolean(ledgerKind) && !imported;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function onDelete() {
    if (!ledgerKind || imported) return;
    if (
      !confirm(
        "Bu hareketi silmek istiyor musunuz? (BizimHesap aktarım kayıtları silinemez)",
      )
    ) {
      return;
    }
    setBusy(true);
    setOpen(false);
    try {
      const path =
        ledgerKind === "cash"
          ? `/api/finance/cash/movements/${row.id}`
          : `/api/finance/bank-movements/${row.id}`;
      await apiFetch(path, { method: "DELETE" });
      onRowOk?.("Hareket silindi");
      await onRowMutated?.();
    } catch (e) {
      onRowError?.(e instanceof Error ? e.message : "Silme hatası");
    } finally {
      setBusy(false);
    }
  }

  async function onFilePicked(file: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      const kindLabel = ledgerKind === "cash" ? "kasa" : ledgerKind === "bank" ? "banka" : "hesap";
      fd.append("file", file);
      fd.append("title", `${kindLabel} hareket #${row.id} — ${file.name}`);
      fd.append("category", "hesap-hareket");
      fd.append(
        "notes",
        `${ledgerKind || "account"}_movement_id=${row.id} | tarih=${row.movement_date} | ${islem}`,
      );
      fd.append("archive_tag", `mov-${ledgerKind || "x"}-${row.id}`);
      await apiFetch("/api/documents", { method: "POST", body: fd });
      onRowOk?.("Belge eklendi (Evrak Dolabı)");
    } catch (e) {
      onRowError?.(e instanceof Error ? e.message : "Belge yükleme hatası");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="bk-row-islem" ref={wrapRef}>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        tabIndex={-1}
        onChange={(e) => void onFilePicked(e.target.files?.[0] || null)}
      />
      <button
        type="button"
        className="bk-row-islem-btn"
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
      >
        İşlem <span aria-hidden>▾</span>
      </button>
      {open ? (
        <div className="bk-row-islem-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              printMovementSlip(row, accountTitle, islem);
            }}
          >
            Yazdır
          </button>
          <button
            type="button"
            role="menuitem"
            disabled
            title="Hareket düzenleme henüz desteklenmiyor"
            className="bk-row-islem-disabled"
          >
            Düzenle
            <span className="bk-row-islem-hint">yakında</span>
          </button>
          {canDelete ? (
            <button
              type="button"
              role="menuitem"
              className="bk-row-islem-danger"
              onClick={() => void onDelete()}
            >
              Sil
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              disabled
              title={
                imported
                  ? "BizimHesap aktarım kaydı — silinemez"
                  : "Silme bu hesap türü için bağlı değil"
              }
              className="bk-row-islem-disabled"
            >
              Sil
              <span className="bk-row-islem-hint">
                {imported ? "aktarım" : "yok"}
              </span>
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              fileRef.current?.click();
            }}
          >
            + Belge Ekle
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * BizimHesap Hesaplarım detail layout:
 * header (name + Bakiye) · action chips · full-width ledger
 * columns: Tarih | İşlem | Kullanıcı | Hesap | Açıklama | Borç | Alacak | Bakiye | İşlem▾
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
  ledgerKind,
  onRowMutated,
  onRowError,
  onRowOk,
}: AccountDetailLedgerProps) {
  const [dateDir, setDateDir] = useState<DateSortDir>(DEFAULT_DATE_SORT);
  const sortedMovements = useMemo(
    () =>
      sortByDate(
        movements,
        (m) => m.movement_date,
        dateDir,
        (m) => m.id,
      ),
    [movements, dateDir],
  );

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
              <th className="bk-th-sortable">
                <SortableDateHeader dir={dateDir} onChange={setDateDir} />
              </th>
              <th>İşlem</th>
              <th>Kullanıcı</th>
              <th>Hesap</th>
              <th>Açıklama</th>
              <th className="text-right">Borç</th>
              <th className="text-right">Alacak</th>
              <th className="text-right">Bakiye</th>
              <th className="text-right">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {sortedMovements.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-baykus-muted py-8">
                  {emptyLabel}
                </td>
              </tr>
            )}
            {sortedMovements.map((m) => {
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
                  <td className="text-right whitespace-nowrap">
                    <RowIslemMenu
                      row={m}
                      accountTitle={title}
                      islem={islem}
                      ledgerKind={ledgerKind}
                      onRowMutated={onRowMutated}
                      onRowError={onRowError}
                      onRowOk={onRowOk}
                    />
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
