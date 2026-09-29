"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  SUPPLIER_MOVEMENT_LABELS,
  SupplierDetail,
  SupplierStatement,
  apiFetch,
  downloadPdf,
  formatMoney,
} from "@/lib/api";
import { decodeHtmlEntities } from "@/lib/htmlEntities";
import StatusFooter from "@/components/StatusFooter";
import ExpandableMovementTable, {
  linesFromPurchase,
} from "@/components/ExpandableMovementTable";
import PartyCardLayout, { partySmsHref } from "@/components/PartyCardLayout";
import StatementPdfDateModal from "@/components/StatementPdfDateModal";
import SplitPaymentRows, {
  SplitPaymentRow,
  rowsSum,
  rowsToPayload,
} from "@/components/SplitPaymentRows";
import {
  belgeFromNote, detailFromBhNote, hareketLabel, isBhImportNote, sanitizeDisplayNote,
} from "@/lib/bhNote";
import type {
  PurchaseDetail,
  SupplierMovement,
  SupplierPurchaseBrief,
} from "@/lib/api";

export default function SupplierDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [supplier, setSupplier] = useState<SupplierDetail | null>(null);
  const [statement, setStatement] = useState<SupplierStatement | null>(null);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [showPdfDates, setShowPdfDates] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showSecondary, setShowSecondary] = useState(false);
  const [busy, setBusy] = useState(false);

  const [payType, setPayType] = useState<"payment" | "adjustment" | "purchase">("payment");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payNote, setPayNote] = useState("");
  const [paySide, setPaySide] = useState<"debit" | "credit">("credit");
  const [postFinance, setPostFinance] = useState(true);
  const [payRows, setPayRows] = useState<SplitPaymentRow[]>([]);
  const [payResetKey, setPayResetKey] = useState(0);

  const [editForm, setEditForm] = useState({
    code: "",
    name: "",
    email: "",
    phone: "",
    city: "",
    address: "",
    tax_number: "",
    tax_office: "",
    notes: "",
    is_active: true,
    opening_balance: "0",
  });

  const load = useCallback(async () => {
    setError("");
    try {
      const [detail, stmt] = await Promise.all([
        apiFetch<SupplierDetail>(`/api/suppliers/${id}`),
        apiFetch<SupplierStatement>(`/api/suppliers/${id}/statement`),
      ]);
      setSupplier(detail);
      setStatement(stmt);
      setEditForm({
        code: detail.code || "",
        name: detail.name || "",
        email: detail.email || "",
        phone: detail.phone || "",
        city: detail.city || "",
        address: detail.address || "",
        tax_number: detail.tax_number || "",
        tax_office: detail.tax_office || "",
        notes: detail.notes || "",
        is_active: detail.is_active !== false,
        opening_balance: String(detail.opening_balance ?? 0),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [id]);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    load();
  }, [id, load]);

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/suppliers/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          code: editForm.code.trim() || null,
          name: editForm.name.trim(),
          email: editForm.email.trim() || null,
          phone: editForm.phone.trim() || null,
          city: editForm.city.trim() || null,
          address: editForm.address.trim() || null,
          tax_number: editForm.tax_number.trim() || null,
          tax_office: editForm.tax_office.trim() || null,
          notes: editForm.notes.trim() || null,
          is_active: editForm.is_active,
          opening_balance: Number(editForm.opening_balance || 0),
        }),
      });
      setEditing(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Güncelleme hatası");
    } finally {
      setBusy(false);
    }
  }

  async function addMovement(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      let amount = Number(payAmount);
      const body: Record<string, unknown> = {
        movement_type: payType,
        movement_date: payDate || null,
        note: payNote.trim() || null,
      };
      if (payType === "adjustment") body.side = paySide;
      if (payType === "payment" && postFinance) {
        const payments = rowsToPayload(payRows);
        amount = rowsSum(payRows);
        if (!(amount > 0) || !payments.length) {
          throw new Error("En az bir kasa/hesap ödeme satırı girin.");
        }
        body.amount = amount;
        body.post_to_finance = true;
        body.payments = payments;
      } else {
        body.amount = amount;
      }
      await apiFetch(`/api/suppliers/${id}/movements`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setPayAmount("");
      setPayNote("");
      setPayRows([]);
      setPayResetKey((k) => k + 1);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hareket kaydı başarısız");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!confirm("Tedarikçiyi silmek istiyor musunuz?")) return;
    try {
      await apiFetch(`/api/suppliers/${id}`, { method: "DELETE" });
      router.push("/suppliers");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silme hatası");
    }
  }

  const payments = useMemo(() => {
    const moves = statement?.movements || [];
    return moves.filter(
      (m) =>
        m.movement_type === "payment" ||
        (m.movement_type === "adjustment" && Number(m.credit) > 0) ||
        (Number(m.credit) > 0 && m.movement_type !== "purchase"),
    );
  }, [statement]);

  /** Alış hareketleri (BizimHesap import — Purchase stub yok). */
  const purchaseMovements = useMemo(() => {
    const moves = statement?.movements || [];
    return moves.filter(
      (m) =>
        m.movement_type === "purchase" ||
        (Number(m.debit) > 0 && m.movement_type !== "payment"),
    );
  }, [statement]);

  type PurchasePanelRow = {
    id: string;
    source: "movement" | "purchase";
    date: string;
    no: string;
    status: string;
    amount: number;
    movement?: SupplierMovement;
    purchase?: SupplierPurchaseBrief;
  };

  const purchaseRows = useMemo(() => {
    const rows: PurchasePanelRow[] = [];
    const linked = new Set<number>();
    for (const m of purchaseMovements) {
      if (m.purchase_id) linked.add(m.purchase_id);
      const belge = belgeFromNote(m.note);
      rows.push({
        id: `m-${m.id}`,
        source: "movement",
        date: m.movement_date,
        no: belge || m.purchase_number || `A-${m.id}`,
        status: hareketLabel(m.movement_type, m.note, SUPPLIER_MOVEMENT_LABELS),
        amount: Number(m.debit) > 0 ? Number(m.debit) : Number(m.credit),
        movement: m,
      });
    }
    for (const p of supplier?.recent_purchases || []) {
      if (linked.has(p.id)) continue;
      rows.push({
        id: `p-${p.id}`,
        source: "purchase",
        date: p.purchase_date,
        no: p.purchase_number,
        status: p.status,
        amount: Number(p.total_amount),
        purchase: p,
      });
    }
    rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return rows;
  }, [purchaseMovements, supplier]);

  async function deletePurchaseRow(r: PurchasePanelRow) {
    try {
      if (isBhImportNote(r.movement?.note)) {
        throw new Error("BizimHesap aktarım kayıtları silinemez");
      }
      if (r.movement?.id) {
        await apiFetch(`/api/suppliers/${id}/movements/${r.movement.id}`, {
          method: "DELETE",
        });
      } else if (r.purchase?.id) {
        await apiFetch(`/api/purchases/${r.purchase.id}`, { method: "DELETE" });
      } else {
        throw new Error("Silinecek alış kaydı bulunamadı");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Alış silinemedi");
    }
  }

  async function deletePaymentRow(m: SupplierMovement) {
    try {
      if (isBhImportNote(m.note)) {
        throw new Error("BizimHesap aktarım kayıtları silinemez");
      }
      await apiFetch(`/api/suppliers/${id}/movements/${m.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ödeme silinemedi");
    }
  }

  if (!supplier && !error) {
    return <div className="text-slate-500">Yükleniyor…</div>;
  }
  if (!supplier) {
    return (
      <div>
        <p className="text-red-600 mb-4">{error}</p>
        <Link href="/suppliers" className="text-baykus-600 hover:underline">
          ← Listeye dön
        </Link>
      </div>
    );
  }

  const bal = Number(supplier.balance ?? 0);
  const smsHref = partySmsHref(supplier.phone);
  const addressLine = [supplier.address, supplier.city].filter(Boolean).join(" · ");
  const input =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-baykus-500";

  function scrollPay() {
    setShowSecondary(true);
    setTimeout(() => {
      document.getElementById("supplier-pay-form")?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }

  function openEkstre() {
    setShowSecondary(true);
    setTimeout(() => {
      document.getElementById("supplier-ekstre")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  function openStatementPdfModal() {
    setShowPdfDates(true);
  }

  async function downloadVoucherPdf() {
    try {
      const amount = Math.abs(Number(supplier?.balance ?? 0));
      const tip = Number(supplier?.balance ?? 0) > 0 ? "Borç Fişi" : "Alacak Fişi";
      const p = new URLSearchParams({
        tip,
        amount: String(amount),
        date: new Date().toISOString().slice(0, 10),
        note: "Hesap ekstresi",
      });
      await downloadPdf(
        `/api/suppliers/${id}/voucher-pdf?${p}`,
        `tedarikci-fis-${id}.pdf`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF hatası");
    }
  }

  const purchasesPanel = (
    <ExpandableMovementTable<PurchasePanelRow>
      rows={purchaseRows}
      limit={12}
      getDate={(r) => r.date}
      getDateTie={(r) => r.id}
      emptyText="Alış kaydı yok"
      onDelete={(r) => deletePurchaseRow(r)}
      canDelete={(r) => !isBhImportNote(r.movement?.note)}
      deleteConfirm={(r) =>
        `Alış ${r.no} (${formatMoney(r.amount)}) silinsin mi?\nStok ve tedarikçi cari + kasa/banka tersine çevrilir.`
      }
      getNote={(r) =>
        r.movement ? detailFromBhNote(r.movement.note, r.amount).note : null
      }
      getCta={(r) => {
        const pid = r.purchase?.id ?? r.movement?.purchase_id;
        return pid ? { href: `/purchases/${pid}`, label: "Alış ekranına git" } : null;
      }}
      loadDetail={async (r) => {
        const pid = r.purchase?.id ?? r.movement?.purchase_id;
        if (pid) {
          const purchase = await apiFetch<PurchaseDetail>(`/api/purchases/${pid}`);
          const detail = linesFromPurchase(purchase);
          if (r.movement?.note) {
            const fromNote = detailFromBhNote(r.movement.note, r.amount);
            return {
              lines: (detail.lines && detail.lines.length ? detail.lines : fromNote.lines),
              note: fromNote.note || detail.note || null,
            };
          }
          return detail;
        }
        return detailFromBhNote(r.movement?.note, r.amount);
      }}
      columns={[
        {
          key: "date",
          header: "Tarih",
          render: (r) => <span className="whitespace-nowrap">{r.date || "—"}</span>,
        },
        {
          key: "no",
          header: "No",
          render: (r) => {
            const pid = r.purchase?.id ?? r.movement?.purchase_id;
            if (pid) {
              return (
                <Link href={`/purchases/${pid}`} className="text-baykus-700 hover:underline">
                  {r.no}
                </Link>
              );
            }
            return <span className="font-medium text-slate-700">{r.no}</span>;
          },
        },
        {
          key: "status",
          header: "Durum",
          className: "text-red-700",
          render: (r) => r.status,
        },
        {
          key: "tutar",
          header: "Tutar",
          align: "right",
          render: (r) => formatMoney(r.amount),
        },
      ]}
    />
  );

  const paymentsPanel = (
    <ExpandableMovementTable<SupplierMovement>
      rows={payments}
      limit={12}
      getDate={(m) => m.movement_date}
      getDateTie={(m) => m.id}
      emptyText="Ödeme yok"
      onDelete={(m) => deletePaymentRow(m)}
      canDelete={(m) => !isBhImportNote(m.note)}
      deleteConfirm={(m) =>
        `Ödeme ${formatMoney(Number(m.credit) || Number(m.debit))} silinsin mi?\nTedarikçi cari + kasa/banka kaldırılır.`
      }
      getNote={(m) => detailFromBhNote(m.note).note}
      getCta={(m) =>
        m.purchase_id ? { href: `/purchases/${m.purchase_id}`, label: "Alış ekranına git" } : null
      }
      loadDetail={async (m) => {
        const amt = Number(m.credit) > 0 ? Number(m.credit) : Number(m.debit);
        if (!m.purchase_id) return detailFromBhNote(m.note, amt);
        const purchase = await apiFetch<PurchaseDetail>(`/api/purchases/${m.purchase_id}`);
        const detail = linesFromPurchase(purchase);
        const fromNote = detailFromBhNote(m.note, amt);
        return {
          lines: (detail.lines && detail.lines.length ? detail.lines : fromNote.lines),
          note: fromNote.note || detail.note || null,
        };
      }}
      columns={[
        {
          key: "date",
          header: "Tarih",
          render: (m) => <span className="whitespace-nowrap">{m.movement_date}</span>,
        },
        {
          key: "tutar",
          header: "Tutar",
          align: "right",
          render: (m) =>
            formatMoney(Number(m.credit) > 0 ? Number(m.credit) : Number(m.debit)),
        },
        {
          key: "sekli",
          header: "Şekli",
          render: (m) => hareketLabel(m.movement_type, m.note, SUPPLIER_MOVEMENT_LABELS),
        },
      ]}
    />
  );

  const returnsPanel = (
    <ExpandableMovementTable<{ id: number }>
      rows={[]}
      emptyText="İade kaydı yok"
      columns={[
        { key: "date", header: "Tarih", render: () => "—" },
        { key: "no", header: "No", render: () => "—" },
        { key: "status", header: "Durum", render: () => "—" },
        { key: "tutar", header: "Tutar", align: "right", render: () => "—" },
      ]}
    />
  );

  return (
    <>
      <PartyCardLayout
        role="supplier"
        breadcrumbHref="/suppliers"
        breadcrumbLabel="Tedarik Merkezi"
        title={supplier.name}
        contactPerson={null}
        phone={supplier.phone}
        address={addressLine || null}
        notes={supplier.notes}
        openBalance={bal}
        openBalanceSub={
          bal > 0 ? "tedarikçiye borç" : bal < 0 ? "tedarikçiden alacak" : "hesap kapalı"
        }
        error={error}
        okMsg={okMsg}
        actions={[
          {
            key: "alis",
            label: "Alış Yap",
            icon: "🛒",
            variant: "navy",
            menu: [
              { label: "Yeni alış", href: `/purchases/new?supplier_id=${id}` },
              { label: "Alış listesi", href: "/purchases" },
            ],
          },
          {
            key: "odeme",
            label: "Ödeme/Tahsilat",
            icon: "💵",
            variant: "green",
            onClick: () => {
              setPayType("payment");
              setPayAmount(bal > 0 ? String(bal) : "");
              scrollPay();
            },
            menu: [
              {
                label: "Ödeme kaydet",
                onClick: () => {
                  setPayType("payment");
                  scrollPay();
                },
              },
              {
                label: "Düzeltme",
                onClick: () => {
                  setPayType("adjustment");
                  scrollPay();
                },
              },
              { label: "Borç-Alacak Fişi", href: `/suppliers/payables?fis=1&supplier_id=${id}` },
            ],
          },
          {
            key: "ekstre",
            label: "Hesap Ekstresi",
            icon: "📑",
            variant: "white",
            onClick: openEkstre,
            menu: [
              {
                label: "Cari döküm PDF",
                onClick: openStatementPdfModal,
              },
              {
                label: "Hareketler / ekstre",
                onClick: openEkstre,
              },
              {
                label: "Borç-Alacak Fişi PDF",
                onClick: () => void downloadVoucherPdf(),
              },
              { label: "Borç listesi", href: "/suppliers/payables" },
            ],
          },
          {
            key: "sms",
            label: "SMS",
            icon: "💬",
            variant: "purple",
            href: smsHref || undefined,
            onClick: smsHref
              ? undefined
              : () => setError("Telefon yok — SMS/WhatsApp açılamaz"),
          },
          {
            key: "docs",
            label: "Dökümanlar",
            icon: "📁",
            variant: "cyan",
            href: "/documents",
          },
          {
            key: "diger",
            label: "Diğer",
            icon: "⚙️",
            variant: "yellow",
            menu: [
              {
                label: editing ? "Düzenlemeyi kapat" : "Kartı Düzenle",
                onClick: () => {
                  setEditing((v) => !v);
                  setShowSecondary(true);
                },
              },
              {
                label: showSecondary ? "Detay panellerini gizle" : "Ödeme formu / ekstre",
                onClick: () => setShowSecondary((v) => !v),
              },
              { label: "Borç listesi", href: "/suppliers/payables" },
              { label: "Sil", onClick: () => void onDelete() },
            ],
          },
        ]}
        leftPanels={[
          {
            key: "alislar",
            title: "Önceki Ürün/Hizmet Alışları",
            footerLabel: "tamamı için tıklayın...",
            footerOnClick: () => {
              setShowSecondary(true);
              setTimeout(openEkstre, 50);
            },
            children: purchasesPanel,
          },
        ]}
        rightPanels={[
          {
            key: "odemeler",
            title: "Önceki Ödemeler",
            footerLabel: "tamamı için tıklayın...",
            footerOnClick: () => {
              setShowSecondary(true);
              setTimeout(openEkstre, 50);
            },
            children: paymentsPanel,
          },
          {
            key: "iadeler",
            title: "Verdiğiniz İadeler",
            note: "İade modülü henüz yok — panel boş durum gösterir (sahte veri yok).",
            children: returnsPanel,
          },
        ]}
      >
        {(showSecondary || editing) && (
          <div className="space-y-4 mt-2">
            {editing && (
              <form
                onSubmit={saveEdit}
                data-baykus-save
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4"
              >
                <h2 className="font-semibold text-slate-800">Kartı düzenle</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  {(
                    [
                      ["code", "Kod"],
                      ["name", "Ünvan"],
                      ["email", "E-posta"],
                      ["phone", "Telefon"],
                      ["city", "Şehir"],
                      ["tax_number", "Vergi No"],
                      ["tax_office", "Vergi Dairesi"],
                      ["opening_balance", "Açılış bakiyesi"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key}>
                      <label className="block text-xs text-slate-500 mb-1">{label}</label>
                      <input
                        className={input}
                        value={editForm[key]}
                        onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                        required={key === "name"}
                      />
                    </div>
                  ))}
                  <div className="flex items-center gap-2 pt-6">
                    <input
                      id="edit-active"
                      type="checkbox"
                      checked={editForm.is_active}
                      onChange={(e) => setEditForm((f) => ({ ...f, is_active: e.target.checked }))}
                    />
                    <label htmlFor="edit-active" className="text-sm">
                      Aktif
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Adres</label>
                  <textarea
                    rows={2}
                    className={input}
                    value={editForm.address}
                    onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Notlar</label>
                  <textarea
                    rows={2}
                    className={input}
                    value={editForm.notes}
                    onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-lg bg-baykus-600 text-white px-4 py-2 text-sm disabled:opacity-60"
                  >
                    Kaydet
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
                  >
                    Vazgeç
                  </button>
                </div>
              </form>
            )}

            <div className="grid lg:grid-cols-2 gap-6">
              <form
                id="supplier-pay-form"
                onSubmit={addMovement}
                data-baykus-save
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"
              >
                <h2 className="font-semibold text-slate-800">Ödeme / hareket</h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Tip</label>
                    <select
                      className={input}
                      value={payType}
                      onChange={(e) => setPayType(e.target.value as typeof payType)}
                    >
                      <option value="payment">Ödeme</option>
                      <option value="adjustment">Düzeltme</option>
                      <option value="purchase">Satın alma (manuel)</option>
                    </select>
                  </div>
                  {!(payType === "payment" && postFinance) && (
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Tutar</label>
                      <input
                        required
                        type="number"
                        step="0.01"
                        min="0.01"
                        className={input}
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Tarih</label>
                    <input
                      type="date"
                      className={input}
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                    />
                  </div>
                  {payType === "adjustment" && (
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Yön</label>
                      <select
                        className={input}
                        value={paySide}
                        onChange={(e) => setPaySide(e.target.value as "debit" | "credit")}
                      >
                        <option value="debit">Borç artır</option>
                        <option value="credit">Borç azalt</option>
                      </select>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Not</label>
                  <input
                    className={input}
                    value={payNote}
                    onChange={(e) => setPayNote(e.target.value)}
                  />
                </div>
                {payType === "payment" && (
                  <div className="space-y-2 rounded-lg bg-slate-50 p-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={postFinance}
                        onChange={(e) => setPostFinance(e.target.checked)}
                      />
                      Kasaya / bankaya da kaydet (çoklu satır)
                    </label>
                    {postFinance && (
                      <SplitPaymentRows
                        key={payResetKey}
                        expectedTotal={Number(payAmount) || Number(supplier.balance) || 0}
                        mode="odeme"
                        autoFill={false}
                        dense
                        onChange={setPayRows}
                      />
                    )}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm disabled:opacity-60"
                >
                  Kaydet
                </button>
              </form>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-sm grid sm:grid-cols-2 gap-2 content-start">
                <div>
                  <span className="text-slate-500">Telefon:</span> {supplier.phone || "—"}
                </div>
                <div>
                  <span className="text-slate-500">E-posta:</span> {supplier.email || "—"}
                </div>
                <div>
                  <span className="text-slate-500">Vergi No:</span> {supplier.tax_number || "—"}
                </div>
                <div>
                  <span className="text-slate-500">Vergi Dairesi:</span>{" "}
                  {supplier.tax_office || "—"}
                </div>
                <div className="sm:col-span-2">
                  <span className="text-slate-500">Adres:</span> {supplier.address || "—"}
                </div>
                <div className="sm:col-span-2 text-xs text-slate-400">
                  Açılış: {formatMoney(Number(supplier.opening_balance ?? 0))}
                  {supplier.is_active === false ? " · Pasif" : ""}
                </div>
              </div>
            </div>

            <div
              id="supplier-ekstre"
              className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                <h2 className="font-semibold text-slate-800">Hesap Ekstresi / Hareketler</h2>
                {statement && (
                  <div className="text-xs text-slate-500">
                    Açılış {formatMoney(Number(statement.opening_balance))} · Kapanış{" "}
                    <span className="font-medium text-slate-800">
                      {formatMoney(Number(statement.closing_balance))}
                    </span>
                  </div>
                )}
              </div>
              <ExpandableMovementTable<SupplierMovement>
                rows={statement?.movements || []}
                    getDate={(m) => m.movement_date}
                    getDateTie={(m) => m.id}
                emptyText="Hareket yok"
                getNote={(m) => detailFromBhNote(m.note).note}
                getCta={(m) =>
                  m.purchase_id
                    ? { href: `/purchases/${m.purchase_id}`, label: "Alış ekranına git" }
                    : null
                }
                loadDetail={async (m) => {
                  const amt =
                    Number(m.debit) > 0 ? Number(m.debit) : Number(m.credit);
                  if (!m.purchase_id) return detailFromBhNote(m.note, amt);
                  const purchase = await apiFetch<PurchaseDetail>(
                    `/api/purchases/${m.purchase_id}`,
                  );
                  const detail = linesFromPurchase(purchase);
                  const fromNote = detailFromBhNote(m.note, amt);
                  return {
                    lines: (detail.lines && detail.lines.length ? detail.lines : fromNote.lines),
                    note: fromNote.note || detail.note || null,
                  };
                }}
                columns={[
                  {
                    key: "date",
                    header: "Tarih",
                    render: (m) => (
                      <span className="whitespace-nowrap">{m.movement_date}</span>
                    ),
                  },
                  {
                    key: "type",
                    header: "Tip",
                    render: (m) =>
                      hareketLabel(m.movement_type, m.note, SUPPLIER_MOVEMENT_LABELS),
                  },
                  {
                    key: "doc",
                    header: "Belge",
                    render: (m) =>
                      m.purchase_id ? (
                        <Link
                          href={`/purchases/${m.purchase_id}`}
                          className="text-baykus-600 hover:underline"
                        >
                          {m.purchase_number || `#${m.purchase_id}`}
                        </Link>
                      ) : (
                        "—"
                      ),
                  },
                  {
                    key: "note",
                    header: "Not",
                    className: "text-slate-500",
                    render: (m) => sanitizeDisplayNote(m.note) || "—",
                  },
                  {
                    key: "debit",
                    header: "Borç",
                    align: "right",
                    render: (m) =>
                      Number(m.debit) > 0 ? formatMoney(Number(m.debit)) : "—",
                  },
                  {
                    key: "credit",
                    header: "Alacak",
                    align: "right",
                    render: (m) =>
                      Number(m.credit) > 0 ? formatMoney(Number(m.credit)) : "—",
                  },
                  {
                    key: "bal",
                    header: "Bakiye",
                    align: "right",
                    className: "font-medium",
                    render: (m) =>
                      m.running_balance != null
                        ? formatMoney(Number(m.running_balance))
                        : "—",
                  },
                ]}
              />
            </div>
          </div>
        )}
      </PartyCardLayout>
      <StatusFooter onRefresh={load} />
      <StatementPdfDateModal
        open={showPdfDates}
        onClose={() => setShowPdfDates(false)}
        title="Cari döküm PDF"
        partyName={supplier.name}
        filename={`tedarikci_ekstre_${id}.pdf`}
        buildUrl={(from, to) => {
          const qs = new URLSearchParams();
          if (from) qs.set("from_date", from);
          if (to) qs.set("to_date", to);
          const q = qs.toString();
          return `/api/suppliers/${id}/statement-pdf${q ? `?${q}` : ""}`;
        }}
        onDone={(msg) => setOkMsg(msg)}
        onError={(msg) => setError(msg)}
      />
    </>
  );
}

