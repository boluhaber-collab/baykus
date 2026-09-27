"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import AccountDetailLedger from "@/components/AccountDetailLedger";
import StatusFooter from "@/components/StatusFooter";
import VirmanModal from "@/components/VirmanModal";
import {
  CashMovement,
  CashRegister,
  apiFetch,
} from "@/lib/api";
import { CASH_HAREKET_LABELS } from "@/lib/bhNote";

type Panel = "none" | "update" | "in" | "out";

export default function CashDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const [register, setRegister] = useState<CashRegister | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>("none");
  const [showVirman, setShowVirman] = useState(false);

  const [editName, setEditName] = useState("");
  const [editOpening, setEditOpening] = useState("0");

  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formNote, setFormNote] = useState("");
  const [formTypeOut, setFormTypeOut] = useState<"odeme" | "gider">("odeme");

  const load = useCallback(async () => {
    if (!Number.isFinite(id)) return;
    setError("");
    try {
      const [regs, movs] = await Promise.all([
        apiFetch<CashRegister[]>("/api/finance/cash"),
        apiFetch<CashMovement[]>(`/api/finance/cash/movements?cash_register_id=${id}&limit=2000`),
      ]);
      const reg = regs.find((r) => r.id === id) || null;
      setRegister(reg);
      setMovements(movs);
      if (reg) {
        setEditName(reg.name || "");
        setEditOpening(String(reg.opening_balance ?? 0));
      }
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
      await apiFetch(`/api/finance/cash/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName.trim(),
          opening_balance: Number(editOpening || 0),
        }),
      });
      setOkMsg("Kasa güncellendi");
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
      const movement_type =
        direction === "in" ? "tahsilat" : formTypeOut === "gider" ? "gider" : "odeme";
      await apiFetch("/api/finance/cash/movements", {
        method: "POST",
        body: JSON.stringify({
          movement_type,
          amount: Number(formAmount),
          movement_date: formDate || null,
          note: formNote.trim() || (direction === "in" ? "Para Girişi" : "Para Çıkışı"),
          cash_register_id: id,
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
    return <p className="text-red-600">Geçersiz kasa</p>;
  }

  const chip = (active: boolean, variant: string) =>
    `bk-party-chip bk-party-chip--${variant}${active ? " ring-2 ring-offset-1 ring-slate-400" : ""}`;

  const panelNode =
    panel === "update" ? (
      <form onSubmit={onUpdate} className="rounded border bg-white p-3 grid gap-2 sm:grid-cols-3 text-sm">
        <div className="sm:col-span-3 font-semibold">Kasa Güncelle</div>
        <label className="text-xs">
          <span className="text-baykus-muted block mb-0.5">Ad</span>
          <input required className="bk-input" value={editName} onChange={(e) => setEditName(e.target.value)} />
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
          {panel === "in" ? "Para Girişi / Tahsilat" : "Para Çıkışı / Ödeme"}
        </div>
        {panel === "out" ? (
          <label className="text-xs">
            <span className="block mb-0.5 opacity-80">Tip</span>
            <select
              className="bk-input"
              value={formTypeOut}
              onChange={(e) => setFormTypeOut(e.target.value as "odeme" | "gider")}
            >
              <option value="odeme">Ödeme</option>
              <option value="gider">Gider</option>
            </select>
          </label>
        ) : null}
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
        <label className="text-xs">
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
        title={register?.name || "…"}
        subtitle="Kasa"
        accountType="Kasa"
        balance={Number(register?.balance ?? 0)}
        error={error || (!register && !error ? "" : !register ? "Kasa bulunamadı" : "")}
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
        hareketFallback={CASH_HAREKET_LABELS}
        ledgerKind="cash"
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
        defaultFromKey={`cash:${id}`}
        onSaved={(msg) => {
          setOkMsg(msg);
          void load();
        }}
      />
      <StatusFooter onRefresh={load} />
    </>
  );
}
