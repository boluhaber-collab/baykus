/**
 * Parse BizimHesap-imported cari/supplier/account movement notes.
 *
 * Format from import_bizimhesap_cari.py / import_bizimhesap_hesaplar.py:
 *   BH_IMPORT:{guid}:{idx} | Hareket=… | Belge=… | Odeme=… | Cari=… | Kullanıcı=… | [açıklama] | Kalem=…; … | BH_Bakiye=… | Kaynak=…
 */

import type { ExpandDetailPayload, ExpandLineItem } from "@/components/ExpandableMovementTable";
import { decodeHtmlEntities } from "@/lib/htmlEntities";

const BH_PREFIX = "BH_IMPORT:";

/** True when note is from BizimHesap import — must not be deletable via UI/API. */
export function isBhImportNote(note: string | null | undefined): boolean {
  const raw = (note || "").trim();
  if (!raw) return false;
  return raw.startsWith(BH_PREFIX) || raw.includes(BH_PREFIX);
}

export type BhNoteParts = {
  isBh: boolean;
  hareket?: string;
  belge?: string;
  odeme?: string;
  /** Counterparty / Hesap column from BH GetCashTrx (Cari=…). */
  cari?: string;
  /** Operator name from BH (Kullanıcı=…). */
  kullanici?: string;
  aciklama?: string;
  kalemRaw?: string;
  bhBakiye?: string;
  kaynak?: string;
  /** Human-facing description (açıklama + belge), without metadata keys. */
  displayNote: string | null;
};

/** BH-style işlem labels for bank movement_type when Hareket= absent. */
export const BANK_HAREKET_LABELS: Record<string, string> = {
  deposit: "Para Girişi",
  withdrawal: "Ödeme",
  transfer_in: "Para Girişi",
  transfer_out: "Para Çıkışı",
  fee: "Masraf",
};

/** BH-style işlem labels for cash movement_type when Hareket= absent. */
export const CASH_HAREKET_LABELS: Record<string, string> = {
  tahsilat: "Tahsilat",
  odeme: "Ödeme",
  gider: "Ödeme",
  transfer_in: "Para Girişi",
  transfer_out: "Para Çıkışı",
};

/** Parse amounts from Kalem= entries (English decimal from import) or TR money. */
function parseAmount(token: string): number {
  const raw = token.trim().replace(/\s/g, "");
  if (!raw) return 0;
  // English decimal from import (25.00 / 33464.20)
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  // Turkish: 1.234,56
  const s = raw.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Parse a single Kalem=NAME xQTY[ UNIT] @PRICE=AMOUNT compact entry. */
function parseKalemEntry(entry: string): ExpandLineItem | null {
  const t = entry.trim();
  if (!t) return null;
  // NAME xQTY UNIT? @PRICE=AMOUNT
  const m = t.match(
    /^(.+?)\s+x\s*([\d.,]+)\s*([A-Za-zÇĞİÖŞÜçğıöşü.%]*)?\s*@\s*([\d.,]+)\s*=\s*([\d.,]+)\s*$/,
  );
  if (m) {
    const qty = m[2];
    const unit = (m[3] || "").trim();
    const name = m[1].trim();
    const label = unit ? `${qty} ${unit} x ${name}` : `${qty} x ${name}`;
    return {
      label,
      price: parseAmount(m[4]),
      amount: parseAmount(m[5]),
    };
  }
  // Fallback: treat whole entry as label with unknown price
  return { label: t, price: 0, amount: 0 };
}

export function parseBhNote(note: string | null | undefined): BhNoteParts {
  const raw = decodeHtmlEntities(note || "").trim();
  if (!raw) {
    return { isBh: false, displayNote: null };
  }
  if (!raw.startsWith(BH_PREFIX) && !raw.includes("Hareket=")) {
    return { isBh: false, displayNote: raw };
  }

  const parts = raw.split("|").map((p) => p.trim()).filter(Boolean);
  let hareket: string | undefined;
  let belge: string | undefined;
  let odeme: string | undefined;
  let cari: string | undefined;
  let kullanici: string | undefined;
  let kalemRaw: string | undefined;
  let bhBakiye: string | undefined;
  let kaynak: string | undefined;
  const free: string[] = [];

  for (const p of parts) {
    if (p.startsWith(BH_PREFIX)) continue;
    const eq = p.indexOf("=");
    if (eq > 0 && eq < 24) {
      const key = p.slice(0, eq).trim();
      const val = p.slice(eq + 1).trim();
      const k = key.toLowerCase();
      if (k === "hareket") {
        hareket = val;
        continue;
      }
      if (k === "belge") {
        belge = val;
        continue;
      }
      if (k === "odeme" || k === "ödeme") {
        odeme = val;
        continue;
      }
      if (k === "cari" || k === "hesap") {
        cari = val;
        continue;
      }
      if (k === "kullanici" || k === "kullanıcı" || k === "user") {
        kullanici = val;
        continue;
      }
      if (k === "kalem") {
        kalemRaw = val;
        continue;
      }
      if (k === "bh_bakiye") {
        bhBakiye = val;
        continue;
      }
      if (k === "kaynak" || k === "source") {
        kaynak = val;
        continue;
      }
      // Unknown key=value metadata — skip from free text
      continue;
    }
    free.push(p);
  }

  // Drop free fragments that duplicate Cari/Hesap
  const freeClean = cari
    ? free.filter((f) => f !== cari && f.toLowerCase() !== cari.toLowerCase())
    : free;

  const aciklama = freeClean.join(" · ").trim() || undefined;
  const displayBits: string[] = [];
  if (belge) displayBits.push(`Belge ${belge}`);
  if (odeme) displayBits.push(odeme);
  if (aciklama) displayBits.push(aciklama);
  if (!displayBits.length && hareket) displayBits.push(hareket);

  return {
    isBh: raw.startsWith(BH_PREFIX) || Boolean(hareket),
    hareket,
    belge,
    odeme,
    cari,
    kullanici,
    aciklama,
    kalemRaw,
    bhBakiye,
    kaynak,
    displayNote: displayBits.length ? displayBits.join(" · ") : null,
  };
}

/**
 * Build expand-panel payload from a BH (or plain) movement note.
 * Prefers structured Kalem= entries; otherwise synthesizes one line from açıklama + amount.
 */
export function detailFromBhNote(
  note: string | null | undefined,
  amount?: number,
): ExpandDetailPayload {
  const parsed = parseBhNote(note);
  const lines: ExpandLineItem[] = [];

  if (parsed.kalemRaw) {
    for (const entry of parsed.kalemRaw.split(";")) {
      const line = parseKalemEntry(entry);
      if (line && (line.label || line.amount)) lines.push(line);
    }
  }

  if (lines.length === 0 && parsed.aciklama) {
    // Free-text açıklama that looks like a product name (not just a stray number)
    const looksLikeMoneyOnly = /^[\d.,\s\-]+$/.test(parsed.aciklama);
    if (!looksLikeMoneyOnly) {
      const amt = Number(amount ?? 0);
      lines.push({
        label: parsed.aciklama,
        price: amt,
        amount: amt,
      });
    }
  }

  return {
    lines,
    note: parsed.displayNote,
  };
}

/** Prefer Hareket= label from BH note, else fallback map / raw type. */
export function hareketLabel(
  movementType: string,
  note: string | null | undefined,
  fallbackMap?: Record<string, string>,
): string {
  const parsed = parseBhNote(note);
  if (parsed.hareket) return parsed.hareket;
  if (fallbackMap && fallbackMap[movementType]) return fallbackMap[movementType];
  return movementType;
}

export function belgeFromNote(note: string | null | undefined): string | null {
  return parseBhNote(note).belge || null;
}

/** Clean Açıklama for account ledger (no BH_IMPORT / Hareket= / Kaynak=). */
export function accountAciklama(note: string | null | undefined): string {
  const parsed = parseBhNote(note);
  if (parsed.aciklama) return parsed.aciklama;
  if (!parsed.isBh && parsed.displayNote) return parsed.displayNote;
  return "";
}

/** Hesap column: Cari= from note, else optional fallback (e.g. customer_name). */
export function accountHesap(
  note: string | null | undefined,
  fallback?: string | null,
): string {
  const parsed = parseBhNote(note);
  return (parsed.cari || fallback || "").trim();
}

/** Kullanıcı column: Kullanıcı= from note, else created-by name. */
export function accountKullanici(
  note: string | null | undefined,
  createdByName?: string | null,
): string {
  const parsed = parseBhNote(note);
  return (parsed.kullanici || createdByName || "").trim();
}

/** ISO date → DD.MM.YYYY (BizimHesap style). */
export function formatTrDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = String(iso).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  return `${m[3]}.${m[2]}.${m[1]}`;
}
