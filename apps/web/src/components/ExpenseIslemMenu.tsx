"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Expense, apiFetch, formatMoney } from "@/lib/api";
import { sanitizeDisplayNote } from "@/lib/bhNote";
import { formatTrDate } from "@/lib/dates";

/** Masraflar satırı İşlem ▾ menüsü — Hesaplarım (AccountDetailLedger) ile aynı bk-row-islem stili.
 *  Menü body'ye portal edilir (tablo alt kenarında kırpılmaz; altta yer yoksa yukarı açılır). */

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function printExpenseSlip(e: Expense, statusLabel: string) {
  let company = "Baykuş Baskı";
  let logoUrl = "";
  try {
    const { getApiBase } = await import("@/lib/api");
    const settings = await apiFetch<{ company_name?: string; form_logo_dosyasi?: string; logo_dosyasi?: string }>(
      "/api/settings",
    );
    company = (settings.company_name || company).trim() || company;
    const logoFile = (settings.form_logo_dosyasi || settings.logo_dosyasi || "").trim();
    if (logoFile) {
      logoUrl = logoFile.startsWith("http")
        ? logoFile
        : `${getApiBase()}/uploads/logos/${logoFile.split(/[/\\]/).pop()}`;
    }
  } catch {
    /* optional */
  }
  const w = window.open("", "_blank", "width=720,height=640");
  if (!w) return;
  const hesap = e.payment_method === "banka" ? e.bank_account_name || "Banka" : e.cash_register_name || "Kasa";
  const kalem = [e.category_group_name, e.category_name].filter(Boolean).join(" / ") || "—";
  w.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"/>
<title>Masraf #${e.id}</title>
<style>
  body{font-family:system-ui,sans-serif;padding:28px;color:#0f172a;max-width:720px;margin:0 auto}
  .letterhead{text-align:center;border-bottom:2px solid #e2e8f0;background:#f8fafc;margin:-28px -28px 18px;padding:20px 28px 14px}
  .letterhead img{max-height:56px;max-width:220px;object-fit:contain;margin:0 auto 8px;display:block}
  .letterhead .co{font-size:15px;font-weight:700}
  .letterhead .sub{font-size:11px;color:#64748b;margin-top:2px}
  h1{font-size:16px;margin:0 0 4px}
  .muted{color:#64748b;font-size:12px;margin-bottom:16px}
  table{border-collapse:collapse;width:100%;font-size:13px}
  td{padding:6px 8px;border-bottom:1px solid #e2e8f0}
  td:first-child{color:#64748b;width:140px}
  .actions{margin-top:20px} button{padding:8px 14px;font-size:13px;cursor:pointer}
  @media print{.actions{display:none}}
</style></head><body>
<div class="letterhead">${logoUrl ? `<img src="${esc(logoUrl)}" alt=""/>` : ""}
<div class="co">${esc(company)}</div><div class="sub">Masraf Fişi</div></div>
<h1>${esc(e.category_name || "Masraf")}</h1>
<div class="muted">Masraf fişi · #${e.id}</div>
<table>
<tr><td>İşlem Tarihi</td><td>${esc(formatTrDate(e.expense_date))}</td></tr>
<tr><td>Vade</td><td>${esc(formatTrDate(e.due_date))}</td></tr>
<tr><td>Belge No</td><td>${esc(e.document_no || "—")}</td></tr>
<tr><td>Masraf Kalemi</td><td>${esc(kalem)}</td></tr>
<tr><td>Hesap</td><td>${esc(hesap)}</td></tr>
<tr><td>Ödeme</td><td>${esc(e.payment_method)}</td></tr>
<tr><td>Durumu</td><td>${esc(statusLabel)}</td></tr>
<tr><td>Not</td><td>${esc(sanitizeDisplayNote(e.note) || "—")}</td></tr>
<tr><td>Tutar</td><td><strong>${esc(formatMoney(Number(e.amount)))}</strong></td></tr>
</table>
<div class="actions"><button onclick="window.print()">Yazdır</button></div>
<script>window.onload=()=>{try{window.print()}catch(e){}}<\/script>
</body></html>`);
  w.document.close();
}

export default function ExpenseIslemMenu({
  expense,
  cancelled,
  locked,
  statusLabel,
  onEdit,
  onCopy,
  onPost,
  onDelete,
  onCancel,
  onOk,
  onError,
}: {
  expense: Expense;
  cancelled: boolean;
  locked: boolean;
  statusLabel: string;
  onEdit: () => void;
  onCopy: () => void;
  onPost: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onOk?: (m: string) => void;
  onError?: (m: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lockTip = "BizimHesap aktarım kaydı — değiştirilemez";

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const b = btnRef.current?.getBoundingClientRect();
      if (!b) return;
      const mh = menuRef.current?.offsetHeight || 220;
      const mw = menuRef.current?.offsetWidth || 190;
      const below = window.innerHeight - b.bottom;
      const top = below < mh + 8 && b.top > mh + 8 ? b.top - mh - 4 : b.bottom + 4;
      const left = Math.max(8, Math.min(b.right - mw, window.innerWidth - mw - 8));
      setPos({ top, left });
    }
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(ev: MouseEvent) {
      const t = ev.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function onFilePicked(file: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", `masraf #${expense.id} — ${file.name}`);
      fd.append("category", "masraf");
      fd.append(
        "notes",
        `expense_id=${expense.id} | tarih=${formatTrDate(expense.expense_date, "")} | ${expense.category_name || "Masraf"} | ${formatMoney(Number(expense.amount))}`,
      );
      fd.append("archive_tag", `expense-${expense.id}`);
      await apiFetch("/api/documents", { method: "POST", body: fd });
      onOk?.("Belge eklendi (Evrak Dolabı)");
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Belge yükleme hatası");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const act = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const menu = open ? (
    <div
      ref={menuRef}
      className="bk-row-islem-menu"
      role="menu"
      style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, right: "auto", zIndex: 1000 }}
    >
      <button type="button" role="menuitem" onClick={act(() => void printExpenseSlip(expense, statusLabel))}>
        Yazdır
      </button>
      {!cancelled ? (
        locked ? (
          <button type="button" role="menuitem" disabled title={lockTip} className="bk-row-islem-disabled">
            Düzenle <span className="bk-row-islem-hint">aktarım</span>
          </button>
        ) : (
          <button type="button" role="menuitem" onClick={act(onEdit)}>
            Düzenle
          </button>
        )
      ) : null}
      <button
        type="button"
        role="menuitem"
        title="Aynı bilgilerle yeni masraf formu (bugünün tarihiyle)"
        onClick={act(onCopy)}
      >
        Kopyala
      </button>
      {!cancelled && !expense.is_posted ? (
        <>
          <button type="button" role="menuitem" onClick={act(onPost)}>
            Öde / İşle <span className="bk-row-islem-hint">kasa/banka</span>
          </button>
          {locked ? (
            <button type="button" role="menuitem" disabled title={lockTip} className="bk-row-islem-disabled">
              Sil <span className="bk-row-islem-hint">aktarım</span>
            </button>
          ) : (
            <button type="button" role="menuitem" className="bk-row-islem-danger" onClick={act(onDelete)}>
              Sil
            </button>
          )}
        </>
      ) : null}
      {!cancelled ? (
        <button type="button" role="menuitem" onClick={act(() => fileRef.current?.click())}>
          + Belge Ekle
        </button>
      ) : null}
      {!cancelled ? (
        <button type="button" role="menuitem" className="bk-row-islem-danger" onClick={act(onCancel)}>
          İptal Et
        </button>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="bk-row-islem">
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        tabIndex={-1}
        onChange={(e) => void onFilePicked(e.target.files?.[0] || null)}
      />
      <button
        ref={btnRef}
        type="button"
        className="bk-row-islem-btn"
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
      >
        İşlem <span aria-hidden>▾</span>
      </button>
      {menu && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
    </div>
  );
}
