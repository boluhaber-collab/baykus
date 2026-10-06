"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useDateSort } from "@/hooks/useDateSort";
import SortableDateHeader from "@/components/SortableDateHeader";
import StatusFooter from "@/components/StatusFooter";
import {
  CASH_TYPE_LABELS,
  CashDailyPanel,
  CashMovement,
  BankAccount,
  CashRegister,
  apiFetch,
  formatMoney,
  statusBadgeClass,
} from "@/lib/api";

import { accountAciklama, isBhImportNote, sanitizeDisplayNote } from "@/lib/bhNote";
import { formatTrDate, localToday, toIsoDate } from "@/lib/dates";

type DailyMove = CashDailyPanel["movements"][number];

const CASH_TYPES = [
  { value: "tahsilat", label: "Tahsilat" },
  { value: "odeme", label: "Ödeme" },
  { value: "gider", label: "Gider" },
];

function todayStr() {
  return localToday();
}

export default function CashPage() {
  const [panel, setPanel] = useState<CashDailyPanel | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);

  const [formType, setFormType] = useState("tahsilat");
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState(todayStr);
  const [formCategory, setFormCategory] = useState("");
  const [formNote, setFormNote] = useState("");

  const [editing, setEditing] = useState<DailyMove | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editAccountId, setEditAccountId] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [okMsg, setOkMsg] = useState("");
  const [cashOptions, setCashOptions] = useState<CashRegister[]>([]);
  const [bankOptions, setBankOptions] = useState<BankAccount[]>([]);

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams({ from_date: fromDate, to_date: toDate });
      setPanel(await apiFetch<CashDailyPanel>(`/api/finance/cash/daily?${params}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // Balance screen: refresh when the tab is shown again, not on every focus click.
    let last = Date.now();
    function onVis() {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - last < 15_000) return;
      last = now;
      void load();
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch<CashMovement>("/api/finance/cash/movements", {
        method: "POST",
        body: JSON.stringify({
          movement_type: formType,
          amount: Number(formAmount),
          movement_date: formDate || null,
          category: formCategory.trim() || null,
          note: formNote.trim() || null,
        }),
      });
      setFormAmount("");
      setFormCategory("");
      setFormNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    } finally {
      setBusy(false);
    }
  }

  const isTransfer = Boolean(editing?.transfer_group_id);
  const editKind = editing?.ledger_kind === "bank" ? "bank" : editing ? "cash" : null;

  useEffect(() => {
    if (!editing || !editKind || isTransfer) return;
    let cancelled = false;
    (async () => {
      try {
        if (editKind === "cash") {
          const rows = await apiFetch<CashRegister[]>("/api/finance/cash?active=true");
          if (!cancelled) setCashOptions(rows);
        } else {
          const rows = await apiFetch<BankAccount[]>("/api/finance/banks?active=true");
          if (!cancelled) setBankOptions(rows);
        }
      } catch {
        /* picker optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editing, editKind, isTransfer]);

  function openEdit(m: DailyMove) {
    setOkMsg("");
    setError("");
    if (!m.id || !m.ledger_kind) {
      setError("Bu hareket düzenlenemez");
      return;
    }
    if (isBhImportNote(m.note)) {
      setError("BizimHesap aktarım kaydı — düzenlenemez");
      return;
    }
    setEditing(m);
    const amt = m.amount || m.in_amount || m.out_amount || 0;
    setEditAmount(String(amt));
    setEditDate(toIsoDate(m.date));
    setEditNote(accountAciklama(m.note) || sanitizeDisplayNote(m.note) || "");
    const accId = m.ledger_kind === "cash" ? m.cash_register_id : m.bank_account_id;
    setEditAccountId(accId != null ? String(accId) : "");
  }

  function closeEdit() {
    setEditing(null);
    setEditBusy(false);
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing || !editKind) return;
    const amt = Number(editAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Tutar 0'dan büyük olmalıdır");
      return;
    }
    setEditBusy(true);
    setError("");
    setOkMsg("");
    try {
      const body: Record<string, unknown> = {
        amount: amt,
        movement_date: editDate || null,
        note: editNote.trim() || null,
      };
      if (!isTransfer && editAccountId) {
        const idNum = Number(editAccountId);
        if (Number.isFinite(idNum) && idNum > 0) {
          if (editKind === "cash") body.cash_register_id = idNum;
          else body.bank_account_id = idNum;
        }
      }
      const path =
        editKind === "cash"
          ? `/api/finance/cash/movements/${editing.id}`
          : `/api/finance/bank-movements/${editing.id}`;
      await apiFetch(path, { method: "PUT", body: JSON.stringify(body) });
      setOkMsg(
        isTransfer
          ? "Hareket güncellendi (transfer eşleri + bağlı cari dahil)"
          : "Hareket güncellendi (kasa/banka + bağlı cari)",
      );
      closeEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Düzenleme hatası");
    } finally {
      setEditBusy(false);
    }
  }

  const s = panel?.summary;
  const orders = panel?.orders || [];
  const movements = panel?.movements || [];
  const {
    dir: orderDateDir,
    setDir: setOrderDateDir,
    sorted: sortedOrders,
  } = useDateSort(orders, (o) => o.date, (o) => o.id);
  const {
    dir: moveDateDir,
    setDir: setMoveDateDir,
    sorted: sortedMoves,
  } = useDateSort(movements, (m) => m.date, (m) => `${m.ledger_kind || m.source}-${m.id}-${m.date}`);

  const main = panel?.cash_register;

  const cards = s
    ? [
        { label: "Sipariş", value: String(s.order_count) },
        { label: "Ciro", value: formatMoney(s.revenue) },
        { label: "Tahsilat/Kapora", value: formatMoney(s.collections) },
        { label: "Kalan Alacak", value: formatMoney(s.remaining) },
        { label: "Maliyet", value: formatMoney(s.cost) },
        { label: "Brüt Kâr", value: formatMoney(s.gross_profit) },
        { label: "Gider", value: formatMoney(s.expense) },
        { label: "Net Kazanç", value: formatMoney(s.net_profit) },
        { label: "Teklif", value: String(s.quote_count) },
        { label: "Teslim Edilen", value: String(s.delivered_count) },
      ]
    : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Günlük Kasa</h2>
          <p className="text-xs text-baykus-muted">Finans › Günlük Kasa · masaüstü özet + hareketler</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/finance" className="bk-btn bk-btn-ghost text-xs">
            Finans özeti
          </Link>
          <Link href="/finance/banks" className="bk-btn bk-btn-ghost text-xs">
            Hesaplarım
          </Link>
          <button type="button" className="bk-btn bk-btn-primary text-xs" onClick={load}>
            Yenile
          </button>
        </div>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {okMsg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{okMsg}</div>}

      <div className="bk-filter-bar items-end">
        <label className="text-xs">
          <span className="text-baykus-muted block mb-0.5">Başlangıç</span>
          <input type="date" className="bk-input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label className="text-xs">
          <span className="text-baykus-muted block mb-0.5">Bitiş</span>
          <input type="date" className="bk-input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>
        <button
          type="button"
          className="bk-btn bk-btn-ghost text-xs"
          onClick={() => {
            const t = todayStr();
            setFromDate(t);
            setToDate(t);
          }}
        >
          Bugün
        </button>
        <button
          type="button"
          className="bk-btn bk-btn-ghost text-xs"
          onClick={() => {
            setFromDate("2020-01-01");
            setToDate(todayStr());
          }}
        >
          Tüm geçmiş
        </button>
        {main && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Link
              href={`/finance/cash/${main.id}`}
              className="bk-btn bk-btn-ghost text-xs"
            >
              Kasa ekstresi
            </Link>
            <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs">
              <span className="text-emerald-800">{main.name} · Açılış </span>
              <strong className="tabular-nums">{formatMoney(Number(main.opening_balance))}</strong>
              <span className="text-emerald-800"> · Bakiye </span>
              <strong className="tabular-nums text-emerald-900">{formatMoney(Number(main.balance))}</strong>
            </div>
          </div>
        )}
      </div>

      <div className="bk-kpi-strip" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
        {cards.slice(0, 5).map((c, i) => (
          <div
            key={c.label}
            className="bk-kpi-card"
            style={{ backgroundColor: ["#198754", "#c2185b", "#0f766e", "#f59e0b", "#334155"][i % 5] }}
          >
            <div className="min-w-0 flex-1 text-right">
              <div className="bk-kpi-label">{c.label}</div>
              <div className="bk-kpi-value truncate text-base">{c.value}</div>
            </div>
          </div>
        ))}
      </div>
      <fieldset className="rounded border border-slate-200 bg-white px-3 py-2">
        <legend className="px-1 text-xs font-semibold text-slate-600">Kasa Özeti (detay)</legend>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {cards.slice(5).map((c) => (
            <div key={c.label} className="rounded bg-slate-50 px-2.5 py-1.5">
              <div className="text-[10px] text-baykus-muted">{c.label}</div>
              <div className="text-sm font-bold tabular-nums">{c.value}</div>
            </div>
          ))}
        </div>
        {s && (
          <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-slate-600">
            <span>
              Tarih Aralığı: <strong>{formatTrDate(fromDate)}</strong> — <strong>{formatTrDate(toDate)}</strong>
            </span>
            <span>
              En Çok Satılan Ürün: <strong>{s.top_product}</strong>
            </span>
            <span>
              En Çok Kazandıran Kategori: <strong>{s.top_category}</strong>
            </span>
          </div>
        )}
      </fieldset>

      <div className="grid gap-3 lg:grid-cols-4">
        <form onSubmit={onSubmit} className="bk-card p-3 space-y-2 text-sm lg:col-span-1">
          <h3 className="font-semibold text-sm">Yeni kasa hareketi</h3>
          <select className="bk-input" value={formType} onChange={(e) => setFormType(e.target.value)}>
            {CASH_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            required
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Tutar ₺"
            className="bk-input"
            value={formAmount}
            onChange={(e) => setFormAmount(e.target.value)}
          />
          <input type="date" className="bk-input" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
          <input
            className="bk-input"
            placeholder="Kategori"
            value={formCategory}
            onChange={(e) => setFormCategory(e.target.value)}
          />
          <textarea
            className="bk-input"
            rows={2}
            placeholder="Not"
            value={formNote}
            onChange={(e) => setFormNote(e.target.value)}
          />
          <button type="submit" disabled={busy} className="bk-btn bk-btn-primary w-full text-xs">
            {busy ? "…" : "Kaydet"}
          </button>
        </form>

        <div className="lg:col-span-3 space-y-3">
          <div className="bk-table-wrap">
            <table className="bk-table">
              <thead>
                <tr>
                  <th>Sipariş No</th>
                  <th>Belge</th>
                  <th className="bk-th-sortable"><SortableDateHeader dir={orderDateDir} onChange={setOrderDateDir} /></th>
                  <th>Müşteri</th>
                  <th>Ürün</th>
                  <th className="text-right">Adet</th>
                  <th className="text-right">Toplam</th>
                  <th className="text-right">Kapora</th>
                  <th className="text-right">Kalan</th>
                  <th className="text-right">Maliyet</th>
                  <th className="text-right">Kâr</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {sortedOrders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={o.href} className="text-baykus-primary hover:underline font-medium">
                        {o.order_number}
                      </Link>
                    </td>
                    <td className="text-xs">{o.document_type}</td>
                    <td className="text-xs">{formatTrDate(o.date)}</td>
                    <td>
                      <div className="text-sm">{o.customer_name || "—"}</div>
                      <div className="text-[10px] text-baykus-muted">{o.customer_phone || ""}</div>
                    </td>
                    <td className="text-xs max-w-[180px] truncate">{o.products || "—"}</td>
                    <td className="text-right tabular-nums">{o.qty}</td>
                    <td className="text-right tabular-nums">{formatMoney(o.total_amount)}</td>
                    <td className="text-right tabular-nums text-emerald-700">{formatMoney(o.deposit_amount)}</td>
                    <td className="text-right tabular-nums text-amber-700">{formatMoney(o.remaining_amount)}</td>
                    <td className="text-right tabular-nums text-slate-600">{formatMoney(o.cost || 0)}</td>
                    <td className="text-right tabular-nums text-emerald-800">{formatMoney(o.profit || 0)}</td>
                    <td>
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${statusBadgeClass(o.status)}`}>
                        {o.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {sortedOrders.length === 0 && (
                  <tr>
                    <td colSpan={12} className="text-center text-baykus-muted py-6">
                      Aralıkta sipariş yok
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <fieldset className="rounded border border-slate-200 bg-white px-2 py-2">
            <legend className="px-1 text-xs font-semibold text-slate-600">Kasa / Banka Hareketleri</legend>
            {editing ? (
              <form
                onSubmit={(e) => void onSaveEdit(e)}
                className="mb-2 rounded border border-sky-200 bg-sky-50 p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm"
              >
                <div className="sm:col-span-2 lg:col-span-4 font-semibold text-slate-800">
                  Hareketi Düzenle · #{editing.id}
                  <span className="ml-2 font-normal text-baykus-muted">
                    ({editing.source} · {CASH_TYPE_LABELS[editing.movement_type] || editing.movement_type})
                  </span>
                  {isTransfer ? (
                    <span className="ml-2 text-xs font-normal text-amber-800">
                      Transfer — tutar/tarih/açıklama eş harekete + bağlı cariye de uygulanır
                    </span>
                  ) : null}
                </div>
                <label className="text-xs">
                  <span className="block mb-0.5 opacity-80">Tutar *</span>
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    className="bk-input"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                  />
                </label>
                <label className="text-xs">
                  <span className="block mb-0.5 opacity-80">Tarih</span>
                  <input
                    type="date"
                    className="bk-input"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                  />
                </label>
                {!isTransfer && editKind === "cash" && cashOptions.length > 0 ? (
                  <label className="text-xs">
                    <span className="block mb-0.5 opacity-80">Kasa</span>
                    <select
                      className="bk-input"
                      value={editAccountId}
                      onChange={(e) => setEditAccountId(e.target.value)}
                    >
                      {cashOptions.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {!isTransfer && editKind === "bank" && bankOptions.length > 0 ? (
                  <label className="text-xs">
                    <span className="block mb-0.5 opacity-80">Hesap</span>
                    <select
                      className="bk-input"
                      value={editAccountId}
                      onChange={(e) => setEditAccountId(e.target.value)}
                    >
                      {bankOptions.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                          {a.institution ? ` · ${a.institution}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className={`text-xs ${isTransfer ? "sm:col-span-2" : "sm:col-span-2 lg:col-span-2"}`}>
                  <span className="block mb-0.5 opacity-80">Açıklama</span>
                  <input
                    className="bk-input"
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    placeholder="İsteğe bağlı"
                  />
                </label>
                <div className="flex items-end gap-2 lg:col-span-4">
                  <button type="submit" disabled={editBusy} className="bk-btn bk-btn-primary text-xs">
                    {editBusy ? "…" : "Kaydet"}
                  </button>
                  <button
                    type="button"
                    className="bk-btn bk-btn-ghost text-xs"
                    disabled={editBusy}
                    onClick={closeEdit}
                  >
                    İptal
                  </button>
                </div>
              </form>
            ) : null}
            <div className="bk-table-wrap">
              <table className="bk-table">
                <thead>
                  <tr>
                    <th className="bk-th-sortable"><SortableDateHeader dir={moveDateDir} onChange={setMoveDateDir} /></th>
                    <th>Kaynak</th>
                    <th>Hesap</th>
                    <th>İşlem</th>
                    <th>Açıklama</th>
                    <th className="text-right">Giriş</th>
                    <th className="text-right">Çıkış</th>
                    <th>Ödeme Türü</th>
                    <th className="text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMoves.map((m, i) => {
                    const imported = isBhImportNote(m.note);
                    const canEdit = Boolean(m.id && m.ledger_kind) && !imported;
                    const rowHighlight = editing?.id === m.id && editing?.ledger_kind === m.ledger_kind
                      ? "bg-sky-50/80"
                      : undefined;
                    return (
                      <tr key={`${m.ledger_kind || m.source}-${m.id || i}-${m.date}`} className={rowHighlight}>
                        <td className="text-xs whitespace-nowrap">{formatTrDate(m.date)}</td>
                        <td className="text-xs">{m.source}</td>
                        <td className="text-xs">{m.account}</td>
                        <td className="text-xs">{CASH_TYPE_LABELS[m.movement_type] || m.movement_type}</td>
                        <td className="text-xs text-baykus-muted max-w-[200px] truncate">
                          {sanitizeDisplayNote(m.note) || "—"}
                        </td>
                        <td className="text-right tabular-nums text-emerald-700">
                          {m.in_amount ? formatMoney(m.in_amount) : ""}
                        </td>
                        <td className="text-right tabular-nums text-red-700">
                          {m.out_amount ? formatMoney(m.out_amount) : ""}
                        </td>
                        <td className="text-xs">{m.payment_type}</td>
                        <td className="text-right whitespace-nowrap">
                          {canEdit ? (
                            <button
                              type="button"
                              className="bk-btn bk-btn-ghost text-[11px] px-2 py-0.5"
                              onClick={() => openEdit(m)}
                            >
                              Düzenle
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled
                              title={
                                imported
                                  ? "BizimHesap aktarım kaydı — düzenlenemez"
                                  : "Düzenleme bu hareket için bağlı değil"
                              }
                              className="bk-btn bk-btn-ghost text-[11px] px-2 py-0.5 opacity-40 cursor-not-allowed"
                            >
                              Düzenle
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {(panel?.movements || []).length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center text-baykus-muted py-6">
                        Hareket yok
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </fieldset>
        </div>
      </div>

      <StatusFooter onRefresh={load} />
    </div>
  );
}