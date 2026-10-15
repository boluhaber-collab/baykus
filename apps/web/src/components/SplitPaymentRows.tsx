"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BankAccount,
  CashRegister,
  apiFetch,
  formatMoney,
} from "@/lib/api";
import AccountSelect from "@/components/AccountSelect";
import { flattenAccountGroups, groupAccountsForSelect } from "@/lib/accountSelect";

export type SplitPaymentRow = {
  key: string;
  /** "cash:12" | "bank:34" */
  accountKey: string;
  amount: string;
};

export type SplitPaymentPayload = {
  amount: number;
  cash_register_id?: number | null;
  bank_account_id?: number | null;
  method?: string;
};

type Props = {
  /** Expected document total (or remaining) for mismatch warning */
  expectedTotal: number;
  value?: SplitPaymentRow[];
  onChange?: (rows: SplitPaymentRow[]) => void;
  /** "tahsilat" (sales) | "odeme" (purchases) */
  mode?: "tahsilat" | "odeme";
  /** Auto-fill first row amount with expectedTotal when not touched */
  autoFill?: boolean;
  className?: string;
  /** Compact / embedded */
  dense?: boolean;
  /** Kısmi ödeme serbest (kalan cari borç) — eşleşmeme uyarısı yerine sadece fazla ödeme uyarısı */
  allowPartial?: boolean;
};

function newKey() {
  return Math.random().toString(36).slice(2, 10);
}

function parseAmount(s: string): number {
  const n = Number(String(s).replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function parseAccountKey(key: string): {
  cash_register_id?: number;
  bank_account_id?: number;
} {
  if (key.startsWith("cash:")) {
    const id = Number(key.slice(5));
    return Number.isFinite(id) && id > 0 ? { cash_register_id: id } : {};
  }
  if (key.startsWith("bank:")) {
    const id = Number(key.slice(5));
    return Number.isFinite(id) && id > 0 ? { bank_account_id: id } : {};
  }
  return {};
}

export function rowsToPayload(rows: SplitPaymentRow[]): SplitPaymentPayload[] {
  return rows
    .map((r) => {
      const amt = parseAmount(r.amount);
      const acc = parseAccountKey(r.accountKey);
      if (!(amt > 0) || (!acc.cash_register_id && !acc.bank_account_id)) return null;
      return {
        amount: amt,
        cash_register_id: acc.cash_register_id ?? null,
        bank_account_id: acc.bank_account_id ?? null,
        method: acc.cash_register_id ? "nakit" : "eft",
      };
    })
    .filter(Boolean) as SplitPaymentPayload[];
}

export function rowsSum(rows: SplitPaymentRow[]): number {
  return rows.reduce((s, r) => s + parseAmount(r.amount), 0);
}

export function rowsMatchExpected(rows: SplitPaymentRow[], expected: number, tol = 0.02): boolean {
  return Math.abs(rowsSum(rows) - expected) <= tol;
}

export default function SplitPaymentRows({
  expectedTotal,
  value,
  onChange,
  mode = "tahsilat",
  autoFill = true,
  className = "",
  dense = false,
  allowPartial = false,
}: Props) {
  const [cashRegs, setCashRegs] = useState<CashRegister[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [rows, setRows] = useState<SplitPaymentRow[]>(
    value?.length
      ? value
      : [{ key: newKey(), accountKey: "", amount: autoFill && expectedTotal > 0 ? expectedTotal.toFixed(2).replace(".", ",") : "" }],
  );
  const [manual, setManual] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [c, b] = await Promise.all([
          apiFetch<CashRegister[]>("/api/finance/cash?active=true"),
          apiFetch<BankAccount[]>("/api/finance/banks?active=true"),
        ]);
        if (cancelled) return;
        setCashRegs(c.filter((x) => x.is_active !== false));
        setBanks(b.filter((x) => x.is_active !== false));
      } catch {
        if (!cancelled) {
          setCashRegs([]);
          setBanks([]);
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(() => {
    const groups = groupAccountsForSelect({
      cash: cashRegs,
      banks,
      mode: "unified",
      showBalance: true,
    });
    return flattenAccountGroups(groups);
  }, [cashRegs, banks]);

  // Default first account once loaded
  useEffect(() => {
    if (!loaded || !options.length) return;
    setRows((prev) => {
      let changed = false;
      const next = prev.map((r) => {
        if (!r.accountKey || !options.some((o) => o.value === r.accountKey)) {
          changed = true;
          return { ...r, accountKey: options[0]!.value };
        }
        return r;
      });
      return changed ? next : prev;
    });
  }, [loaded, options]);

  // Auto-fill single-row amount from expectedTotal
  useEffect(() => {
    if (!autoFill || manual || rows.length !== 1) return;
    const amt = expectedTotal > 0 ? expectedTotal.toFixed(2).replace(".", ",") : "";
    setRows((prev) => {
      if (prev.length !== 1) return prev;
      if (prev[0]!.amount === amt) return prev;
      return [{ ...prev[0]!, amount: amt }];
    });
  }, [expectedTotal, autoFill, manual, rows.length]);

  // Notify parent when rows change
  useEffect(() => {
    onChange?.(rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const total = rowsSum(rows);
  const mismatch = allowPartial
    ? total > expectedTotal + 0.02
    : expectedTotal > 0 && Math.abs(total - expectedTotal) > 0.02;
  const amountLabel = mode === "odeme" ? "Ödeme" : "Tahsilat";
  const totalLabel = mode === "odeme" ? "Toplam Ödenen" : "Toplam Tahsil Edilen";

  function updateRow(key: string, patch: Partial<SplitPaymentRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setManual(true);
    setRows((prev) => {
      const remaining = Math.max(0, expectedTotal - rowsSum(prev));
      const defaultKey = options[0]?.value || prev[0]?.accountKey || "";
      return [
        ...prev,
        {
          key: newKey(),
          accountKey: defaultKey,
          amount: remaining > 0 ? remaining.toFixed(2).replace(".", ",") : "",
        },
      ];
    });
  }

  function removeRow(key: string) {
    setManual(true);
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  }

  return (
    <div className={`bk-split-pay ${className}`}>
      <div className={`grid gap-1 ${dense ? "text-xs" : "text-sm"}`}>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(5.5rem,7.5rem)_auto] gap-2 items-end px-0.5">
          <div className="text-[11px] font-semibold text-baykus-muted">Kasa / Hesap</div>
          <div className="text-[11px] font-semibold text-baykus-muted">{amountLabel}</div>
          <div className="w-9" />
        </div>

        {rows.map((r, idx) => (
          <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_minmax(5.5rem,7.5rem)_auto] gap-2 items-center">
            <AccountSelect
              className="bk-input min-w-0 truncate"
              mode="unified"
              cash={cashRegs}
              banks={banks}
              value={r.accountKey}
              onChange={(v) => updateRow(r.key, { accountKey: v })}
              placeholder="Hesap seçin"
              showBalance
              hidePlaceholderWhenSelected
            />
            <input
              className="bk-input min-w-0 tabular-nums text-right"
              inputMode="decimal"
              value={r.amount}
              onChange={(e) => {
                setManual(true);
                updateRow(r.key, { amount: e.target.value });
              }}
              placeholder="0,00"
            />
            <div className="flex flex-col items-center gap-0.5 w-9 shrink-0">
              {rows.length > 1 && (
                <button
                  type="button"
                  className="bk-split-pay-btn bk-split-pay-minus"
                  title="Satırı kaldır"
                  onClick={() => removeRow(r.key)}
                >
                  −
                </button>
              )}
              {idx === rows.length - 1 && (
                <button
                  type="button"
                  className="bk-split-pay-btn bk-split-pay-plus"
                  title="Ödeme satırı ekle"
                  onClick={addRow}
                >
                  +
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-[1fr_auto] gap-2 items-center">
        <span className="text-xs font-medium text-baykus-text">{totalLabel}</span>
        <span className={`text-base font-bold tabular-nums ${mismatch ? "text-red-600" : "text-baykus-text"}`}>
          {formatMoney(total)}
        </span>
      </div>
      {mismatch && (
        <div className="mt-1 rounded bg-amber-50 text-amber-900 text-[11px] px-2 py-1.5 border border-amber-200">
          Satır toplamı ({formatMoney(total)}) belge tutarı / kalan ({formatMoney(expectedTotal)}) ile
          eşleşmiyor. Kaydetmeden önce düzeltin.
        </div>
      )}
    </div>
  );
}
