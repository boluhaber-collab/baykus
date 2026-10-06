"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, formatMoney, type BankAccount, type CashRegister } from "@/lib/api";
import {
  accountAciklama,
  accountHesap,
  accountKullanici,
  formatTrDate,
  hareketLabel,
  isBhImportNote,
} from "@/lib/bhNote";
import { DEFAULT_DATE_SORT, DateSortDir, sortByDate } from "@/lib/dateSort";
import { toIsoDate } from "@/lib/dates";
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
  cash_register_id?: number | null;
  bank_account_id?: number | null;
  transfer_group_id?: string | null;
};

export type AccountLedgerKind = "cash" | "bank";

export type AccountDetailLedgerProps = {
  breadcrumbHref: string;
  breadcrumbLabel: string;
  title: string;
  subtitle?: string | null;
  accountType?: string | null;
  /** Soft-disabled — show Pasif chip; excluded from pickers/dashboard. */
  inactive?: boolean;
  balance: number;
  actions: ReactNode;
  /** Inline panel under actions (forms). */
  panel?: ReactNode;
  error?: string;
  okMsg?: string;
  movements: AccountLedgerRow[];
  hareketFallback: Record<string, string>;
  emptyLabel?: string;
  /** cash → DELETE/PUT /api/finance/cash/movements/{id}; bank → /api/finance/bank-movements/{id} */
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
  onEdit,
  onRowMutated,
  onRowError,
  onRowOk,
}: {
  row: AccountLedgerRow;
  accountTitle: string;
  islem: string;
  ledgerKind?: AccountLedgerKind;
  onEdit?: (row: AccountLedgerRow) => void;
  onRowMutated?: () => void | Promise<void>;
  onRowError?: (message: string) => void;
  onRowOk?: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imported = isBhImportNote(row.note);
  const canMutate = Boolean(ledgerKind) && !imported;

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
        `${ledgerKind || "account"}_movement_id=${row.id} | tarih=${formatTrDate(row.movement_date, "")} | ${islem}`,
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
          {canMutate ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onEdit?.(row);
              }}
            >
              Düzenle
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              disabled
              title={
                imported
                  ? "BizimHesap aktarım kaydı — düzenlenemez"
                  : "Düzenleme bu hesap türü için bağlı değil"
              }
              className="bk-row-islem-disabled"
            >
              Düzenle
              <span className="bk-row-islem-hint">
                {imported ? "aktarım" : "yok"}
              </span>
            </button>
          )}
          {canMutate ? (
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
  inactive,
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
  const [editing, setEditing] = useState<AccountLedgerRow | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editAccountId, setEditAccountId] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [cashOptions, setCashOptions] = useState<CashRegister[]>([]);
  const [bankOptions, setBankOptions] = useState<BankAccount[]>([]);

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

  const isTransfer = Boolean(editing?.transfer_group_id);

  useEffect(() => {
    if (!editing || !ledgerKind || isTransfer) return;
    let cancelled = false;
    (async () => {
      try {
        if (ledgerKind === "cash") {
          const rows = await apiFetch<CashRegister[]>("/api/finance/cash?active=true");
          if (!cancelled) setCashOptions(rows);
        } else {
          const rows = await apiFetch<BankAccount[]>("/api/finance/banks?active=true");
          if (!cancelled) setBankOptions(rows);
        }
      } catch {
        /* picker optional — save still works without account change */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editing, ledgerKind, isTransfer]);

  function openEdit(row: AccountLedgerRow) {
    if (isBhImportNote(row.note)) {
      onRowError?.("BizimHesap aktarım kaydı — düzenlenemez");
      return;
    }
    if (!ledgerKind) {
      onRowError?.("Düzenleme bu hesap türü için bağlı değil");
      return;
    }
    setEditing(row);
    setEditAmount(String(row.amount ?? ""));
    setEditDate(toIsoDate(row.movement_date));
    setEditNote(accountAciklama(row.note) || "");
    const accId =
      ledgerKind === "cash"
        ? row.cash_register_id
        : row.bank_account_id;
    setEditAccountId(accId != null ? String(accId) : "");
  }

  function closeEdit() {
    setEditing(null);
    setEditBusy(false);
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing || !ledgerKind) return;
    const amt = Number(editAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      onRowError?.("Tutar 0'dan büyük olmalıdır");
      return;
    }
    setEditBusy(true);
    try {
      const body: Record<string, unknown> = {
        amount: amt,
        movement_date: editDate || null,
        note: editNote.trim() || null,
      };
      if (!isTransfer && editAccountId) {
        const idNum = Number(editAccountId);
        if (Number.isFinite(idNum) && idNum > 0) {
          if (ledgerKind === "cash") body.cash_register_id = idNum;
          else body.bank_account_id = idNum;
        }
      }
      const path =
        ledgerKind === "cash"
          ? `/api/finance/cash/movements/${editing.id}`
          : `/api/finance/bank-movements/${editing.id}`;
      await apiFetch(path, { method: "PUT", body: JSON.stringify(body) });
      onRowOk?.(
        isTransfer
          ? "Hareket güncellendi (transfer eşleri dahil)"
          : "Hareket güncellendi",
      );
      closeEdit();
      await onRowMutated?.();
    } catch (err) {
      onRowError?.(err instanceof Error ? err.message : "Düzenleme hatası");
    } finally {
      setEditBusy(false);
    }
  }

  const editIslem = editing
    ? hareketLabel(editing.movement_type, editing.note, hareketFallback)
    : "";

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
            {inactive ? (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-slate-200 text-slate-600">
                Pasif
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

      {editing ? (
        <form
          onSubmit={(e) => void onSaveEdit(e)}
          className="rounded border border-sky-200 bg-sky-50 p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm"
        >
          <div className="sm:col-span-2 lg:col-span-4 font-semibold text-slate-800">
            Hareketi Düzenle · #{editing.id}
            {editIslem ? (
              <span className="ml-2 font-normal text-baykus-muted">({editIslem})</span>
            ) : null}
            {isTransfer ? (
              <span className="ml-2 text-xs font-normal text-amber-800">
                Transfer — tutar/tarih/açıklama eş harekete de uygulanır
              </span>
            ) : null}
          </div>
          <label className="text-xs">
            <span className="block mb-0.5 opacity-80">Tutar *</span>
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              className="bk-input"
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
            />
          </label>
          <label className="text-xs">
            <span className="block mb-0.5 opacity-80">Tarih</span>
            <input
              type="date"
              className="bk-input"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
            />
          </label>
          {!isTransfer && ledgerKind === "cash" && cashOptions.length > 0 ? (
            <label className="text-xs">
              <span className="block mb-0.5 opacity-80">Kasa</span>
              <select
                className="bk-input"
                value={editAccountId}
                onChange={(e) => setEditAccountId(e.target.value)}
              >
                {cashOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {!isTransfer && ledgerKind === "bank" && bankOptions.length > 0 ? (
            <label className="text-xs">
              <span className="block mb-0.5 opacity-80">Hesap</span>
              <select
                className="bk-input"
                value={editAccountId}
                onChange={(e) => setEditAccountId(e.target.value)}
              >
                {bankOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.institution ? ` · ${a.institution}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className={`text-xs ${isTransfer ? "sm:col-span-2" : "sm:col-span-2 lg:col-span-2"}`}>
            <span className="block mb-0.5 opacity-80">Açıklama</span>
            <input
              className="bk-input"
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              placeholder="İsteğe bağlı"
            />
          </label>
          <div className="flex items-end gap-2 lg:col-span-4">
            <button type="submit" disabled={editBusy} className="bk-btn bk-btn-primary text-xs">
              {editBusy ? "…" : "Kaydet"}
            </button>
            <button
              type="button"
              className="bk-btn bk-btn-ghost text-xs"
              disabled={editBusy}
              onClick={closeEdit}
            >
              İptal
            </button>
          </div>
        </form>
      ) : (
        panel
      )}

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
              const rowHighlight = editing?.id === m.id ? "bg-sky-50/80" : undefined;
              return (
                <tr key={m.id} className={rowHighlight}>
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
                      onEdit={openEdit}
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
