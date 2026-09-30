"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import AccountDetailLedger from "@/components/AccountDetailLedger";
import StatusFooter from "@/components/StatusFooter";
import VirmanModal from "@/components/VirmanModal";
import {
  BankAccount,
  BankMovement,
  apiFetch,
} from "@/lib/api";
import { BANK_HAREKET_LABELS, sanitizeDisplayNote } from "@/lib/bhNote";

type Panel = "none" | "update" | "in" | "out";

export default function BankDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const [account, setAccount] = useState<BankAccount | null>(null);
  const [movements, setMovements] = useState<BankMovement[]>([]);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>("none");
  const [showVirman, setShowVirman] = useState(false);

  // Update form
  const [editName, setEditName] = useState("");
  const [editInstitution, setEditInstitution] = useState("");
  const [editAccountType, setEditAccountType] = useState("Banka");
  const [editIban, setEditIban] = useState("");
  const [editOpening, setEditOpening] = useState("0");
  const [editNotes, setEditNotes] = useState("");
  const [editActive, setEditActive] = useState(true);

  // Para giriş/çıkış
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formNote, setFormNote] = useState("");

  const load = useCallback(async () => {
    if (!Number.isFinite(id)) return;
    setError("");
    try {
      const [acc, movs] = await Promise.all([
        apiFetch<BankAccount>(`/api/finance/banks/${id}`),
        apiFetch<BankMovement[]>(`/api/finance/banks/${id}/movements?limit=2000`),
      ]);
      setAccount(acc);
      setMovements(movs);
      setEditName(acc.name || "");
      setEditInstitution(acc.institution || "");
      setEditAccountType(acc.account_type || "Banka");
      setEditIban(acc.iban || "");
      setEditOpening(String(acc.opening_balance ?? 0));
      // API already strips BH_IMPORT; sanitize again for safety
      setEditNotes(sanitizeDisplayNote(acc.notes) || "");
      setEditActive(acc.is_active !== false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  function openPanel(p: Panel) {
    setOkMsg("");
    setError("");
    setPanel((cur) => (cur === p ? "none" : p));
  }

  async function onUpdate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setOkMsg("");
    try {
      await apiFetch(`/api/finance/banks/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: editName.trim(),
          institution: editInstitution.trim() || null,
          account_type: editAccountType.trim() || "Banka",
          iban: editIban.trim() || null,
          opening_balance: Number(editOpening || 0),
          notes: editNotes.trim() || null,
          is_active: editActive,
        }),
      });
      setOkMsg("Hesap güncellendi");
      setPanel("none");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Güncelleme hatası");
    } finally {
      setBusy(false);
    }
  }

  async function onMoneyMove(e: FormEvent, direction: "in" | "out") {
    e.preventDefault();
    setBusy(true);
    setError("");
    setOkMsg("");
    try {
      await apiFetch(`/api/finance/banks/${id}/movements`, {
        method: "POST",
        body: JSON.stringify({
          movement_type: direction === "in" ? "deposit" : "withdrawal",
          amount: Number(formAmount),
          movement_date: formDate || null,
          note: formNote.trim() || (direction === "in" ? "Para Girişi" : "Para Çıkışı"),
        }),
      });
      setFormAmount("");
      setFormNote("");
      setOkMsg(direction === "in" ? "Para girişi kaydedildi" : "Para çıkışı kaydedildi");
      setPanel("none");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    } finally {
      setBusy(false);
    }
  }


  if (!Number.isFinite(id)) {
    return <p className="text-red-600">Geçersiz hesap</p>;
  }

  const chip = (active: boolean, variant: string) =>
    `bk-party-chip bk-party-chip--${variant}${active ? " ring-2 ring-offset-1 ring-slate-400" : ""}`;

  const panelNode =
    panel === "update" ? (
      <form onSubmit={onUpdate} className="rounded border bg-white p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
        <div className="sm:col-span-2 lg:col-span-3 font-semibold text-slate-800">Hesap Güncelle</div>
        <label className="text-xs">
          <span className="text-baykus-muted block mb-0.5">Hesap Türü</span>
          <select className="bk-input" value={editAccountType} onChange={(e) => setEditAccountType(e.target.value)}>
            <option value="Banka">Banka</option>
            <option value="POS">POS</option>
            <option value="Kredi Kartı">Kredi Kartı</option>
            <option value="Şirket Ortağı">Şirket Ortağı</option>
          </select>
        </label>
        <label className="text-xs">
          <span className="text-baykus-muted block mb-0.5">
            {editAccountType === "Şirket Ortağı" ? "Hesap Grubu" : "Banka / Kurum"}
          </span>
          <input
            className="bk-input"
            value={editInstitution}
            onChange={(e) => setEditInstitution(e.target.value)}
            placeholder={editAccountType === "Şirket Ortağı" ? "Şirket Ortakları" : "Örn. VakıfBank"}
          />
        </label>
        <label className="text-xs">
          <span className="text-baykus-muted block mb-0.5">
            {editAccountType === "Şirket Ortağı" ? "Ortak Adı" : "Hesap Adı"}
          </span>
          <input
            required
            className="bk-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder={editAccountType === "Şirket Ortağı" ? "Örn. Engin KARAGÖZ" : "Örn. 6972"}
          />
        </label>
        <label className="text-xs">
          <span className="text-baykus-muted block mb-0.5">
            {editAccountType === "Şirket Ortağı" ? "Kimlik / Referans" : "IBAN"}
          </span>
          <input className="bk-input font-mono" value={editIban} onChange={(e) => setEditIban(e.target.value)} />
        </label>
        <label className="text-xs">
          <span className="text-baykus-muted block mb-0.5">Devir Bakiye</span>
          <input
            type="number"
            step="0.01"
            className="bk-input"
            value={editOpening}
            onChange={(e) => setEditOpening(e.target.value)}
          />
        </label>
        <label className="text-xs flex items-center gap-2 self-end pb-1">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={editActive}
            onChange={(e) => setEditActive(e.target.checked)}
          />
          <span className="text-slate-700">
            {editActive ? "Aktif" : "Pasif"}
            <span className="text-baykus-muted font-normal"> — pasif hesap seçicilerde ve Ana Sayfa bakiyesinde gizlenir</span>
          </span>
        </label>
        <label className="text-xs sm:col-span-2 lg:col-span-3">
          <span className="text-baykus-muted block mb-0.5">Not</span>
          <input
            className="bk-input"
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            placeholder="İsteğe bağlı açıklama (aktarım etiketleri gösterilmez)"
          />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" disabled={busy} className="bk-btn bk-btn-primary text-xs">
            {busy ? "…" : "Kaydet"}
          </button>
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => setPanel("none")}>
            İptal
          </button>
        </div>
      </form>
    ) : panel === "in" || panel === "out" ? (
      <form
        onSubmit={(e) => onMoneyMove(e, panel === "in" ? "in" : "out")}
        className={`rounded border p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm ${
          panel === "in" ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
        }`}
      >
        <div className="sm:col-span-2 lg:col-span-4 font-semibold">
          {panel === "in" ? "Para Girişi" : "Para Çıkışı"}
        </div>
        <label className="text-xs">
          <span className="block mb-0.5 opacity-80">Tutar *</span>
          <input
            required
            type="number"
            min="0.01"
            step="0.01"
            className="bk-input"
            value={formAmount}
            onChange={(e) => setFormAmount(e.target.value)}
          />
        </label>
        <label className="text-xs">
          <span className="block mb-0.5 opacity-80">Tarih</span>
          <input type="date" className="bk-input" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
        </label>
        <label className="text-xs sm:col-span-2">
          <span className="block mb-0.5 opacity-80">Açıklama</span>
          <input className="bk-input" value={formNote} onChange={(e) => setFormNote(e.target.value)} />
        </label>
        <div className="flex items-end gap-2 lg:col-span-4">
          <button type="submit" disabled={busy} className="bk-btn bk-btn-primary text-xs">
            {busy ? "…" : "Kaydet"}
          </button>
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => setPanel("none")}>
            İptal
          </button>
        </div>
      </form>
    ) : null;

  return (
    <>
      <AccountDetailLedger
        breadcrumbHref="/finance/banks"
        breadcrumbLabel="Hesaplarım"
        title={account?.name || "…"}
        subtitle={
          [account?.institution, account?.iban].filter(Boolean).join(" · ") || null
        }
        accountType={account?.account_type || null}
        inactive={account?.is_active === false}
        balance={Number(account?.balance ?? 0)}
        error={error}
        okMsg={okMsg}
        actions={
          <>
            <button type="button" className={chip(panel === "update", "navy")} onClick={() => openPanel("update")}>
              Güncelle
            </button>
            <button type="button" className={chip(panel === "in", "green")} onClick={() => openPanel("in")}>
              Para Girişi
            </button>
            <button type="button" className={chip(panel === "out", "orange")} onClick={() => openPanel("out")}>
              Para Çıkışı
            </button>
            <button
              type="button"
              className={chip(showVirman, "purple")}
              onClick={() => {
                setPanel("none");
                setShowVirman(true);
              }}
            >
              Para Transferi / Virman
            </button>
            <Link href="/documents" className="bk-party-chip bk-party-chip--cyan">
              Dökümanlar
            </Link>
            <Link href="/finance/cash" className="bk-party-chip bk-party-chip--white">
              Günlük Kasa
            </Link>
          </>
        }
        panel={panelNode}
        movements={movements}
        hareketFallback={BANK_HAREKET_LABELS}
        ledgerKind="bank"
        onRowMutated={load}
        onRowError={(msg) => {
          setOkMsg("");
          setError(msg);
        }}
        onRowOk={(msg) => {
          setError("");
          setOkMsg(msg);
        }}
      />
      <VirmanModal
        open={showVirman}
        onClose={() => setShowVirman(false)}
        defaultFromKey={`bank:${id}`}
        onSaved={(msg) => {
          setOkMsg(msg);
          void load();
        }}
      />
      <StatusFooter onRefresh={load} />
    </>
  );
}
