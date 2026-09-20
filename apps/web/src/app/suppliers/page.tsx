"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PayableItem,
  PurchaseListItem,
  Supplier,
  apiFetch,
  formatMoney,
} from "@/lib/api";
import { HubActionButton, HubSection, HubSummaryCard, HubTabs } from "@/components/hub/HubChrome";

type Tab = "tedarikciler" | "borc" | "alislar" | "satinalma";

const TABS: { id: Tab; label: string }[] = [
  { id: "tedarikciler", label: "Tedarikçiler" },
  { id: "borc", label: "Borç / Alacak" },
  { id: "alislar", label: "Son Alışlar" },
  { id: "satinalma", label: "Satın Alma" },
];

export default function SuppliersHubPage() {
  const [tab, setTab] = useState<Tab>("tedarikciler");
  const [items, setItems] = useState<Supplier[]>([]);
  const [payables, setPayables] = useState<PayableItem[]>([]);
  const [purchases, setPurchases] = useState<PurchaseListItem[]>([]);
  const [q, setQ] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "true" | "false">("all");
  const [hasBalance, setHasBalance] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (activeFilter !== "all") params.set("active", activeFilter);
      if (hasBalance) params.set("has_balance", "true");
      const qs = params.toString();
      const [data, pays, purch] = await Promise.all([
        apiFetch<Supplier[]>(`/api/suppliers${qs ? `?${qs}` : ""}`),
        apiFetch<PayableItem[]>("/api/suppliers/payables").catch(() => []),
        apiFetch<PurchaseListItem[]>("/api/purchases").catch(() => []),
      ]);
      setItems(data);
      setPayables(pays);
      setPurchases(purch);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }, [q, activeFilter, hasBalance]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    let openBal = 0;
    for (const s of items) {
      const b = Number(s.balance ?? 0);
      if (b > 0) openBal += b;
    }
    const totalPurchase = purchases.reduce((a, p) => a + Number(p.total_amount || 0), 0);
    const totalPay = payables.reduce((a, p) => a + Number(p.balance || 0), 0);
    return {
      suppliers: items.length,
      totalPurchase,
      totalPay: Math.max(0, openBal - totalPay) || openBal, // display open payable
      openBal: openBal || payables.reduce((a, p) => a + Number(p.balance || 0), 0),
      purchaseCount: purchases.length,
    };
  }, [items, payables, purchases]);

  async function onDelete(id: number) {
    if (!confirm("Bu tedarikçiyi silmek istediğinize emin misiniz?")) return;
    try {
      await apiFetch(`/api/suppliers/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silme hatası");
    }
  }

  return (
    <HubSection title="Tedarik Merkezi">
      <div className="grid gap-2 grid-cols-2 md:grid-cols-5">
        <HubSummaryCard label="Tedarikçi" value={stats.suppliers} color="#198754" />
        <HubSummaryCard label="Toplam Alış" value={formatMoney(stats.totalPurchase)} color="#2563eb" />
        <HubSummaryCard label="Toplam Ödeme" value={formatMoney(Math.max(0, stats.totalPurchase - stats.openBal))} color="#15803d" />
        <HubSummaryCard label="Açık Bakiye" value={formatMoney(stats.openBal)} color="#be123c" href="/suppliers/payables" />
        <HubSummaryCard label="Satın Alma" value={stats.purchaseCount} color="#f59e0b" href="/purchases" />
      </div>

      <div>
        <div className="text-xs font-semibold text-baykus-muted mb-1.5 uppercase">İşlemler</div>
        <div className="flex flex-wrap gap-2">
          <HubActionButton href="/suppliers" label="Tedarikçiler" color="#198754" />
          <HubActionButton href="/purchases" label="Alış Hareketleri" color="#2563eb" />
          <HubActionButton href="/suppliers/payables" label="Borç/Alacak" color="#be123c" />
          <HubActionButton href="/suppliers/payables" label="Tedarikçi Ödemesi" color="#0f766e" />
          <HubActionButton href="/purchases/new" label="Satın Alma Talebi" color="#f59e0b" />
        </div>
      </div>

      <HubTabs tabs={TABS} active={tab} onChange={(id) => setTab(id as Tab)} />
      {error && <div className="mb-3 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}

      {tab === "tedarikciler" && (
        <>
          <div className="bk-filter-bar">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ad, kod, telefon…"
              className="bk-input max-w-[220px]"
            />
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value as "all" | "true" | "false")}
              className="bk-input max-w-[140px]"
            >
              <option value="all">Tümü</option>
              <option value="true">Aktif</option>
              <option value="false">Pasif</option>
            </select>
            <label className="flex items-center gap-2 text-xs text-baykus-text px-1">
              <input type="checkbox" checked={hasBalance} onChange={(e) => setHasBalance(e.target.checked)} />
              Sadece bakiyesi olanlar
            </label>
            <div className="flex-1" />
            <button type="button" onClick={() => { setQ(""); setActiveFilter("all"); setHasBalance(false); }} className="bk-btn bk-btn-ghost">
              Temizle
            </button>
            <button onClick={load} className="bk-btn bk-btn-primary">Ara</button>
          </div>
          <div className="bk-table-wrap">
            <table className="bk-table">
              <thead>
                <tr>
                  <th>Kod</th>
                  <th>Ad</th>
                  <th>Şehir</th>
                  <th>Telefon</th>
                  <th className="text-right">Borç</th>
                  <th>Durum</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => {
                  const bal = Number(s.balance ?? 0);
                  return (
                    <tr key={s.id}>
                      <td className="font-mono text-xs text-baykus-muted">{s.code || "—"}</td>
                      <td className="font-medium">
                        <Link href={`/suppliers/${s.id}`} className="text-baykus-primary hover:underline">
                          {s.name}
                        </Link>
                      </td>
                      <td>{s.city || "—"}</td>
                      <td>{s.phone || "—"}</td>
                      <td className={`text-right font-medium tabular-nums ${bal > 0 ? "text-amber-700" : "text-baykus-muted"}`}>
                        {formatMoney(bal)}
                      </td>
                      <td>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${s.is_active !== false ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-baykus-muted"}`}>
                          {s.is_active !== false ? "Aktif" : "Pasif"}
                        </span>
                      </td>
                      <td className="text-right space-x-2 whitespace-nowrap">
                        <Link href={`/suppliers/${s.id}`} className="text-baykus-primary hover:underline">Detay</Link>
                        <button onClick={() => onDelete(s.id)} className="text-red-600 hover:underline">Sil</button>
                      </td>
                    </tr>
                  );
                })}
                {!loading && items.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-slate-400 py-8">Tedarikçi yok</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "borc" && (
        <div className="bk-table-wrap">
          <table className="bk-table">
            <thead>
              <tr>
                <th>Tedarikçi</th>
                <th className="text-right">Açık Bakiye</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(payables.length ? payables : items.filter((s) => Number(s.balance ?? 0) > 0).map((s) => ({
                supplier_id: s.id,
                name: s.name,
                balance: Number(s.balance ?? 0),
              }))).map((p) => (
                <tr key={p.supplier_id}>
                  <td className="font-medium">
                    <Link href={`/suppliers/${p.supplier_id}`} className="text-baykus-primary hover:underline">
                      {p.name}
                    </Link>
                  </td>
                  <td className="text-right tabular-nums font-semibold text-amber-700">
                    {formatMoney(Number(p.balance))}
                  </td>
                  <td className="text-right">
                    <Link href={`/suppliers/${p.supplier_id}`} className="text-baykus-primary hover:underline">
                      Ödeme
                    </Link>
                  </td>
                </tr>
              ))}
              {payables.length === 0 && items.every((s) => Number(s.balance ?? 0) <= 0) && (
                <tr><td colSpan={3} className="text-center text-slate-400 py-8">Açık borç yok</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {(tab === "alislar" || tab === "satinalma") && (
        <>
          <div className="mb-2 flex justify-end">
            <HubActionButton href="/purchases/new" label="+ Satın Alma Talebi" color="#f59e0b" />
          </div>
          <div className="bk-table-wrap">
            <table className="bk-table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Tedarikçi</th>
                  <th>Tarih</th>
                  <th>Durum</th>
                  <th className="text-right">Tutar</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {purchases.slice(0, 50).map((p) => (
                  <tr key={p.id}>
                    <td className="font-mono text-xs">{p.purchase_number}</td>
                    <td>{p.supplier_name || "—"}</td>
                    <td>{p.purchase_date ? String(p.purchase_date).slice(0, 10) : "—"}</td>
                    <td>{p.status}</td>
                    <td className="text-right tabular-nums">{formatMoney(Number(p.total_amount))}</td>
                    <td className="text-right">
                      <Link href={`/purchases/${p.id}`} className="text-baykus-primary hover:underline">Aç</Link>
                    </td>
                  </tr>
                ))}
                {purchases.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-slate-400 py-8">Alış kaydı yok</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </HubSection>
  );
}
