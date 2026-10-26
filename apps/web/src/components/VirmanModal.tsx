"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { BankAccount, CashRegister, apiFetch, formatMoney } from "@/lib/api";
import { localToday } from "@/lib/dates";
import AccountSelect from "@/components/AccountSelect";
import { flattenAccountGroups, groupAccountsForSelect } from "@/lib/accountSelect";

export type VirmanAccountRef =
  | { kind: "cash"; id: number; name: string; balance: number }
  | { kind: "bank"; id: number; name: string; balance: number; account_type?: string };

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
  /** Prefill source account key "cash:1" | "bank:5" */
  defaultFromKey?: string | null;
  /** Prefill target account key (Kopyala) */
  defaultToKey?: string | null;
  /** Prefill amount / note (Kopyala) */
  defaultAmount?: string | number | null;
  defaultNote?: string | null;
  /** Kopya modu: başlık + başarı mesajı "Kopya oluşturuldu" */
  copyOfId?: number | null;
  cash?: CashRegister[];
  banks?: BankAccount[];
};

function keyOf(a: VirmanAccountRef): string {
  return `${a.kind}:${a.id}`;
}

function parseKey(key: string): { kind: "cash" | "bank"; id: number } | null {
  const m = /^(cash|bank):(\d+)$/.exec(key);
  if (!m) return null;
  return { kind: m[1] as "cash" | "bank", id: Number(m[2]) };
}

export default function VirmanModal({
  open,
  onClose,
  onSaved,
  defaultFromKey = null,
  defaultToKey = null,
  defaultAmount = null,
  defaultNote = null,
  copyOfId = null,
  cash: cashProp,
  banks: banksProp,
}: Props) {
  const [cash, setCash] = useState<CashRegister[]>(cashProp || []);
  const [banks, setBanks] = useState<BankAccount[]>(banksProp || []);
  const [fromKey, setFromKey] = useState("");
  const [toKey, setToKey] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => localToday());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(Boolean(cashProp && banksProp));

  useEffect(() => {
    if (!open) return;
    setError("");
    setAmount(defaultAmount != null && defaultAmount !== "" ? String(defaultAmount) : "");
    setNote(defaultNote || "");
    setDate(localToday());
    let cancelled = false;

    async function ensureAccounts() {
      try {
        let regs = cashProp;
        let accs = banksProp;
        if (!regs || !accs) {
          const [c, b] = await Promise.all([
            apiFetch<CashRegister[]>("/api/finance/cash?active=true"),
            apiFetch<BankAccount[]>("/api/finance/banks?active=true"),
          ]);
          regs = c;
          accs = b;
        }
        if (cancelled) return;
        setCash(regs.filter((r) => r.is_active !== false));
        setBanks(accs.filter((a) => a.is_active !== false));
        setLoaded(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Hesaplar yüklenemedi");
      }
    }

    void ensureAccounts();
    return () => {
      cancelled = true;
    };
  }, [open, cashProp, banksProp]);

  const options = useMemo<VirmanAccountRef[]>(() => {
    const groups = groupAccountsForSelect({ cash, banks, mode: "unified", showBalance: false });
    return flattenAccountGroups(groups).map((o) =>
      o.kind === "cash"
        ? { kind: "cash" as const, id: o.id, name: o.sortName, balance: o.balance }
        : {
            kind: "bank" as const,
            id: o.id,
            name: o.sortName,
            balance: o.balance,
            account_type: o.account_type || "Banka",
          },
    );
  }, [cash, banks]);

  useEffect(() => {
    if (!open || !loaded || !options.length) return;
    const preferred = defaultFromKey && options.some((o) => keyOf(o) === defaultFromKey)
      ? defaultFromKey
      : keyOf(options[0]!);
    setFromKey(preferred);
    if (
      defaultToKey &&
      defaultToKey !== preferred &&
      options.some((o) => keyOf(o) === defaultToKey)
    ) {
      setToKey(defaultToKey);
      return;
    }
    const toCandidate = options.find((o) => keyOf(o) !== preferred);
    setToKey(toCandidate ? keyOf(toCandidate) : "");
  }, [open, loaded, options, defaultFromKey, defaultToKey]);

  const fromAcc = options.find((o) => keyOf(o) === fromKey) || null;
  const toAcc = options.find((o) => keyOf(o) === toKey) || null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const from = parseKey(fromKey);
    const to = parseKey(toKey);
    const amt = Number(amount);
    if (!from || !to) {
      setError("Çıkış ve hedef hesap seçin");
      return;
    }
    if (fromKey === toKey) {
      setError("Çıkış ve hedef hesap aynı olamaz");
      return;
    }
    if (!(amt > 0)) {
      setError("Tutar sıfırdan büyük olmalıdır");
      return;
    }

    // Sunucu her bacağa "Virman çıkışı → hedef" / "Virman girişi ← kaynak" yazar; burada sadece ek not.
    const finalNote = note.trim() || null;

    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/finance/transfers", {
        method: "POST",
        body: JSON.stringify({
          amount: amt,
          movement_date: date || null,
          note: finalNote,
          from_cash: from.kind === "cash",
          from_bank_account_id: from.kind === "bank" ? from.id : null,
          to_cash: to.kind === "cash",
          to_bank_account_id: to.kind === "bank" ? to.id : null,
          from_cash_register_id: from.kind === "cash" ? from.id : null,
          to_cash_register_id: to.kind === "cash" ? to.id : null,
          cash_register_id:
            from.kind === "cash" ? from.id : to.kind === "cash" ? to.id : null,
        }),
      });
      onSaved(
        copyOfId
          ? `Kopya oluşturuldu · Virman ${formatMoney(amt)}`
          : `Virman kaydedildi · ${formatMoney(amt)}`,
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer hatası");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;


  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-3" role="dialog">
      <form
        onSubmit={submit}
        className="w-full max-w-lg rounded-xl border border-baykus-line bg-white shadow-xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 text-white" style={{ background: "#1f6feb" }}>
          <div>
            <div className="text-sm font-bold">
              Para Transferi / Virman{copyOfId ? ` · Kopya (#${copyOfId})` : ""}
            </div>
            <div className="text-[11px] opacity-90">Hesaplar arası transfer · kasa ↔ banka ↔ ortak</div>
          </div>
          <button type="button" className="text-white/90 text-xl leading-none px-1" onClick={onClose} aria-label="Kapat">
            ×
          </button>
        </div>

        <div className="p-4 space-y-3 text-sm">
          {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-xs">{error}</div>}

          <label className="block text-xs">
            <span className="text-baykus-muted block mb-0.5">Çıkış Hesabı *</span>
            <AccountSelect
              className="bk-input"
              mode="unified"
              cash={cash}
              banks={banks}
              value={fromKey}
              onChange={setFromKey}
              required
              showBalance
              placeholder=""
              hidePlaceholderWhenSelected
            />
          </label>

          <label className="block text-xs">
            <span className="text-baykus-muted block mb-0.5">Hedef Hesap *</span>
            <AccountSelect
              className="bk-input"
              mode="unified"
              cash={cash}
              banks={banks}
              value={toKey}
              onChange={setToKey}
              required
              showBalance
              excludeKey={fromKey}
              placeholder=""
              hidePlaceholderWhenSelected
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs">
              <span className="text-baykus-muted block mb-0.5">Tutar *</span>
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                className="bk-input"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
              />
            </label>
            <label className="block text-xs">
              <span className="text-baykus-muted block mb-0.5">Tarih</span>
              <input type="date" className="bk-input" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>

          <label className="block text-xs">
            <span className="text-baykus-muted block mb-0.5">Açıklama (opsiyonel)</span>
            <input
              className="bk-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ek not"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-baykus-line bg-slate-50">
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={onClose} disabled={busy}>
            İptal
          </button>
          <button type="submit" className="bk-btn text-xs text-white" style={{ background: "#1f6feb" }} disabled={busy || !loaded}>
            {busy ? "…" : "Transferi Tamamla"}
          </button>
        </div>
      </form>
    </div>
  );
}
