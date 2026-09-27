/**
 * Parse BizimHesap-imported cari/supplier movement notes.
 *
 * Format from import_bizimhesap_cari.py:
 *   BH_IMPORT:{guid}:{idx} | Hareket=… | Belge=… | Odeme=… | [açıklama] | Kalem=…; … | BH_Bakiye=…
 */

import type { ExpandDetailPayload, ExpandLineItem } from "@/components/ExpandableMovementTable";

const BH_PREFIX = "BH_IMPORT:";

export type BhNoteParts = {
  isBh: boolean;
  hareket?: string;
  belge?: string;
  odeme?: string;
  aciklama?: string;
  kalemRaw?: string;
  bhBakiye?: string;
  /** Human-facing description (açıklama + belge), without metadata keys. */
  displayNote: string | null;
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
  const raw = (note || "").trim();
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
  let kalemRaw: string | undefined;
  let bhBakiye: string | undefined;
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
      if (k === "kalem") {
        kalemRaw = val;
        continue;
      }
      if (k === "bh_bakiye") {
        bhBakiye = val;
        continue;
      }
    }
    free.push(p);
  }

  const aciklama = free.join(" · ").trim() || undefined;
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
    aciklama,
    kalemRaw,
    bhBakiye,
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
