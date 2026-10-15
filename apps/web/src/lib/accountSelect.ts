import type { BankAccount, CashRegister } from "@/lib/api";
import { formatMoney } from "@/lib/api";

/** Display order for <optgroup> labels in every kasa/banka/hesap select. */
export const ACCOUNT_GROUP_ORDER = [
  "Kasa",
  "Banka Hesapları",
  "Kredi Kartları",
  "POS Hesapları",
  "Şirket Ortakları",
  "Diğer",
] as const;

export type AccountGroupLabel = (typeof ACCOUNT_GROUP_ORDER)[number];

export type AccountSelectOption = {
  /** "cash:12" | "bank:34" for unified; plain id string for cash/bank-only modes */
  value: string;
  label: string;
  group: AccountGroupLabel | string;
  sortName: string;
  kind: "cash" | "bank";
  id: number;
  balance: number;
  account_type?: string | null;
};

export type AccountSelectGroup = {
  group: string;
  items: AccountSelectOption[];
};

function trSort(a: string, b: string): number {
  return a.localeCompare(b, "tr", { sensitivity: "base" });
}

/** Map cash / bank account_type → optgroup label. */
export function resolveAccountGroup(
  kind: "cash" | "bank",
  accountType?: string | null,
): AccountGroupLabel {
  if (kind === "cash") return "Kasa";
  const t = (accountType || "Banka").trim();
  if (/kredi\s*kart/i.test(t)) return "Kredi Kartları";
  if (/^pos$/i.test(t) || /\bpos\b/i.test(t)) return "POS Hesapları";
  if (/ortak|şirket\s*ortağ|sirket\s*ortag/i.test(t)) return "Şirket Ortakları";
  if (/^banka$/i.test(t) || t === "") return "Banka Hesapları";
  return "Diğer";
}

function fmtBal(n: number): string {
  return formatMoney(n).replace(/\s?₺$/, " TL").replace("₺", "TL");
}

export type GroupAccountsArgs = {
  cash?: CashRegister[] | null;
  banks?: BankAccount[] | null;
  /** "unified" → cash:N / bank:N; "cash" | "bank" → numeric id string */
  mode?: "unified" | "cash" | "bank";
  /** Default true — skip is_active === false */
  activeOnly?: boolean;
  showBalance?: boolean;
  /** Append " · institution" on bank labels */
  showInstitution?: boolean;
  /** Unified key to omit (e.g. virman hedef ≠ çıkış) */
  excludeKey?: string | null;
};

/**
 * Build ordered optgroups for account selects.
 * Labels omit the type prefix inside their group (group header carries the type).
 */
export function groupAccountsForSelect(args: GroupAccountsArgs): AccountSelectGroup[] {
  const mode = args.mode ?? "unified";
  const activeOnly = args.activeOnly !== false;
  const showBalance = Boolean(args.showBalance);
  const showInstitution = Boolean(args.showInstitution);
  const excludeKey = args.excludeKey || null;

  const opts: AccountSelectOption[] = [];

  if (mode === "unified" || mode === "cash") {
    for (const r of args.cash || []) {
      if (activeOnly && r.is_active === false) continue;
      const value = mode === "unified" ? `cash:${r.id}` : String(r.id);
      if (excludeKey && value === excludeKey) continue;
      const bal = Number(r.balance || 0);
      opts.push({
        value,
        label: showBalance ? `${r.name} (${fmtBal(bal)})` : r.name,
        group: "Kasa",
        sortName: r.name || "",
        kind: "cash",
        id: r.id,
        balance: bal,
      });
    }
  }

  if (mode === "unified" || mode === "bank") {
    for (const b of args.banks || []) {
      if (activeOnly && b.is_active === false) continue;
      const value = mode === "unified" ? `bank:${b.id}` : String(b.id);
      if (excludeKey && value === excludeKey) continue;
      const bal = Number(b.balance || 0);
      const group = resolveAccountGroup("bank", b.account_type);
      let label = b.name || "";
      if (showInstitution && b.institution) label = `${label} · ${b.institution}`;
      if (showBalance) label = `${label} (${fmtBal(bal)})`;
      opts.push({
        value,
        label,
        group,
        sortName: b.name || "",
        kind: "bank",
        id: b.id,
        balance: bal,
        account_type: b.account_type,
      });
    }
  }

  const map = new Map<string, AccountSelectOption[]>();
  for (const o of opts) {
    const list = map.get(o.group) || [];
    list.push(o);
    map.set(o.group, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => trSort(a.sortName, b.sortName) || a.id - b.id);
  }

  const known = ACCOUNT_GROUP_ORDER.filter((g) => map.has(g));
  const rest = [...map.keys()]
    .filter((g) => !(ACCOUNT_GROUP_ORDER as readonly string[]).includes(g))
    .sort(trSort);
  return [...known, ...rest].map((g) => ({ group: g, items: map.get(g)! }));
}

/** Flat ordered options (same order as groups). */
export function flattenAccountGroups(groups: AccountSelectGroup[]): AccountSelectOption[] {
  return groups.flatMap((g) => g.items);
}
