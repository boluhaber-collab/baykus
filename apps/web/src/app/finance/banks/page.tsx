"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BANK_ACCOUNT_TYPES, BankAccount, CashRegister, apiFetch, formatMoney } from "@/lib/api";

const TYPE_COLORS: Record<string, string> = {
  Banka: "#1d4ed8",
  POS: "#7c3aed",
  "Kredi Kartı": "#be123c",
  "Şirket Ortağı": "#0f766e",
};

export default function BanksPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [cash, setCash] = useState<CashRegister[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountType, setAccountType] = useState<string>("Banka");
  const [institution, setInstitution] = useState("");
  const [name, setName] = useState("");
  const [iban, setIban] = useState("");
  const [opening, setOpening] = useState("0");
  const [notes, setNotes] = useState("");
  const [cashOpening, setCashOpening] = useState("0");

  const load = useCallback(async () => {
    setError("");
    try {
      const [banks, regs] = await Promise.all([
        apiFetch<BankAccount[]>("/api/finance/banks"),
        apiFetch<CashRegister[]>("/api/finance/cash"),
      ]);
      setAccounts(banks);
      setCash(regs);
      if (regs[0]) setCashOpening(String(regs[0].opening_balance ?? 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byType = useMemo(() => {
    const map: Record<string, BankAccount[]> = {};
    for (const t of BANK_ACCOUNT_TYPES) map[t] = [];
    for (const a of accounts) {
      const t = a.account_type || "Banka";
      if (!map[t]) map[t] = [];
      map[t].push(a);
    }
    return map;
  }, [accounts]);

  const bankTotal = accounts
    .filter((a) => (a.account_type || "Banka") === "Banka")
    .reduce((s, a) => s + Number(a.balance), 0);
  const allTotal = accounts.reduce((s, a) => s + Number(a.balance), 0);
  const cashTotal = cash.reduce((s, r) => s + Number(r.balance), 0);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/finance/banks", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          account_type: accountType,
          institution: institution.trim() || null,
          iban: iban.trim() || null,
          currency: "TRY",
          opening_balance: Number(opening || 0),
          is_active: true,
          notes: notes.trim() || null,
        }),
      });
      setName("");
      setInstitution("");
      setIban("");
      setOpening("0");
      setNotes("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    } finally {
      setBusy(false);
    }
  }

  async function saveCashOpening() {
    const reg = cash[0];
    if (!reg) return;
    setBusy(true);
    try {
      await apiFetch(`/api/finance/cash/${reg.id}`, {
        method: "PATCH",
        body: JSON.stringify({ opening_balance: Number(cashOpening || 0) }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kasa devir hatası");
    } finally {
      setBusy(false);
    }
  }

  const isPartner = accountType === "Şirket Ortağı";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Hesaplarım</h2>
          <p className="text-xs text-baykus-muted">Finans › Hesaplarım · Banka / POS / Kart / Ortak</p>
        </div>
        <div className="flex gap-2">
          <Link href="/finance" className="bk-btn bk-btn-ghost text-xs">
            Finans özeti
          </Link>
          <Link href="/finance/cash" className="bk-btn bk-btn-ghost text-xs">
            Günlük Kasa
          </Link>
        </div>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <fieldset className="rounded border bg-white px-3 py-3">
        <legend className="px-1 text-xs font-semibold">Hesap Ekle / Güncelle</legend>
        <form onSubmit={onCreate} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <label>
            <span className="text-[11px] text-baykus-muted">Hesap Türü</span>
            <select className="bk-input" value={accountType} onChange={(e) => setAccountType(e.target.value)}>
              {BANK_ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-[11px] text-baykus-muted">{isPartner ? "Hesap Grubu" : "Banka / Kurum"}</span>
            <input
              className="bk-input"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              placeholder={isPartner ? "Şirket Ortakları" : "Ziraat / İş Bankası"}
            />
          </label>
          <label>
            <span className="text-[11px] text-baykus-muted">{isPartner ? "Ortak Adı" : "Hesap Adı"} *</span>
            <input required className="bk-input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="sm:col-span-2">
            <span className="text-[11px] text-baykus-muted">{isPartner ? "Kimlik / Referans" : "IBAN"}</span>
            <input className="bk-input" value={iban} onChange={(e) => setIban(e.target.value)} />
          </label>
          <label>
            <span className="text-[11px] text-baykus-muted">Devir Bakiye</span>
            <input
              type="number"
              step="0.01"
              className="bk-input"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
            />
          </label>
          <label className="sm:col-span-2 lg:col-span-2">
            <span className="text-[11px] text-baykus-muted">Not</span>
            <input className="bk-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={busy} className="bk-btn bk-btn-primary w-full" style={{ background: "#0f766e" }}>
              {busy ? "…" : "Kaydet"}
            </button>
          </div>
        </form>
      </fieldset>

      <fieldset className="rounded border bg-white px-3 py-2">
        <legend className="px-1 text-xs font-semibold">Finans Özeti</legend>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div>
            Banka Toplam: <strong className="tabular-nums text-blue-800">{formatMoney(bankTotal)}</strong>
          </div>
          <div>
            Tüm hesaplar: <strong className="tabular-nums">{formatMoney(allTotal)}</strong>
          </div>
          <div>
            Kasa Toplam: <strong className="tabular-nums text-emerald-800">{formatMoney(cashTotal)}</strong>
          </div>
          <label className="flex items-center gap-2 text-xs">
            Kasa Devir Bakiye
            <input
              type="number"
              step="0.01"
              className="bk-input w-28"
              value={cashOpening}
              onChange={(e) => setCashOpening(e.target.value)}
            />
          </label>
          <button type="button" className="bk-btn text-xs text-white" style={{ background: "#0f766e" }} onClick={saveCashOpening}>
            Kaydet
          </button>
        </div>
      </fieldset>

      <div className="grid md:grid-cols-2 gap-3">
        {BANK_ACCOUNT_TYPES.map((t) => {
          const list = byType[t] || [];
          const sum = list.reduce((s, a) => s + Number(a.balance), 0);
          const color = TYPE_COLORS[t] || "#334155";
          return (
            <div key={t} className="rounded border overflow-hidden bg-[#fffde7]">
              <div className="flex justify-between px-3 py-2 text-white text-sm font-semibold" style={{ background: color }}>
                <span>{t}</span>
                <span className="tabular-nums">{formatMoney(sum)}</span>
              </div>
              <div className="p-2 flex flex-wrap gap-2 min-h-[72px]">
                {list.map((a) => (
                  <Link
                    key={a.id}
                    href={`/finance/banks/${a.id}`}
                    className="rounded border bg-white px-3 py-2 shadow-sm hover:ring-1 hover:ring-blue-300 min-w-[140px]"
                  >
                    <div className="text-xs font-semibold">{a.name}</div>
                    <div className="text-[10px] text-baykus-muted">{a.institution || a.iban || "—"}</div>
                    <div className="text-sm font-bold tabular-nums mt-1">{formatMoney(Number(a.balance))}</div>
                  </Link>
                ))}
                {list.length === 0 && <div className="text-xs text-baykus-muted px-2 py-3">Hesap yok</div>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Tür</th>
              <th>Hesap</th>
              <th>Kurum</th>
              <th>IBAN</th>
              <th className="text-right">Bakiye</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td>
                  <span
                    className="inline-block rounded px-1.5 py-0.5 text-[10px] text-white"
                    style={{ background: TYPE_COLORS[a.account_type || "Banka"] || "#64748b" }}
                  >
                    {a.account_type || "Banka"}
                  </span>
                </td>
                <td className="font-medium">
                  <Link href={`/finance/banks/${a.id}`} className="text-baykus-primary hover:underline">
                    {a.name}
                  </Link>
                </td>
                <td className="text-xs">{a.institution || "—"}</td>
                <td className="font-mono text-[11px]">{a.iban || "—"}</td>
                <td className="text-right tabular-nums font-semibold">{formatMoney(Number(a.balance))}</td>
                <td className="text-right text-xs">
                  <Link href={`/finance/banks/${a.id}`} className="text-baykus-primary hover:underline">
                    Hareketler
                  </Link>
                </td>
              </tr>
            ))}
            {accounts.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-baykus-muted py-8">
                  Hesap yok — yukarıdan ekleyin
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
