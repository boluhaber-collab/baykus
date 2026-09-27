"use client";

import Link from "next/link";
import { Fragment, ReactNode, useCallback, useState } from "react";
import { formatMoney } from "@/lib/api";
import { decodeHtmlEntities } from "@/lib/htmlEntities";
import { sanitizeDisplayNote } from "@/lib/bhNote";

export type ExpandLineItem = {
  label: string;
  price: number;
  amount: number;
};

export type ExpandDetailPayload = {
  lines?: ExpandLineItem[];
  note?: string | null;
  userName?: string | null;
};

export type ExpandableColumn<T> = {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  className?: string;
  render: (row: T) => ReactNode;
};

export type ExpandableMovementTableProps<T extends { id: number | string }> = {
  columns: ExpandableColumn<T>[];
  rows: T[];
  emptyText?: string;
  /** Static note shown in the expand panel (merged with loaded detail). */
  getNote?: (row: T) => string | null | undefined;
  /** Optional CTA shown bottom-right when a route exists. */
  getCta?: (row: T) => { href: string; label: string } | null | undefined;
  /** Lazy-load line items / extra note / user when the row expands. */
  loadDetail?: (row: T) => Promise<ExpandDetailPayload | null>;
  /** Optional leading rows (e.g. opening balance) rendered before data rows. */
  leadingRows?: ReactNode;
  className?: string;
};

type CacheEntry = ExpandDetailPayload & { loading?: boolean; error?: string | null };

function ExpandToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`bk-expand-toggle ${open ? "bk-expand-toggle--minus" : "bk-expand-toggle--plus"}`}
      aria-label={open ? "Detayı kapat" : "Detayı aç"}
      aria-expanded={open}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {open ? "−" : "+"}
    </button>
  );
}

function ExpandPanel({
  detail,
  fallbackNote,
  cta,
}: {
  detail: CacheEntry | undefined;
  fallbackNote?: string | null;
  cta?: { href: string; label: string } | null;
}) {
  const loading = detail?.loading;
  const error = detail?.error;
  const lines = detail?.lines || [];
  const note = sanitizeDisplayNote(detail?.note ?? fallbackNote ?? "");
  const userName = decodeHtmlEntities(detail?.userName || "").trim();

  return (
    <div className="bk-expand-panel">
      {loading && <div className="bk-expand-loading">Detay yükleniyor…</div>}
      {error && <div className="bk-expand-empty text-red-600">{error}</div>}
      {!loading && !error && lines.length > 0 && (
        <table className="bk-expand-lines">
          <thead>
            <tr>
              <th>Ürün/Hizmet</th>
              <th className="num">Fiyat</th>
              <th className="num">Tutar (KDV Dahil)</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i}>
                <td>{decodeHtmlEntities(line.label)}</td>
                <td className="num tabular-nums">{formatMoney(line.price)}</td>
                <td className="num tabular-nums">{formatMoney(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!loading && !error && lines.length === 0 && !note && (
        <div className="bk-expand-empty">Kalem detayı yok</div>
      )}
      {(note || userName || cta) && (
        <div className="bk-expand-meta">
          <div className="min-w-0 flex-1">
            {note ? (
              <div className="note">
                <strong>Açıklama:</strong> {note}
              </div>
            ) : null}
            {userName ? <div className="user">Kullanıcı : {userName}</div> : null}
          </div>
          {cta ? (
            <Link href={cta.href} className="bk-expand-cta">
              <span aria-hidden>↗</span>
              {cta.label}
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * BizimHesap-style hareket tablosu: her satırın solunda yeşil + / gri −,
 * genişleyince kalemler + açıklama + CTA.
 */
export default function ExpandableMovementTable<T extends { id: number | string }>({
  columns,
  rows,
  emptyText = "Hareket yok",
  getNote,
  getCta,
  loadDetail,
  leadingRows,
  className,
}: ExpandableMovementTableProps<T>) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const [cache, setCache] = useState<Record<string, CacheEntry>>({});

  const toggle = useCallback(
    async (row: T) => {
      const key = String(row.id);
      const willOpen = !openIds.has(key);
      setOpenIds((prev) => {
        const next = new Set(prev);
        if (willOpen) next.add(key);
        else next.delete(key);
        return next;
      });
      if (!willOpen || !loadDetail) return;

      let shouldFetch = true;
      setCache((c) => {
        const existing = c[key];
        if (existing && !existing.loading && !existing.error) {
          shouldFetch = false;
          return c;
        }
        return { ...c, [key]: { ...(existing || {}), loading: true, error: null } };
      });
      if (!shouldFetch) return;

      try {
        const payload = (await loadDetail(row)) || {};
        setCache((c) => ({
          ...c,
          [key]: {
            lines: payload.lines || [],
            note: payload.note ?? null,
            userName: payload.userName ?? null,
            loading: false,
            error: null,
          },
        }));
      } catch (e) {
        setCache((c) => ({
          ...c,
          [key]: {
            lines: [],
            loading: false,
            error: e instanceof Error ? e.message : "Detay yüklenemedi",
          },
        }));
      }
    },
    [openIds, loadDetail],
  );

  const colCount = columns.length + 1;

  return (
    <div className={`bk-table-wrap ${className || ""}`.trim()}>
      <table className="bk-table">
        <thead>
          <tr>
            <th className="bk-expand-th" aria-label="Detay" />
            {columns.map((col) => (
              <th
                key={col.key}
                className={[
                  col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "",
                  col.className || "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leadingRows}
          {rows.map((row) => {
            const key = String(row.id);
            const open = openIds.has(key);
            const cta = getCta?.(row) ?? null;
            const note = getNote?.(row);
            return (
              <Fragment key={key}>
                <tr className="border-t border-slate-100">
                  <td className="bk-expand-td">
                    <ExpandToggle open={open} onClick={() => void toggle(row)} />
                  </td>
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={[
                        col.align === "right" ? "text-right tabular-nums" : "",
                        col.className || "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
                {open && (
                  <tr className="bk-expand-detail-row">
                    <td colSpan={colCount}>
                      <ExpandPanel detail={cache[key]} fallbackNote={note} cta={cta} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {rows.length === 0 && !leadingRows && (
            <tr>
              <td colSpan={colCount} className="text-center text-baykus-muted py-6">
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Helpers to map order/purchase lines into expand panel shape. */
export function linesFromOrder(order: {
  lines?: {
    quantity?: number;
    description?: string;
    size?: string | null;
    color?: string | null;
    unit_price?: number;
    line_total?: number;
  }[];
  notes?: string | null;
}): ExpandDetailPayload {
  const lines = (order.lines || []).map((l) => {
    const bits = [l.description || "Kalem"];
    if (l.size) bits.push(String(l.size));
    if (l.color) bits.push(String(l.color));
    const name = bits.join(" — ");
    const qty = Number(l.quantity ?? 1);
    return {
      label: `${qty} x ${name}`,
      price: Number(l.unit_price ?? 0),
      amount: Number(l.line_total ?? qty * Number(l.unit_price ?? 0)),
    };
  });
  return { lines, note: order.notes ?? null };
}

export function linesFromPurchase(purchase: {
  lines?: {
    quantity?: number;
    description?: string;
    product_name?: string | null;
    variant_name?: string | null;
    unit_cost?: number;
    line_total?: number;
  }[];
  notes?: string | null;
}): ExpandDetailPayload {
  const lines = (purchase.lines || []).map((l) => {
    const name =
      [l.product_name, l.variant_name].filter(Boolean).join(" / ") ||
      l.description ||
      "Kalem";
    const qty = Number(l.quantity ?? 1);
    return {
      label: `${qty} x ${name}`,
      price: Number(l.unit_cost ?? 0),
      amount: Number(l.line_total ?? qty * Number(l.unit_cost ?? 0)),
    };
  });
  return { lines, note: purchase.notes ?? null };
}
