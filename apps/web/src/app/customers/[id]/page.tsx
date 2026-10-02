"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  CARI_TYPE_LABELS,
  CustomerDetail,
  CustomerStatement,
  WhatsAppTemplate,
  apiFetch,
  formatMoney,
  statusBadgeClass,
  quoteStatusBadgeClass,
} from "@/lib/api";
import { decodeHtmlEntities } from "@/lib/htmlEntities";
import CustomerTahsilatModal from "@/components/CustomerTahsilatModal";
import SplitPaymentRows, {
  SplitPaymentRow,
  rowsSum,
  rowsToPayload,
} from "@/components/SplitPaymentRows";
import { localToday } from "@/lib/dates";
import CustomerDevirModal from "@/components/CustomerDevirModal";
import StatementPdfDateModal from "@/components/StatementPdfDateModal";
import StatusFooter from "@/components/StatusFooter";
import ExpandableMovementTable, {
  linesFromOrder,
} from "@/components/ExpandableMovementTable";
import PartyCardLayout, { partySmsHref } from "@/components/PartyCardLayout";
import {
  belgeFromNote, detailFromBhNote, hareketLabel, isBhImportNote, sanitizeDisplayNote,
} from "@/lib/bhNote";
import type { CariMovement, CustomerOrderBrief, OrderDetail } from "@/lib/api";

type TabKey = "bilgi" | "hareketler" | "siparisler" | "notlar" | "whatsapp";

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [statement, setStatement] = useState<CustomerStatement | null>(null);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<TabKey>("bilgi");
  const [showSecondary, setShowSecondary] = useState(false);
  const [showTahsilat, setShowTahsilat] = useState(false);
  const [showDevir, setShowDevir] = useState(false);
  const [showPdfDates, setShowPdfDates] = useState(false);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);

  const [payType, setPayType] = useState<"payment" | "deposit" | "adjustment" | "sale">("payment");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(() => localToday());
  const [payNote, setPayNote] = useState("");
  const [paySide, setPaySide] = useState<"debit" | "credit">("credit");
  const [payRows, setPayRows] = useState<SplitPaymentRow[]>([]);
  const [payResetKey, setPayResetKey] = useState(0);

  const [editForm, setEditForm] = useState({
    code: "",
    name: "",
    company: "",
    email: "",
    phone: "",
    city: "",
    address: "",
    tax_number: "",
    tax_office: "",
    notes: "",
    is_active: true,
    special_day_note: "",
    special_day_date: "",
    opening_balance: "0",
  });

  const load = useCallback(async () => {
    setError("");
    try {
      const [detail, stmt] = await Promise.all([
        apiFetch<CustomerDetail>(`/api/customers/${id}`),
        apiFetch<CustomerStatement>(`/api/customers/${id}/statement`),
      ]);
      setCustomer(detail);
      setStatement(stmt);
      setEditForm({
        code: detail.code || "",
        name: detail.name || "",
        company: detail.company || "",
        email: detail.email || "",
        phone: detail.phone || "",
        city: detail.city || "",
        address: detail.address || "",
        tax_number: detail.tax_number || "",
        tax_office: detail.tax_office || "",
        notes: detail.notes || "",
        is_active: detail.is_active !== false,
        special_day_note: detail.special_day_note || "",
        special_day_date: detail.special_day_date || "",
        opening_balance: String(detail.opening_balance ?? 0),
      });
      const bal = Number(detail.balance ?? 0);
      if (bal > 0) setPayAmount(String(bal));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [id]);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    load();
  }, [id, load]);

  // Re-fetch balances when returning to this tab after a sale/tahsilat elsewhere
  useEffect(() => {
    function onVis() {
      if (document.visibilityState === "visible" && Number.isFinite(id)) void load();
    }
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [id, load]);

  useEffect(() => {
    apiFetch<WhatsAppTemplate[]>("/api/whatsapp/templates")
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, []);

  const ozet = useMemo(() => {
    const moves = statement?.movements || [];
    const totalBorc =
      Number(statement?.opening_balance ?? customer?.opening_balance ?? 0) +
      moves.reduce((s, m) => s + Number(m.debit || 0), 0);
    const totalTahsilat = moves.reduce((s, m) => s + Number(m.credit || 0), 0);
    const orders = customer?.recent_orders || [];
    const last = orders[0];
    return {
      acik: Number(customer?.balance ?? statement?.closing_balance ?? 0),
      toplamBorc: totalBorc,
      toplamTahsilat: totalTahsilat,
      siparisSayisi: orders.length,
      sonSatis: last
        ? `${last.order_number} · ${last.created_at?.slice(0, 10) || ""}`
        : "—",
      sonSatisId: last?.id,
    };
  }, [customer, statement]);

  const collections = useMemo(() => {
    const moves = statement?.movements || [];
    return moves.filter(
      (m) =>
        m.movement_type === "payment" ||
        m.movement_type === "deposit" ||
        (Number(m.credit) > 0 && m.movement_type !== "sale"),
    );
  }, [statement]);

  /** Satış / borç hareketleri (BizimHesap import — Order stub yok). */
  const saleMovements = useMemo(() => {
    const moves = statement?.movements || [];
    return moves.filter(
      (m) =>
        m.movement_type === "sale" ||
        (Number(m.debit) > 0 &&
          m.movement_type !== "payment" &&
          m.movement_type !== "deposit"),
    );
  }, [statement]);

  type SalesPanelRow = {
    id: string;
    source: "movement" | "order";
    date: string;
    no: string;
    status: string;
    amount: number;
    movement?: CariMovement;
    order?: CustomerOrderBrief;
  };

  const salesRows = useMemo(() => {
    const rows: SalesPanelRow[] = [];
    const linkedOrderIds = new Set<number>();
    for (const m of saleMovements) {
      if (m.order_id) linkedOrderIds.add(m.order_id);
      const belge = belgeFromNote(m.note);
      rows.push({
        id: `m-${m.id}`,
        source: "movement",
        date: m.movement_date,
        no: belge || m.order_number || `S-${m.id}`,
        status: hareketLabel(m.movement_type, m.note, CARI_TYPE_LABELS),
        amount: Number(m.debit) > 0 ? Number(m.debit) : Number(m.credit),
        movement: m,
      });
    }
    for (const o of customer?.recent_orders || []) {
      if (linkedOrderIds.has(o.id)) continue;
      if (o.status === "Sipariş İptali") continue;
      rows.push({
        id: `o-${o.id}`,
        source: "order",
        date: o.created_at?.slice(0, 10) || "",
        no: o.order_number,
        status: o.status,
        amount: Number(o.total_amount),
        order: o,
      });
    }
    rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return rows;
  }, [saleMovements, customer]);

  async function deleteSalesRow(r: SalesPanelRow) {
    try {
      if (isBhImportNote(r.movement?.note)) {
        throw new Error("BizimHesap aktarım kayıtları silinemez");
      }
      // Prefer cari movement delete (BH check + order purge cascade)
      if (r.movement?.id) {
        await apiFetch(`/api/customers/${id}/movements/${r.movement.id}`, {
          method: "DELETE",
        });
      } else if (r.order?.id) {
        await apiFetch(`/api/orders/${r.order.id}?soft=false`, { method: "DELETE" });
      } else {
        throw new Error("Silinecek satış kaydı bulunamadı");
      }
      setOkMsg("Satış silindi · stok iade · cari/kasa ters");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Satış silinemedi");
    }
  }

  async function deleteCollectionRow(m: CariMovement) {
    try {
      if (isBhImportNote(m.note)) {
        throw new Error("BizimHesap aktarım kayıtları silinemez");
      }
      await apiFetch(`/api/customers/${id}/movements/${m.id}`, { method: "DELETE" });
      setOkMsg("Tahsilat silindi · cari + kasa/banka ters");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tahsilat silinemedi");
    }
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/customers/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          code: editForm.code.trim() || null,
          name: editForm.name.trim(),
          company: editForm.company.trim() || null,
          email: editForm.email.trim() || null,
          phone: editForm.phone.trim() || null,
          city: editForm.city.trim() || null,
          address: editForm.address.trim() || null,
          tax_number: editForm.tax_number.trim() || null,
          tax_office: editForm.tax_office.trim() || null,
          notes: editForm.notes.trim() || null,
          is_active: editForm.is_active,
          special_day_note: editForm.special_day_note.trim() || null,
          special_day_date: editForm.special_day_date || null,
          opening_balance: Number(editForm.opening_balance || 0),
        }),
      });
      setEditing(false);
      setOkMsg("Kart kaydedildi");
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
      const finance = payType === "payment" || payType === "deposit";
      const payments = finance ? rowsToPayload(payRows) : [];
      let amount = Number(payAmount);
      if (finance && payments.length) {
        amount = rowsSum(payRows);
        if (!(amount > 0)) throw new Error("En az bir kasa/hesap tahsilat satırı girin.");
      }
      const body: Record<string, unknown> = {
        movement_type: payType,
        amount,
        movement_date: payDate || null,
        note: payNote.trim() || null,
        // payment/deposit → kasa or selected bank; sale/adjustment → cari only
        post_to_finance: finance,
        finance_method: finance && !payments.length ? "cash" : null,
        ...(payments.length ? { payments } : {}),
      };
      if (payType === "adjustment") body.side = paySide;
      await apiFetch(`/api/customers/${id}/movements`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setPayAmount("");
      setPayNote("");
      setPayRows([]);
      setPayResetKey((k) => k + 1);
      setOkMsg(
        payType === "payment" || payType === "deposit"
          ? "Tahsilat kaydedildi · cari + kasa/banka güncellendi"
          : "Cari hareket kaydedildi",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hareket kaydı başarısız");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!confirm("Müşteriyi silmek istiyor musunuz?")) return;
    await apiFetch(`/api/customers/${id}`, { method: "DELETE" });
    router.push("/customers");
  }

  function openWa(tpl?: WhatsAppTemplate) {
    const phone = (customer?.phone || "").replace(/\D/g, "");
    if (!phone) {
      setError("Telefon yok — WhatsApp açılamaz");
      setShowSecondary(true);
      setTab("whatsapp");
      return;
    }
    let digits = phone;
    if (digits.startsWith("0")) digits = "90" + digits.slice(1);
    if (!digits.startsWith("90")) digits = "90" + digits;
    const text = tpl?.body
      ? encodeURIComponent(
          tpl.body
            .replace(/\{musteri\}/gi, customer?.name || "")
            .replace(/\{ad\}/gi, customer?.name || "")
            .replace(/\{bakiye\}/gi, formatMoney(ozet.acik)),
        )
      : encodeURIComponent(`Merhaba ${customer?.name || ""},`);
    window.open(`https://wa.me/${digits}?text=${text}`, "_blank");
  }

  function openCariPdfModal() {
    setShowPdfDates(true);
  }

  if (!customer && !error) {
    return <div className="text-slate-500">Yükleniyor…</div>;
  }
  if (!customer) {
    return (
      <div>
        <p className="text-red-600 mb-4">{error}</p>
        <Link href="/customers" className="text-baykus-600 hover:underline">
          ← Listeye dön
        </Link>
      </div>
    );
  }

  const input =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-baykus-500";

  const displayTitle = (customer.company || "").trim() || customer.name;
  const contactPerson =
    (customer.company || "").trim() && customer.name !== displayTitle
      ? customer.name
      : customer.email || null;
  const addressLine = [customer.address, customer.city].filter(Boolean).join(" · ");
  const smsHref = partySmsHref(customer.phone);

  const tabs: { key: TabKey; label: string }[] = [
    { key: "bilgi", label: "Bilgi" },
    { key: "hareketler", label: "Hareketler" },
    { key: "siparisler", label: "Siparişler" },
    { key: "notlar", label: "Notlar" },
    { key: "whatsapp", label: "WhatsApp" },
  ];

  function openSecondary(nextTab?: TabKey) {
    setShowSecondary(true);
    if (nextTab) setTab(nextTab);
    setTimeout(() => {
      document
        .getElementById("customer-secondary")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  const salesPanel = (
    <ExpandableMovementTable<SalesPanelRow>
      rows={salesRows}
      limit={12}
      getDate={(r) => r.date}
      getDateTie={(r) => r.id}
      emptyText="Satış / sipariş yok"
      onDelete={(r) => deleteSalesRow(r)}
      canDelete={(r) => !isBhImportNote(r.movement?.note)}
      deleteConfirm={(r) =>
        `Satış ${r.no} (${formatMoney(r.amount)}) silinsin mi?\nStok iade edilir; cari + kasa/banka hareketleri kaldırılır.`
      }
      getNote={(r) =>
        r.movement ? detailFromBhNote(r.movement.note, r.amount).note : null
      }
      getCta={(r) => {
        const oid = r.order?.id ?? r.movement?.order_id;
        return oid ? { href: `/orders/${oid}`, label: "Satış ekranına git" } : null;
      }}
      loadDetail={async (r) => {
        const oid = r.order?.id ?? r.movement?.order_id;
        if (oid) {
          const order = await apiFetch<OrderDetail>(`/api/orders/${oid}`);
          const detail = linesFromOrder(order);
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
            const oid = r.order?.id ?? r.movement?.order_id;
            if (oid) {
              return (
                <Link
                  href={`/orders/${oid}`}
                  className="font-medium text-baykus-700 hover:underline"
                >
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
          render: (r) =>
            r.source === "order" ? (
              <span className={`rounded-full px-2 py-0.5 text-xs ${statusBadgeClass(r.status)}`}>
                {r.status}
              </span>
            ) : (
              <span className="text-slate-700">{r.status}</span>
            ),
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

  const collectionsPanel = (
    <ExpandableMovementTable<CariMovement>
      rows={collections}
      limit={12}
      getDate={(m) => m.movement_date}
      getDateTie={(m) => m.id}
      emptyText="Tahsilat yok"
      onDelete={(m) => deleteCollectionRow(m)}
      canDelete={(m) => !isBhImportNote(m.note)}
      deleteConfirm={(m) =>
        `Tahsilat ${formatMoney(Number(m.credit) || Number(m.debit))} silinsin mi?\nCari + kasa/banka hareketi kaldırılır.`
      }
      getNote={(m) => detailFromBhNote(m.note).note}
      getCta={(m) =>
        m.order_id ? { href: `/orders/${m.order_id}`, label: "Sipariş ekranına git" } : null
      }
      loadDetail={async (m) => {
        const amt = Number(m.credit) > 0 ? Number(m.credit) : Number(m.debit);
        if (!m.order_id) return detailFromBhNote(m.note, amt);
        const order = await apiFetch<OrderDetail>(`/api/orders/${m.order_id}`);
        const detail = linesFromOrder(order);
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
          render: (m) => hareketLabel(m.movement_type, m.note, CARI_TYPE_LABELS),
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
        role="customer"
        breadcrumbHref="/customers"
        breadcrumbLabel="Müşteri Merkezi"
        title={displayTitle}
        contactPerson={contactPerson}
        phone={customer.phone}
        address={addressLine || null}
        notes={customer.notes}
        openBalance={ozet.acik}
        openBalanceSub={ozet.acik > 0 ? "müşteri borcu" : ozet.acik < 0 ? "alacaklı" : "borç yok"}
        error={error}
        okMsg={okMsg}
        actions={[
          {
            key: "satis",
            label: "Satış/Sipariş",
            icon: "🛒",
            variant: "navy",
            menu: [
              {
                label: "Kayıtlı satış",
                href: `/sales/create?type=kayitli&customer_id=${id}`,
              },
              { label: "Yeni teklif", href: `/quotes/new?customer_id=${id}` },
              { label: "Sipariş listesi", href: "/orders" },
            ],
          },
          {
            key: "tahsilat",
            label: "Tahsilat",
            icon: "💵",
            variant: "green",
            onClick: () => setShowTahsilat(true),
            menu: [
              { label: "Tahsilat Al (modal)", onClick: () => setShowTahsilat(true) },
              {
                label: "Manuel cari hareket",
                onClick: () => openSecondary("hareketler"),
              },
              { label: "Devir bakiye", onClick: () => setShowDevir(true) },
            ],
          },
          {
            key: "ekstre",
            label: "Hesap Ekstresi",
            icon: "📑",
            variant: "white",
            onClick: () => openSecondary("hareketler"),
            menu: [
              {
                label: "Cari döküm PDF",
                onClick: openCariPdfModal,
              },
              {
                label: "Hareketler sekmesi",
                onClick: () => openSecondary("hareketler"),
              },
              { label: "Mutabakat mektubu", href: `/customers/${id}/mutabakat` },
              { label: "Cari raporlar", href: "/reports/cari-statements" },
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
              : () => {
                  setError("Telefon yok — SMS/WhatsApp açılamaz");
                  openSecondary("whatsapp");
                },
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
                label: "Kartı düzenle",
                onClick: () => {
                  setEditing(true);
                  openSecondary("bilgi");
                },
              },
              {
                label: showSecondary ? "Detay sekmelerini gizle" : "Detay sekmeleri",
                onClick: () => setShowSecondary((v) => !v),
              },
              { label: "Müşteri takibi", href: `/customers/track?customer_id=${id}` },
              { label: "Alacaklar", href: "/customers/receivables" },
              { label: "Sil", onClick: () => void onDelete() },
            ],
          },
        ]}
        leftPanels={[
          {
            key: "satislar",
            title: "Önceki Satışlar/Siparişler",
            footerLabel: "tamamı için tıklayın...",
            footerOnClick: () => openSecondary("siparisler"),
            children: salesPanel,
          },
        ]}
        rightPanels={[
          {
            key: "tahsilatlar",
            title: "Önceki Tahsilatlar",
            footerLabel: "tamamı için tıklayın...",
            footerOnClick: () => openSecondary("hareketler"),
            children: collectionsPanel,
          },
          {
            key: "iadeler",
            title: "İadeler",
            note: "İade modülü henüz yok — panel boş durum gösterir (sahte veri yok).",
            children: returnsPanel,
          },
        ]}
      >
        {showSecondary && (
          <div id="customer-secondary" className="space-y-3 mt-2">
            <div className="flex flex-wrap gap-1 border-b border-slate-200">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                    tab === t.key
                      ? "border-baykus-600 text-baykus-700"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "bilgi" && (
              <div className="space-y-4">
                {!editing ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex justify-between mb-3">
                      <h2 className="font-semibold text-slate-800">Kart bilgileri</h2>
                      <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="text-sm text-baykus-600 hover:underline"
                      >
                        Düzenle
                      </button>
                    </div>
                    <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      <div>
                        <dt className="text-slate-500 text-xs">Telefon</dt>
                        <dd>{customer.phone || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 text-xs">E-posta</dt>
                        <dd>{customer.email || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 text-xs">Şehir</dt>
                        <dd>{customer.city || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 text-xs">Vergi</dt>
                        <dd>
                          {customer.tax_number || "—"}
                          {customer.tax_office ? ` / ${customer.tax_office}` : ""}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-slate-500 text-xs">Adres</dt>
                        <dd>{customer.address || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 text-xs">Açılış / Devir bakiyesi</dt>
                        <dd className="tabular-nums font-medium">
                          {formatMoney(Number(customer.opening_balance ?? 0))}
                        </dd>
                      </div>
                      {(customer.special_day_note || customer.special_day_date) && (
                        <div>
                          <dt className="text-slate-500 text-xs">Özel gün</dt>
                          <dd>
                            {customer.special_day_note || ""}
                            {customer.special_day_date ? ` (${customer.special_day_date})` : ""}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                ) : (
                  <form
                    onSubmit={saveEdit}
                    data-baykus-save
                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"
                  >
                    <h2 className="font-semibold text-slate-800">Kartı düzenle / Devir bakiye</h2>
                    <div className="grid sm:grid-cols-3 gap-3">
                      {(
                        [
                          ["code", "Kod"],
                          ["name", "Ad *"],
                          ["company", "Firma"],
                          ["email", "E-posta"],
                          ["phone", "Telefon"],
                          ["city", "Şehir"],
                          ["tax_number", "Vergi No"],
                          ["tax_office", "Vergi Dairesi"],
                          ["special_day_note", "Özel gün notu"],
                        ] as const
                      ).map(([key, label]) => (
                        <div key={key}>
                          <label className="block text-xs text-slate-500 mb-1">{label}</label>
                          <input
                            className={input}
                            required={key === "name"}
                            value={editForm[key]}
                            onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })}
                          />
                        </div>
                      ))}
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Özel gün tarihi</label>
                        <input
                          type="date"
                          className={input}
                          value={editForm.special_day_date}
                          onChange={(e) =>
                            setEditForm({ ...editForm, special_day_date: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">
                          Devir / açılış bakiyesi
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          className={input}
                          value={editForm.opening_balance}
                          onChange={(e) =>
                            setEditForm({ ...editForm, opening_balance: e.target.value })
                          }
                        />
                      </div>
                      <div className="flex items-center gap-2 pt-6">
                        <input
                          type="checkbox"
                          checked={editForm.is_active}
                          onChange={(e) =>
                            setEditForm({ ...editForm, is_active: e.target.checked })
                          }
                        />
                        <span className="text-sm">Aktif</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Adres</label>
                      <textarea
                        rows={2}
                        className={input}
                        value={editForm.address}
                        onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Notlar</label>
                      <textarea
                        rows={2}
                        className={input}
                        value={editForm.notes}
                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        data-baykus-save
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
              </div>
            )}

            {tab === "hareketler" && (
              <div className="grid lg:grid-cols-3 gap-6">
                <form
                  onSubmit={addMovement}
                  data-baykus-save
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"
                >
                  <h2 className="font-semibold text-slate-800">Tahsilat / cari hareket</h2>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Tip</label>
                    <select
                      className={input}
                      value={payType}
                      onChange={(e) => setPayType(e.target.value as typeof payType)}
                    >
                      <option value="payment">Ödeme / Tahsilat</option>
                      <option value="deposit">Kapora / Depozito</option>
                      <option value="sale">Satış (borç)</option>
                      <option value="adjustment">Düzeltme</option>
                    </select>
                  </div>
                  {payType === "adjustment" && (
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Yön</label>
                      <select
                        className={input}
                        value={paySide}
                        onChange={(e) => setPaySide(e.target.value as "debit" | "credit")}
                      >
                        <option value="debit">Borç (+)</option>
                        <option value="credit">Alacak (−)</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Tutar (₺)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      className={input}
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Tarih</label>
                    <input
                      type="date"
                      className={input}
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Not</label>
                    <input
                      className={input}
                      value={payNote}
                      onChange={(e) => setPayNote(e.target.value)}
                    />
                  </div>
                  {(payType === "payment" || payType === "deposit") && (
                    <div className="space-y-2 rounded-lg bg-slate-50 p-3">
                      <div className="text-xs font-semibold text-slate-600">
                        Kasa / banka (boş bırakılırsa ana kasa)
                      </div>
                      <SplitPaymentRows
                        key={payResetKey}
                        expectedTotal={Number(payAmount) || 0}
                        mode="tahsilat"
                        autoFill={false}
                        dense
                        onChange={setPayRows}
                      />
                    </div>
                  )}
                  <button
                    type="submit"
                    data-baykus-save
                    disabled={busy}
                    className="w-full rounded-lg bg-[#198754] text-white py-2 text-sm font-medium disabled:opacity-60"
                  >
                    Kaydet
                  </button>
                </form>

                <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center">
                    <h2 className="font-semibold text-slate-800">Ekstre / Hareketler</h2>
                    {statement && (
                      <span className="text-xs text-slate-500">
                        Kapanış: {formatMoney(Number(statement.closing_balance))}
                      </span>
                    )}
                  </div>
                  <ExpandableMovementTable<CariMovement>
                    rows={statement?.movements || []}
                    getDate={(m) => m.movement_date}
                    getDateTie={(m) => m.id}
                    emptyText="Hareket yok"
                    getNote={(m) => detailFromBhNote(m.note).note}
                    getCta={(m) =>
                      m.order_id
                        ? {
                            href: `/orders/${m.order_id}`,
                            label:
                              m.movement_type === "sale"
                                ? "Satış ekranına git"
                                : "Sipariş ekranına git",
                          }
                        : null
                    }
                    loadDetail={async (m) => {
                      const amt =
                        Number(m.debit) > 0 ? Number(m.debit) : Number(m.credit);
                      if (!m.order_id) return detailFromBhNote(m.note, amt);
                      const order = await apiFetch<OrderDetail>(`/api/orders/${m.order_id}`);
                      const detail = linesFromOrder(order);
                      const fromNote = detailFromBhNote(m.note, amt);
                      return {
                        lines: (detail.lines && detail.lines.length ? detail.lines : fromNote.lines),
                        note: fromNote.note || detail.note || null,
                      };
                    }}
                    leadingRows={
                      statement ? (
                        <tr className="border-t border-slate-100 bg-slate-50/50">
                          <td className="bk-expand-td" />
                          <td className="text-slate-500" colSpan={5}>
                            Açılış bakiyesi
                          </td>
                          <td className="text-right tabular-nums font-medium">
                            {formatMoney(Number(statement.opening_balance))}
                          </td>
                        </tr>
                      ) : null
                    }
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
                          hareketLabel(m.movement_type, m.note, CARI_TYPE_LABELS),
                      },
                      {
                        key: "note",
                        header: "Not / Sipariş",
                        className: "text-slate-600",
                        render: (m) => (
                          <>
                            {sanitizeDisplayNote(m.note) || "—"}
                            {m.order_number && (
                              <>
                                {" "}
                                <Link
                                  href={`/orders/${m.order_id}`}
                                  className="text-baykus-600 hover:underline"
                                >
                                  {m.order_number}
                                </Link>
                              </>
                            )}
                          </>
                        ),
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

            {tab === "siparisler" && (
              <div className="grid lg:grid-cols-2 gap-6">
                <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b flex justify-between">
                    <h2 className="font-semibold">Son siparişler / satışlar</h2>
                    <Link
                      href={`/sales/create?type=kayitli&customer_id=${id}`}
                      className="text-xs text-baykus-primary hover:underline"
                    >
                      + Satış
                    </Link>
                  </div>
                  {salesPanel}
                </div>
                <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b flex justify-between">
                    <h2 className="font-semibold">Son teklifler</h2>
                    <Link
                      href={`/quotes/new?customer_id=${id}`}
                      className="text-xs text-baykus-primary hover:underline"
                    >
                      + Teklif
                    </Link>
                  </div>
                  <ul className="divide-y text-sm">
                    {(customer.recent_quotes || []).map((q) => (
                      <li key={q.id} className="px-5 py-3 flex justify-between gap-3">
                        <div>
                          <Link
                            href={`/quotes/${q.id}`}
                            className="font-medium text-baykus-primary hover:underline"
                          >
                            {q.quote_number}
                          </Link>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {q.created_at?.slice(0, 10)} · {formatMoney(Number(q.total_amount))}
                          </div>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${quoteStatusBadgeClass(q.status)}`}
                        >
                          {q.status}
                        </span>
                      </li>
                    ))}
                    {(customer.recent_quotes || []).length === 0 && (
                      <li className="px-5 py-6 text-center text-slate-400">Teklif yok</li>
                    )}
                  </ul>
                </div>
                <div className="lg:col-span-2 rounded-xl border bg-white shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b">
                    <h2 className="font-semibold">Zaman çizelgesi</h2>
                  </div>
                  <ul className="divide-y text-sm">
                    {(customer.timeline || []).map((t, i) => (
                      <li key={i} className="px-5 py-3">
                        <div className="flex justify-between gap-2">
                          <span className="font-medium">
                            {t.kind === "order" ? "🛒 " : t.kind === "movement" ? "📒 " : "📝 "}
                            {t.kind === "movement"
                              ? CARI_TYPE_LABELS[t.label] || t.label
                              : t.label}
                          </span>
                          <span className="text-xs text-slate-400 whitespace-nowrap">
                            {t.date || ""}
                          </span>
                        </div>
                        {t.note && <p className="text-slate-500 text-xs mt-1">{t.note}</p>}
                        {t.amount != null && (
                          <p className="text-xs text-slate-500 mt-1">{formatMoney(t.amount)}</p>
                        )}
                      </li>
                    ))}
                    {(customer.timeline || []).length === 0 && (
                      <li className="px-5 py-6 text-center text-slate-400">Kayıt yok</li>
                    )}
                  </ul>
                </div>
              </div>
            )}

            {tab === "notlar" && (
              <form
                onSubmit={saveEdit}
                data-baykus-save
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3 max-w-2xl"
              >
                <h2 className="font-semibold">Özel not</h2>
                <textarea
                  rows={6}
                  className={input}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  placeholder="Müşteri özel notu…"
                />
                <button
                  type="submit"
                  data-baykus-save
                  disabled={busy}
                  className="rounded-lg bg-baykus-600 text-white px-4 py-2 text-sm disabled:opacity-60"
                >
                  Kaydet
                </button>
              </form>
            )}

            {tab === "whatsapp" && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm space-y-3">
                <h2 className="font-semibold text-emerald-950">WhatsApp (wa.me — Selenium yok)</h2>
                <p className="text-sm text-slate-600">
                  Telefon: <strong>{customer.phone || "yok"}</strong>
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openWa()}
                    disabled={!customer.phone}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
                    style={{ background: "#15803d" }}
                  >
                    Boş mesaj aç
                  </button>
                  {templates.slice(0, 8).map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      disabled={!customer.phone}
                      onClick={() => openWa(tpl)}
                      className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-900 disabled:opacity-40"
                      title={tpl.body}
                    >
                      {tpl.name.replace(/_/g, " ")}
                    </button>
                  ))}
                  <Link
                    href="/whatsapp/track"
                    className="text-sm text-baykus-primary hover:underline self-center ml-auto"
                  >
                    WhatsApp Takip →
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}
      </PartyCardLayout>

      <StatusFooter onRefresh={load} />

      <CustomerTahsilatModal
        customerId={id}
        customerName={customer.name}
        defaultAmount={ozet.acik > 0 ? ozet.acik : 0}
        open={showTahsilat}
        onClose={() => setShowTahsilat(false)}
        onSaved={(msg) => {
          setOkMsg(msg);
          void load();
        }}
      />
      <CustomerDevirModal
        customerId={id}
        customerName={customer.name}
        currentOpening={Number(customer.opening_balance ?? 0)}
        open={showDevir}
        onClose={() => setShowDevir(false)}
        onSaved={() => {
          setOkMsg("Cari devir bakiyesi kaydedildi.");
          void load();
        }}
      />
      <StatementPdfDateModal
        open={showPdfDates}
        onClose={() => setShowPdfDates(false)}
        title="Cari döküm PDF"
        partyName={customer.name}
        filename={`cari_dokum_${id}.pdf`}
        buildUrl={(from, to) => {
          const qs = new URLSearchParams();
          if (from) qs.set("from_date", from);
          if (to) qs.set("to_date", to);
          const q = qs.toString();
          return `/api/customers/${id}/statement-pdf${q ? `?${q}` : ""}`;
        }}
        onDone={(msg) => setOkMsg(msg)}
        onError={(msg) => setError(msg)}
      />
    </>
  );
}
