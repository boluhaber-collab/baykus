"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BankAccount, CashRegister, apiFetch, formatMoney } from "@/lib/api";
import StatusFooter from "@/components/StatusFooter";
import VirmanModal from "@/components/VirmanModal";

/** BizimHesap panel-primary-ish cyan/blue */
const HEADER_BG = "#3b82f6";
const BODY_BG = "#fffbeb";

type AddKind = "Kasa" | "Banka" | "POS" | "Kredi Kartı" | "Şirket Ortağı" | null;

const CATEGORY_ORDER: { key: string; title: string; kind: "cash" | "bank"; type?: string }[] = [
  { key: "kasa", title: "Kasa Tanımları", kind: "cash" },
  { key: "banka", title: "Banka Hesapları", kind: "bank", type: "Banka" },
  { key: "pos", title: "POS", kind: "bank", type: "POS" },
  { key: "ortak", title: "Şirket Ortakları", kind: "bank", type: "Şirket Ortağı" },
  { key: "kart", title: "Kredi Kartları", kind: "bank", type: "Kredi Kartı" },
  { key: "veresiye", title: "Veresiye", kind: "bank", type: "Veresiye" },
];

export default function BanksPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [cash, setCash] = useState<CashRegister[]>([]);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassive, setShowPassive] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [addKind, setAddKind] = useState<AddKind>(null);
  const [showVirman, setShowVirman] = useState(false);

  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [iban, setIban] = useState("");
  const [opening, setOpening] = useState("0");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [banks, regs] = await Promise.all([
        apiFetch<BankAccount[]>("/api/finance/banks"),
        apiFetch<CashRegister[]>("/api/finance/cash"),
      ]);
      setAccounts(banks);
      setCash(regs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleCash = useMemo(
    () => (showPassive ? cash : cash.filter((r) => r.is_active !== false)),
    [cash, showPassive],
  );
  const visibleBanks = useMemo(
    () => (showPassive ? accounts : accounts.filter((a) => a.is_active !== false)),
    [accounts, showPassive],
  );

  function resetAddForm() {
    setName("");
    setInstitution("");
    setIban("");
    setOpening("0");
    setNotes("");
  }

  function openAdd(kind: AddKind) {
    setShowAddMenu(false);
    setAddKind(kind);
    resetAddForm();
    if (kind === "Şirket Ortağı") setInstitution("Şirket Ortakları");
    setOkMsg("");
    setError("");
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!addKind) return;
    setBusy(true);
    setError("");
    setOkMsg("");
    try {
      if (addKind === "Kasa") {
        await apiFetch("/api/finance/cash", {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            opening_balance: Number(opening || 0),
            currency: "TRY",
            is_active: true,
          }),
        });
      } else {
        await apiFetch("/api/finance/banks", {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            account_type: addKind,
            institution: institution.trim() || null,
            iban: iban.trim() || null,
            currency: "TRY",
            opening_balance: Number(opening || 0),
            is_active: true,
            notes: notes.trim() || null,
          }),
        });
      }
      setOkMsg(`${addKind} eklendi`);
      setAddKind(null);
      resetAddForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    } finally {
      setBusy(false);
    }
  }

  const isPartner = addKind === "Şirket Ortağı";

  function categoryItems(cat: (typeof CATEGORY_ORDER)[number]) {
    if (cat.kind === "cash") return visibleCash.map((r) => ({
      id: r.id,
      name: r.name,
      balance: Number(r.balance),
      href: `/finance/cash/${r.id}`,
      inactive: r.is_active === false,
    }));
    if (cat.type === "Veresiye") return []; // OOS / empty OK
    return visibleBanks
      .filter((a) => (a.account_type || "Banka") === cat.type)
      .map((a) => ({
        id: a.id,
        name: a.name,
        balance: Number(a.balance),
        href: `/finance/banks/${a.id}`,
        inactive: a.is_active === false,
      }));
  }

  // 2-col BH layout: left Kasa/POS/Kart · right Banka/Ortak/Veresiye
  const leftCats = CATEGORY_ORDER.filter((c) => ["kasa", "pos", "kart"].includes(c.key));
  const rightCats = CATEGORY_ORDER.filter((c) => ["banka", "ortak", "veresiye"].includes(c.key));

  function renderCategory(cat: (typeof CATEGORY_ORDER)[number]) {
    const items = categoryItems(cat);
    const sum = items.reduce((s, i) => s + i.balance, 0);
    return (
      <section key={cat.key} className="rounded-lg overflow-hidden border border-slate-200 shadow-sm bg-white">
        <header
          className="flex items-center justify-between px-3 py-2.5 text-white text-sm font-semibold"
          style={{ background: HEADER_BG }}
        >
          <span>{cat.title}</span>
          <span className="tabular-nums text-[13px]">{formatMoney(sum)}</span>
        </header>
        <div className="p-2.5 min-h-[64px] flex flex-wrap gap-2" style={{ background: BODY_BG }}>
          {items.map((item) => (
            <Link
              key={`${cat.key}-${item.id}`}
              href={item.href}
              className={`rounded border bg-white px-3 py-2 shadow-sm hover:ring-1 hover:ring-blue-300 min-w-[148px] ${
                item.inactive ? "opacity-60" : ""
              }`}
            >
              <div className="text-xs font-semibold text-slate-800 truncate" title={item.name}>
                {item.name}
                {item.inactive ? " (Pasif)" : ""}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                <strong className="text-slate-700">TL</strong>{" "}
                <span className="tabular-nums font-semibold text-slate-900">{formatMoney(item.balance)}</span>
              </div>
            </Link>
          ))}
          {items.length === 0 && (
            <div className="text-xs text-baykus-muted px-1 py-2">Hesap yok</div>
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-3 pb-2">
      <div className="bk-sticky-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-baykus-text leading-tight">Hesaplarım</h1>
          <p className="text-baykus-muted text-[11px]">Finans › Hesaplarım · BizimHesap düzeni</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/finance/cash" className="bk-btn bk-btn-ghost text-xs">
            Günlük Kasa
          </Link>
          <button
            type="button"
            className="bk-btn text-xs text-white"
            style={{ background: "#1f6feb" }}
            onClick={() => setShowVirman(true)}
          >
            ⇄ Para Transferi / Virman
          </button>
        </div>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {okMsg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{okMsg}</div>}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <button
            type="button"
            className="bk-btn text-xs text-white"
            style={{ background: "#198754" }}
            onClick={() => setShowAddMenu((v) => !v)}
          >
            + Yeni Hesap Ekle
          </button>
          {showAddMenu && (
            <div className="absolute z-20 mt-1 min-w-[200px] rounded border bg-white shadow-lg text-sm py-1">
              {(
                [
                  ["Kasa", "Kasa Ekle"],
                  ["Banka", "Banka Hesabı Ekle"],
                  ["POS", "POS Hesabı Ekle"],
                  ["Şirket Ortağı", "Ortaklar Hesabı Ekle"],
                  ["Kredi Kartı", "Kredi Kartı Ekle"],
                ] as const
              ).map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  className="block w-full text-left px-3 py-1.5 hover:bg-slate-50"
                  onClick={() => openAdd(kind)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <span
          className="inline-flex items-center rounded px-2.5 py-1.5 text-[11px] text-slate-500 border border-dashed border-slate-300 bg-slate-50"
          title="Banka entegrasyonu bu sürümde OOS"
        >
          + Yeni Banka Entegrasyonu (OOS)
        </span>

        <label className="ml-auto inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
          <span>Pasif hesapları da göster</span>
          <input
            type="checkbox"
            className="rounded border-slate-300"
            checked={showPassive}
            onChange={(e) => setShowPassive(e.target.checked)}
          />
        </label>
      </div>

      {addKind && (
        <form
          onSubmit={onCreate}
          className="rounded-lg border border-baykus-line bg-white p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm shadow-sm"
        >
          <div className="sm:col-span-2 lg:col-span-3 font-semibold text-slate-800 flex justify-between">
            <span>
              {addKind === "Kasa"
                ? "Kasa Ekle"
                : addKind === "Şirket Ortağı"
                  ? "Ortaklar Hesabı Ekle"
                  : `${addKind} Ekle`}
            </span>
            <button type="button" className="text-xs text-baykus-muted hover:underline" onClick={() => setAddKind(null)}>
              Kapat
            </button>
          </div>
          {addKind !== "Kasa" && (
            <label>
              <span className="text-[11px] text-baykus-muted">{isPartner ? "Hesap Grubu" : "Banka / Kurum"}</span>
              <input
                className="bk-input"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder={isPartner ? "Şirket Ortakları" : "Ziraat / İş Bankası"}
              />
            </label>
          )}
          <label>
            <span className="text-[11px] text-baykus-muted">
              {addKind === "Kasa" ? "Kasa Adı *" : isPartner ? "Ortak Adı *" : "Hesap Adı *"}
            </span>
            <input required className="bk-input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {addKind !== "Kasa" && (
            <label className="sm:col-span-2">
              <span className="text-[11px] text-baykus-muted">{isPartner ? "Kimlik / Referans" : "IBAN"}</span>
              <input className="bk-input" value={iban} onChange={(e) => setIban(e.target.value)} />
            </label>
          )}
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
          {addKind !== "Kasa" && (
            <label className="sm:col-span-2">
              <span className="text-[11px] text-baykus-muted">Not</span>
              <input className="bk-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          )}
          <div className="flex items-end">
            <button
              type="submit"
              disabled={busy}
              className="bk-btn bk-btn-primary w-full text-xs"
              style={{ background: "#0f766e" }}
            >
              {busy ? "…" : "Kaydet"}
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-3">{leftCats.map(renderCategory)}</div>
        <div className="space-y-3">{rightCats.map(renderCategory)}</div>
      </div>

      <VirmanModal
        open={showVirman}
        onClose={() => setShowVirman(false)}
        onSaved={(msg) => {
          setOkMsg(msg);
          void load();
        }}
        cash={cash}
        banks={accounts}
      />

      <StatusFooter onRefresh={load} />
    </div>
  );
}
