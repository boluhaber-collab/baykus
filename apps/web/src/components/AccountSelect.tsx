"use client";

import { useMemo } from "react";
import type { BankAccount, CashRegister } from "@/lib/api";
import {
  flattenAccountGroups,
  groupAccountsForSelect,
  type GroupAccountsArgs,
} from "@/lib/accountSelect";

type Props = {
  cash?: CashRegister[] | null;
  banks?: BankAccount[] | null;
  /** unified: cash:N / bank:N; cash | bank: numeric id string */
  mode?: GroupAccountsArgs["mode"];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  title?: string;
  showBalance?: boolean;
  showInstitution?: boolean;
  activeOnly?: boolean;
  excludeKey?: string | null;
  /** Hide empty placeholder once a value is set (SplitPaymentRows behaviour) */
  hidePlaceholderWhenSelected?: boolean;
};

/**
 * Shared kasa / banka / hesap <select> with logical <optgroup>s:
 * Kasa → Banka Hesapları → Kredi Kartları → POS Hesapları → Şirket Ortakları → Diğer.
 * Labels omit the type prefix inside each group.
 */
export default function AccountSelect({
  cash,
  banks,
  mode = "unified",
  value,
  onChange,
  placeholder = "Hesap seçin",
  className = "bk-input",
  required,
  disabled,
  id,
  name,
  title,
  showBalance = false,
  showInstitution = false,
  activeOnly = true,
  excludeKey = null,
  hidePlaceholderWhenSelected = false,
}: Props) {
  const groups = useMemo(
    () =>
      groupAccountsForSelect({
        cash,
        banks,
        mode,
        activeOnly,
        showBalance,
        showInstitution,
        excludeKey,
      }),
    [cash, banks, mode, activeOnly, showBalance, showInstitution, excludeKey],
  );

  const showPlaceholder = Boolean(placeholder) && !(hidePlaceholderWhenSelected && value);

  return (
    <select
      id={id}
      name={name}
      title={title}
      className={className}
      value={value}
      required={required}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {showPlaceholder && <option value="">{placeholder}</option>}
      {groups.map((g) => (
        <optgroup key={g.group} label={g.group}>
          {g.items.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export { flattenAccountGroups, groupAccountsForSelect };
