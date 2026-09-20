"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Customer, apiFetch, formatMoney } from "@/lib/api";
import { HubActionButton, HubSection, HubSummaryCard, HubTabs } from "@/components/hub/HubChrome";

type Tab = "musteriler" | "alacaklar" | "whatsapp" | "ozel";

const TABS: { id: Tab; label: string }[] = [
  { id: "musteriler", label: "Müşteriler" },
  { id: "alacaklar", label: "Açık Alacaklar" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "ozel", label: "Özel Gün / Kampanya" },
];

function CustomersHubPageInner() {
  const sp = useSearchParams();
  const rawTab = sp.get("tab") || "musteriler";
  const [tab, setTab] = useState<Tab>(
    rawTab === "alacaklar" || rawTab === "whatsapp" || rawTab === "ozel"
      ? rawTab
      : "musteriler",
  );

  const [items, setItems] = useState<Customer[]>([]);
  const [waCount, setWaCount] = useState(0);
  const [specialCount, setSpecialCount] = useState(0);
  const [campaignCount, setCampaignCount] = useState(0);
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
      if (hasBalance || tab === "alacaklar") params.set("has_balance", "true");
      const qs = params.toString();
      const [data, templates, specials, campaigns] = await Promise.all([
        apiFetch<Customer[]>(`/api/customers${qs ? `?${qs}` : ""}`),
        apiFetch<unknown[]>("/api/whatsapp/templates").catch(() => []),
        apiFetch<unknown[]>("/api/crm/special-days").catch(() => []),
        apiFetch<unknown[]>("/api/crm/campaigns").catch(() => []),
      ]);
      setItems(data);
      setWaCount(templates.length);
      setSpecialCount(specials.length);
      setCampaignCount(campaigns.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }, [q, activeFilter, hasBalance, tab]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const total = items.length;
    let recv = 0;
    let withBal = 0;
    for (const c of items) {
      const b = Number(c.balance ?? 0);
      if (b > 0) {
        recv += b;
        withBal += 1;
      }
    }
    return { total, recv, withBal };
  }, [items]);

  async function onDelete(id: number) {
    if (!confirm("Bu müşteriyi silmek istediğinize emin misiniz?")) return;
    try {
      await apiFetch(`/api/customers/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silme hatası");
    }
  }

  const listItems =
    tab === "alacaklar" ? items.filter((c) => Number(c.balance ?? 0) > 0) : items;

  return (
    <HubSection title="Müşteri Merkezi">
      <div className="grid gap-2 grid-cols-2 md:grid-cols-5">
        <HubSummaryCard label="Müşteri" value={stats.total || "—"} color="#198754" href="/customers?tab=musteriler" />
        <HubSummaryCard
          label="Açık Alacak"
          value={formatMoney(stats.recv)}
          color="#be123c"
          href="/customers?tab=alacaklar"
        />
        <HubSummaryCard label="WhatsApp" value={waCount} color="#15803d" href="/whatsapp" />
        <HubSummaryCard label="Özel Gün" value={specialCount} color="#f59e0b" href="/crm/special-days" />
        <HubSummaryCard label="Kampanya" value={campaignCount} color="#2563eb" href="/crm/campaigns" />
      </div>

      <div>
        <div className="text-xs font-semibold text-baykus-muted mb-1.5 uppercase">İşlemler</div>
        <div className="flex flex-wrap gap-2">
          <HubActionButton href="/customers?tab=musteriler" label="Müşteri Listesi" color="#198754" />
          <HubActionButton href="/customers/new" label="Yeni Müşteri" color="#2563eb" />
          <HubActionButton href="/customers?tab=musteriler" label="Müşteri Takibi" color="#0f766e" />
          <HubActionButton href="/customers?tab=alacaklar" label="Açık Alacaklar" color="#be123c" />
        </div>
      </div>

      <HubTabs
        tabs={TABS}
        active={tab}
        onChange={(id) => {
          setTab(id as Tab);
          if (id === "alacaklar") setHasBalance(true);
        }}
      />

      {error && <div className="mb-3 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}

      {(tab === "musteriler" || tab === "alacaklar") && (
        <>
          <div className="bk-filter-bar">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ad, kod, firma, telefon…"
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
            {tab === "musteriler" && (
              <label className="flex items-center gap-2 text-xs text-baykus-text px-1">
                <input
                  type="checkbox"
                  checked={hasBalance}
                  onChange={(e) => setHasBalance(e.target.checked)}
                />
                Sadece bakiyesi olanlar
              </label>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => {
                setQ("");
                setActiveFilter("all");
                setHasBalance(tab === "alacaklar");
              }}
              className="bk-btn bk-btn-ghost"
            >
              Temizle
            </button>
            <button onClick={load} className="bk-btn bk-btn-primary">
              Ara
            </button>
          </div>

          <div className="bk-table-wrap">
            <table className="bk-table">
              <thead>
                <tr>
                  <th>Kod</th>
                  <th>Ad</th>
                  <th>Firma</th>
                  <th>Şehir</th>
                  <th>Telefon</th>
                  <th className="text-right">Bakiye</th>
                  <th>Durum</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {listItems.map((c) => {
                  const bal = Number(c.balance ?? 0);
                  return (
                    <tr key={c.id}>
                      <td className="font-mono text-xs text-baykus-muted">{c.code || "—"}</td>
                      <td className="font-medium">
                        <Link href={`/customers/${c.id}`} className="text-baykus-primary hover:underline">
                          {c.name}
                        </Link>
                      </td>
                      <td className="text-baykus-muted">{c.company || "—"}</td>
                      <td>{c.city || "—"}</td>
                      <td>{c.phone || "—"}</td>
                      <td
                        className={`text-right font-medium tabular-nums ${
                          bal > 0 ? "text-amber-700" : bal < 0 ? "text-emerald-700" : "text-baykus-muted"
                        }`}
                      >
                        {formatMoney(bal)}
                      </td>
                      <td>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                            c.is_active !== false
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-200 text-baykus-muted"
                          }`}
                        >
                          {c.is_active !== false ? "Aktif" : "Pasif"}
                        </span>
                      </td>
                      <td className="text-right space-x-2 whitespace-nowrap">
                        <Link href={`/customers/${c.id}`} className="text-baykus-primary hover:underline">
                          Detay
                        </Link>
                        <button onClick={() => onDelete(c.id)} className="text-red-600 hover:underline">
                          Sil
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!loading && listItems.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center text-slate-400 py-8">
                      Kayıt yok
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "whatsapp" && (
        <div className="bk-card p-4 space-y-3">
          <p className="text-sm text-baykus-muted">
            WhatsApp şablonları ve gönderim günlüğü Müşteri İletişim merkezinde yönetilir.
          </p>
          <div className="flex flex-wrap gap-2">
            <HubActionButton href="/whatsapp" label={`Şablonlar (${waCount})`} color="#15803d" />
            <HubActionButton href="/crm/campaigns" label="Kampanya mesajları" color="#2563eb" />
          </div>
        </div>
      )}

      {tab === "ozel" && (
        <div className="bk-card p-4 space-y-3">
          <p className="text-sm text-baykus-muted">
            Özel gün hatırlatmaları ve kampanya tanımları.
          </p>
          <div className="flex flex-wrap gap-2">
            <HubActionButton href="/crm/special-days" label={`Özel Günler (${specialCount})`} color="#f59e0b" />
            <HubActionButton href="/crm/campaigns" label={`Kampanyalar (${campaignCount})`} color="#2563eb" />
          </div>
        </div>
      )}
    </HubSection>
  );
}


export default function CustomersHubPage() {
  return (
    <Suspense fallback={<p className="text-sm text-baykus-muted">Yükleniyor…</p>}>
      <CustomersHubPageInner />
    </Suspense>
  );
}
