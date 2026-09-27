"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BankAccount,
  CashRegister,
  apiFetch,
  formatMoney,
} from "@/lib/api";

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

type AccountOpt = {
  key: string;
  group: string;
  label: string;
  balance: number;
  cash_register_id?: number;
  bank_account_id?: number;
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

function groupForBank(b: BankAccount): string {
  const t = (b.account_type || "Banka").trim();
  if (/pos/i.test(t)) return "POS";
  if (/ortak|şirket ortağı|sirket ortagi/i.test(t)) return "Ortaklar";
  if (/kredi kart/i.test(t)) return "Kredi Kartı";
  return "Banka";
}

function fmtBal(n: number): string {
  return formatMoney(n).replace(/\s?₺$/, " TL").replace("₺", "TL");
}

export default function SplitPaymentRows({
  expectedTotal,
  value,
  onChange,
  mode = "tahsilat",
  autoFill = true,
  className = "",
  dense = false,
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
          apiFetch<CashRegister[]>("/api/finance/cash"),
          apiFetch<BankAccount[]>("/api/finance/banks?active_only=true"),
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

  const options = useMemo<AccountOpt[]>(() => {
    const opts: AccountOpt[] = [];
    for (const r of cashRegs) {
      opts.push({
        key: `cash:${r.id}`,
        group: "Kasa",
        label: `${r.name} (${fmtBal(Number(r.balance || 0))})`,
        balance: Number(r.balance || 0),
        cash_register_id: r.id,
      });
    }
    for (const b of banks) {
      opts.push({
        key: `bank:${b.id}`,
        group: groupForBank(b),
        label: `${b.name} (${fmtBal(Number(b.balance || 0))})`,
        balance: Number(b.balance || 0),
        bank_account_id: b.id,
      });
    }
    return opts;
  }, [cashRegs, banks]);

  const groups = useMemo(() => {
    const order = ["Kasa", "Banka", "POS", "Kredi Kartı", "Ortaklar"];
    const map = new Map<string, AccountOpt[]>();
    for (const o of options) {
      const list = map.get(o.group) || [];
      list.push(o);
      map.set(o.group, list);
    }
    const keys = [...order.filter((g) => map.has(g)), ...[...map.keys()].filter((g) => !order.includes(g))];
    return keys.map((g) => ({ group: g, items: map.get(g)! }));
  }, [options]);

  // Default first account once loaded
  useEffect(() => {
    if (!loaded || !options.length) return;
    setRows((prev) => {
      let changed = false;
      const next = prev.map((r) => {
        if (!r.accountKey || !options.some((o) => o.key === r.accountKey)) {
          changed = true;
          return { ...r, accountKey: options[0]!.key };
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
  const mismatch = expectedTotal > 0 && Math.abs(total - expectedTotal) > 0.02;
  const amountLabel = mode === "odeme" ? "Ödeme" : "Tahsilat";
  const totalLabel = mode === "odeme" ? "Toplam Ödenen" : "Toplam Tahsil Edilen";

  function updateRow(key: string, patch: Partial<SplitPaymentRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setManual(true);
    setRows((prev) => {
      const remaining = Math.max(0, expectedTotal - rowsSum(prev));
      const defaultKey = options[0]?.key || prev[0]?.accountKey || "";
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
        <div className="grid grid-cols-[1fr_7.5rem_auto] gap-2 items-end px-0.5">
          <div className="text-[11px] font-semibold text-baykus-muted">Kasa / Hesap</div>
          <div className="text-[11px] font-semibold text-baykus-muted">{amountLabel}</div>
          <div className="w-9" />
        </div>

        {rows.map((r, idx) => (
          <div key={r.key} className="grid grid-cols-[1fr_7.5rem_auto] gap-2 items-center">
            <select
              className="bk-input"
              value={r.accountKey}
              onChange={(e) => updateRow(r.key, { accountKey: e.target.value })}
            >
              {!r.accountKey && <option value="">Hesap seçin</option>}
              {groups.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <input
              className="bk-input tabular-nums text-right"
              inputMode="decimal"
              value={r.amount}
              onChange={(e) => {
                setManual(true);
                updateRow(r.key, { amount: e.target.value });
              }}
              placeholder="0,00"
            />
            <div className="flex flex-col gap-0.5 w-9">
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
