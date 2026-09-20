"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { OrderListItem, apiFetch, formatMoney, statusBadgeClass } from "@/lib/api";
import StatusFooter from "@/components/StatusFooter";

const DIRECT_CHANNELS = "perakende,mağaza,yeni müşteri,kayıtlı müşteri";

const BELGE_TIPLERI = ["Tüm Belge Tipleri", "Perakende Satış", "Sipariş", "Teklif"] as const;
const DONEMLER = ["Son 30 Gün", "Son 3 Ay", "Son 6 Ay", "Son 1 Yıl", "Tümü"] as const;
const ARA_TIPLERI = ["Tümü", "Müşteri İsmi / Belge No", "Sipariş No", "Ürün"] as const;

function periodStart(label: string): Date | null {
  const now = new Date();
  const d = new Date(now);
  if (label === "Son 30 Gün") d.setDate(d.getDate() - 30);
  else if (label === "Son 3 Ay") d.setDate(d.getDate() - 92);
  else if (label === "Son 6 Ay") d.setDate(d.getDate() - 184);
  else if (label === "Son 1 Yıl") d.setDate(d.getDate() - 366);
  else return null;
  return d;
}

function isCancelled(status: string): boolean {
  return status === "Sipariş İptali" || status === "İptal" || status === "İptal Edildi";
}

function belgeTipi(o: OrderListItem): string {
  const ch = (o.channel || "").toLowerCase();
  if (ch === "perakende") return "Perakende Satış";
  return "Sipariş";
}

export default function DirektSatislarPage() {
  const router = useRouter();
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [belge, setBelge] = useState<(typeof BELGE_TIPLERI)[number]>("Tüm Belge Tipleri");
  const [donem, setDonem] = useState<(typeof DONEMLER)[number]>("Son 1 Yıl");
  const [araTip, setAraTip] = useState<(typeof ARA_TIPLERI)[number]>("Müşteri İsmi / Belge No");
  const [q, setQ] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await apiFetch<OrderListItem[]>(
        `/api/orders?channels=${encodeURIComponent(DIRECT_CHANNELS)}&limit=500`,
      );
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const start = periodStart(donem);
    const needle = q.trim().toLocaleLowerCase("tr");
    return items.filter((o) => {
      const cancelled = isCancelled(o.status);
      if (cancelled && !showCancel) return false;
      if (start && new Date(o.created_at) < start) return false;
      if (belge !== "Tüm Belge Tipleri") {
        if (belge === "Perakende Satış") {
          if ((o.channel || "").toLowerCase() !== "perakende") return false;
        } else if (belge === "Teklif") {
          return false; // teklifler ayrı modül; direkt satış listesinde yok
        } else if (belge === "Sipariş") {
          if ((o.channel || "").toLowerCase() === "perakende") return false;
        }
      }
      if (needle) {
        const name = (o.customer_name || "Perakende Satışlar").toLocaleLowerCase("tr");
        const no = (o.order_number || "").toLocaleLowerCase("tr");
        const notes = (o.notes || "").toLocaleLowerCase("tr");
        if (araTip === "Sipariş No") {
          if (!no.includes(needle)) return false;
        } else if (araTip === "Ürün") {
          if (!notes.includes(needle) && !name.includes(needle)) return false;
        } else if (araTip === "Müşteri İsmi / Belge No") {
          if (!name.includes(needle) && !no.includes(needle)) return false;
        } else {
          if (!name.includes(needle) && !no.includes(needle) && !notes.includes(needle)) return false;
        }
      }
      return true;
    });
  }, [items, belge, donem, q, araTip, showCancel]);

  const summary = useMemo(() => {
    const active = filtered.filter((o) => !isCancelled(o.status));
    const cancelled = filtered.filter((o) => isCancelled(o.status));
    const total = active.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const collected = active.reduce(
      (s, o) => s + Number(o.paid_amount || o.deposit_amount || 0),
      0,
    );
    return {
      count: filtered.length,
      total,
      collected,
      cancelled: cancelled.length,
    };
  }, [filtered]);

  async function cancelSelected() {
    if (!selectedId) {
      alert("Önce bir satış seçin.");
      return;
    }
    const row = items.find((o) => o.id === selectedId);
    if (!row) return;
    if (isCancelled(row.status)) {
      alert("Bu satış zaten iptal edilmiş.");
      return;
    }
    if (
      !confirm(
        "Seçili satış iptal edilecek, ürünler stoğa geri alınacak ve bağlı kasa/banka tahsilat kayıtları silinecek.\nDevam edilsin mi?",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/orders/${selectedId}?soft=true`, { method: "DELETE" });
      setSelectedId(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "İptal hatası");
    } finally {
      setBusy(false);
    }
  }

  function printSelected() {
    if (!selectedId) {
      alert("Önce bir satış seçin.");
      return;
    }
    const o = items.find((x) => x.id === selectedId);
    // Print-friendly order detail; auto-print via ?print=1
    window.open(`/orders/${selectedId}?print=1`, "_blank");
    void o;
  }

  async function pdfSelected() {
    if (!selectedId) {
      alert("Önce bir satış seçin.");
      return;
    }
    const o = items.find((x) => x.id === selectedId);
    try {
      const { downloadPdf } = await import("@/lib/api");
      await downloadPdf(
        `/api/orders/${selectedId}/work-order-pdf`,
        `${o?.order_number || selectedId}-belge.pdf`,
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "PDF hatası");
    }
  }

  return (
    <div className="space-y-3 pb-2">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="text-lg font-bold text-baykus-text leading-tight">Direkt Satışlar</h2>
          <p className="text-xs text-baykus-muted mt-0.5">
            Perakende ve müşteri satışlarını tek ekrandan yönetin
          </p>
        </div>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      {/* Özet kartları */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            { label: "Listelenen Satış", value: String(summary.count), color: "#198754", icon: "▣" },
            { label: "Satış Toplamı", value: formatMoney(summary.total), color: "#be123c", icon: "₺" },
            { label: "Tahsil Edilen", value: formatMoney(summary.collected), color: "#0f766e", icon: "✓" },
            { label: "İptal Edilen", value: String(summary.cancelled), color: "#f59e0b", icon: "×" },
          ] as const
        ).map((c) => (
          <div
            key={c.label}
            className="flex items-center gap-3 rounded-md px-3 py-3 text-white shadow-sm min-h-[64px]"
            style={{ backgroundColor: c.color }}
          >
            <span className="text-2xl font-bold opacity-90">{c.icon}</span>
            <div className="min-w-0">
              <div className="text-[11px] font-bold opacity-95">{c.label}</div>
              <div className="text-lg font-bold tabular-nums leading-tight truncate">{c.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Satış İşlemleri */}
      <fieldset className="rounded-md border border-baykus-line bg-white px-3 py-3">
        <legend className="px-1 text-xs font-bold text-baykus-text">Satış İşlemleri</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          <Link
            href="/sales/retail/new"
            className="flex items-center justify-center gap-2 rounded-md px-3 py-4 text-sm font-bold text-white shadow-sm hover:opacity-95"
            style={{ backgroundColor: "#198754" }}
          >
            🛒 PERAKENDE SATIŞ GİR
          </Link>
          <Link
            href="/sales/create?type=yeni"
            className="flex items-center justify-center gap-2 rounded-md px-3 py-4 text-sm font-bold text-white shadow-sm hover:opacity-95"
            style={{ backgroundColor: "#0f766e" }}
          >
            👤 YENİ MÜŞTERİYE SATIŞ
          </Link>
          <Link
            href="/sales/create?type=kayitli"
            className="flex items-center justify-center gap-2 rounded-md px-3 py-4 text-sm font-bold text-white shadow-sm hover:opacity-95"
            style={{ backgroundColor: "#be123c" }}
          >
            👥 KAYITLI MÜŞTERİYE SATIŞ
          </Link>
        </div>
      </fieldset>

      {/* Filtreler */}
      <fieldset className="rounded-md border border-baykus-line bg-white px-3 py-2.5">
        <legend className="px-1 text-xs font-bold text-baykus-text">Filtreler ve Arama</legend>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[11px] font-bold text-baykus-text">Belge Tipi</label>
          <select
            className="bk-input w-auto min-w-[10rem]"
            value={belge}
            onChange={(e) => setBelge(e.target.value as (typeof BELGE_TIPLERI)[number])}
          >
            {BELGE_TIPLERI.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <label className="text-[11px] font-bold text-baykus-text ml-2">Dönem</label>
          <select
            className="bk-input w-auto min-w-[8rem]"
            value={donem}
            onChange={(e) => setDonem(e.target.value as (typeof DONEMLER)[number])}
          >
            {DONEMLER.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-1.5 text-[11px] font-bold ml-2">
            <input
              type="checkbox"
              checked={showCancel}
              onChange={(e) => setShowCancel(e.target.checked)}
            />
            İptalleri de göster
          </label>
          <div className="flex-1" />
          <label className="text-[11px] font-bold text-baykus-text">Ara</label>
          <select
            className="bk-input w-auto min-w-[10rem]"
            value={araTip}
            onChange={(e) => setAraTip(e.target.value as (typeof ARA_TIPLERI)[number])}
          >
            {ARA_TIPLERI.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <input
            className="bk-input w-full max-w-xs"
            placeholder="Müşteri İsmi / Belge No"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </fieldset>

      {/* Seçili Satış İşlemleri */}
      <fieldset className="rounded-md border border-baykus-line bg-white px-3 py-2.5">
        <legend className="px-1 text-xs font-bold text-baykus-text">Seçili Satış İşlemleri</legend>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void cancelSelected()}
            className="bk-btn text-xs font-bold text-white"
            style={{ backgroundColor: "#dc2626" }}
          >
            ⛔ Satış İptal Et
          </button>
          <button
            type="button"
            onClick={printSelected}
            className="bk-btn text-xs font-bold text-white"
            style={{ backgroundColor: "#42b4d0" }}
          >
            🖨 Yazdır
          </button>
          <button
            type="button"
            onClick={() => void pdfSelected()}
            className="bk-btn text-xs font-bold text-white"
            style={{ backgroundColor: "#7c3aed" }}
          >
            PDF
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="bk-btn text-xs font-bold text-white"
            style={{ backgroundColor: "#475569" }}
          >
            ↻ Yenile
          </button>
        </div>
      </fieldset>

      {/* Tablo */}
      <fieldset className="rounded-md border border-baykus-line bg-white px-2 py-2">
        <legend className="px-1 text-xs font-bold text-baykus-text">
          Satış Listesi · Satırdaki oka veya satıra çift tıklayarak ürün detaylarını açabilirsiniz
        </legend>
        {loading && items.length === 0 && (
          <p className="text-sm text-baykus-muted px-2 py-4">Yükleniyor…</p>
        )}
        <div className="bk-table-wrap border-0">
          <table className="bk-table">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>İsim / Ünvan</th>
                <th>Belge No</th>
                <th>Sipariş No</th>
                <th className="text-right">Tutar</th>
                <th>Durumu</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const cancelled = isCancelled(o.status);
                return (
                  <tr
                    key={o.id}
                    onClick={() => setSelectedId(o.id)}
                    onDoubleClick={() => router.push(`/orders/${o.id}`)}
                    className={`cursor-pointer ${
                      selectedId === o.id ? "bg-sky-50" : cancelled ? "bg-red-50 text-red-800" : ""
                    }`}
                  >
                    <td className="whitespace-nowrap text-xs">
                      {new Date(o.created_at).toLocaleString("tr-TR")}
                    </td>
                    <td>{o.customer_name || "Perakende Satışlar"}</td>
                    <td className="font-mono text-xs">{o.order_number}</td>
                    <td className="font-mono text-xs">{o.order_number}</td>
                    <td className="text-right tabular-nums font-medium">
                      {formatMoney(Number(o.total_amount))}
                    </td>
                    <td>
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-[11px] ${statusBadgeClass(o.status)}`}
                      >
                        {o.status}
                      </span>
                      <span className="ml-2 text-[10px] text-baykus-muted">{belgeTipi(o)}</span>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-baykus-muted py-10">
                    Listelenecek satış yok
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </fieldset>

      <StatusFooter onRefresh={load} />
    </div>
  );
}
