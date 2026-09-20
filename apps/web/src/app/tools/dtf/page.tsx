"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  DtfCalcResult,
  DtfDesktopCalcResult,
  DtfDesktopSettings,
  DtfScenario,
  apiFetch,
  formatMoney,
} from "@/lib/api";

function usd(n: number) {
  return (
    n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " $"
  );
}

export default function DtfPage() {
  const [tab, setTab] = useState<"desktop" | "film">("desktop");
  const [desk, setDesk] = useState({
    metretul: "13.32",
    alis_usd_mt: "2",
    satis_usd_mt: "6",
    kur: "43",
  });
  const [deskResult, setDeskResult] = useState<DtfDesktopCalcResult | null>(null);
  const [form, setForm] = useState({
    film_m2: "0.0625",
    film_unit_price: "120",
    ink_cost: "8.5",
    labor_cost: "15",
    waste_percent: "5",
    quantity: "50",
    name: "",
    note: "",
  });
  const [result, setResult] = useState<DtfCalcResult | null>(null);
  const [scenarios, setScenarios] = useState<DtfScenario[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const [sc, settings] = await Promise.all([
        apiFetch<DtfScenario[]>("/api/tools/dtf/scenarios"),
        apiFetch<DtfDesktopSettings>("/api/tools/dtf/settings"),
      ]);
      setScenarios(sc);
      setDesk({
        metretul: String(settings.metretul ?? 13.32),
        alis_usd_mt: String(settings.alis_usd_mt ?? 2),
        satis_usd_mt: String(settings.satis_usd_mt ?? 6),
        kur: String(settings.kur ?? 43),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function deskPayload() {
    return {
      metretul: Number(desk.metretul) || 0,
      alis_usd_mt: Number(desk.alis_usd_mt) || 0,
      satis_usd_mt: Number(desk.satis_usd_mt) || 0,
      kur: Number(desk.kur) || 0,
    };
  }

  async function calcDesktop(e?: FormEvent) {
    e?.preventDefault();
    setError("");
    setMsg("");
    try {
      const r = await apiFetch<DtfDesktopCalcResult>("/api/tools/dtf/desktop-calculate", {
        method: "POST",
        body: JSON.stringify(deskPayload()),
      });
      setDeskResult(r);
      await apiFetch("/api/tools/dtf/settings", {
        method: "PUT",
        body: JSON.stringify(deskPayload()),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hesaplama hatası");
    }
  }

  async function clearDesktop() {
    setDesk({ metretul: "", alis_usd_mt: "", satis_usd_mt: "", kur: "" });
    setDeskResult(null);
  }

  async function toCosts() {
    setError("");
    setMsg("");
    try {
      if (!deskResult) await calcDesktop();
      const r = await apiFetch<{ message: string }>("/api/tools/dtf/to-costs", {
        method: "POST",
        body: JSON.stringify(deskPayload()),
      });
      setMsg(r.message || "Maliyete aktarıldı");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aktarım hatası");
    }
  }

  function filmPayload() {
    return {
      film_m2: Number(form.film_m2) || 0,
      film_unit_price: Number(form.film_unit_price) || 0,
      ink_cost: Number(form.ink_cost) || 0,
      labor_cost: Number(form.labor_cost) || 0,
      waste_percent: Number(form.waste_percent) || 0,
      quantity: Math.max(1, Number(form.quantity) || 1),
    };
  }

  async function calculateFilm(e?: FormEvent) {
    e?.preventDefault();
    setError("");
    try {
      setResult(
        await apiFetch<DtfCalcResult>("/api/tools/dtf/calculate", {
          method: "POST",
          body: JSON.stringify(filmPayload()),
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hesaplama hatası");
    }
  }

  async function saveScenario(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    if (!form.name.trim()) {
      setError("Senaryo adı gerekli");
      return;
    }
    try {
      await apiFetch("/api/tools/dtf/scenarios", {
        method: "POST",
        body: JSON.stringify({ ...filmPayload(), name: form.name.trim(), note: form.note || null }),
      });
      setMsg("Senaryo kaydedildi");
      setForm({ ...form, name: "" });
      await load();
      await calculateFilm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    }
  }

  async function remove(id: number) {
    if (!confirm("Senaryoyu sil?")) return;
    await apiFetch(`/api/tools/dtf/scenarios/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-3 max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">DTF Maliyet & Satış Hesaplama</h2>
          <p className="text-xs text-baykus-muted">Fiyat / Maliyet › DTF · masaüstü metretül hesaplayıcı</p>
        </div>
        <Link href="/tools/costs" className="bk-btn bk-btn-ghost text-xs">
          Maliyet Yönetimi
        </Link>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{msg}</div>}

      <div className="flex gap-2">
        <button
          type="button"
          className={`rounded px-3 py-1.5 text-xs font-semibold border ${tab === "desktop" ? "bg-[#0d6efd] text-white border-[#0d6efd]" : "bg-white"}`}
          onClick={() => setTab("desktop")}
        >
          Metretül (masaüstü)
        </button>
        <button
          type="button"
          className={`rounded px-3 py-1.5 text-xs font-semibold border ${tab === "film" ? "bg-baykus-primary text-white" : "bg-white"}`}
          onClick={() => setTab("film")}
        >
          Film m² senaryo
        </button>
      </div>

      {tab === "desktop" ? (
        <>
          <fieldset className="rounded border bg-white px-3 py-3">
            <legend className="px-1 text-xs font-semibold">Hesaplama Bilgileri</legend>
            <form onSubmit={calcDesktop} className="grid md:grid-cols-2 gap-3 text-sm">
              {(
                [
                  ["metretul", "Metretül", "Örn: 13.32"],
                  ["alis_usd_mt", "Alış Fiyatı ($/mt)", "Örn: 2"],
                  ["satis_usd_mt", "Satış Fiyatı ($/mt)", "Örn: 6"],
                  ["kur", "Dolar Kuru (TL)", "Örn: 43"],
                ] as const
              ).map(([key, label, hint]) => (
                <label key={key}>
                  <span className="text-[11px] text-baykus-muted">{label}</span>
                  <input
                    className="bk-input mt-0.5"
                    type="number"
                    step="any"
                    value={desk[key]}
                    onChange={(e) => setDesk({ ...desk, [key]: e.target.value })}
                    required
                  />
                  <span className="text-[10px] text-slate-400">{hint}</span>
                </label>
              ))}
              <div className="md:col-span-2 flex flex-wrap gap-2 pt-1">
                <button type="submit" className="bk-btn text-white text-xs px-4 py-2" style={{ background: "#0d6efd" }}>
                  Hesapla
                </button>
                <button type="button" onClick={clearDesktop} className="bk-btn text-white text-xs" style={{ background: "#6c757d" }}>
                  Temizle
                </button>
                <button type="button" onClick={toCosts} className="bk-btn text-white text-xs" style={{ background: "#198754" }}>
                  Maliyete Aktar
                </button>
              </div>
            </form>
          </fieldset>

          {deskResult && (
            <fieldset className="rounded border bg-white px-3 py-3">
              <legend className="px-1 text-xs font-semibold">Sonuç</legend>
              <div className="bk-table-wrap mb-3">
                <table className="bk-table">
                  <thead>
                    <tr>
                      <th>Kalem</th>
                      <th className="text-right">USD</th>
                      <th className="text-right">TL</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Alış Toplam</td>
                      <td className="text-right tabular-nums">{usd(deskResult.alis_usd)}</td>
                      <td className="text-right tabular-nums">{formatMoney(deskResult.alis_tl)}</td>
                    </tr>
                    <tr>
                      <td>Satış Toplam</td>
                      <td className="text-right tabular-nums">{usd(deskResult.satis_usd)}</td>
                      <td className="text-right tabular-nums">{formatMoney(deskResult.satis_tl)}</td>
                    </tr>
                    <tr>
                      <td className="font-semibold">Kâr</td>
                      <td className="text-right tabular-nums font-semibold">{usd(deskResult.kar_usd)}</td>
                      <td
                        className={`text-right tabular-nums font-semibold ${
                          deskResult.kar_tl >= 0 ? "text-emerald-700" : "text-red-700"
                        }`}
                      >
                        {formatMoney(deskResult.kar_tl)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <span className={`font-bold ${deskResult.kar_tl >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  Kâr: {formatMoney(deskResult.kar_tl)}
                </span>
                <span className="font-semibold text-slate-700">
                  Kâr Marjı: %{Number(deskResult.kar_marji).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}
                </span>
                <span className="text-xs text-baykus-muted">
                  Birim alış: {formatMoney(deskResult.birim_alis_tl)} / mt
                </span>
              </div>
            </fieldset>
          )}
        </>
      ) : (
        <>
          <form onSubmit={calculateFilm} className="rounded border bg-white p-3 grid md:grid-cols-3 gap-3 text-sm">
            {(
              [
                ["film_m2", "Film (m²)"],
                ["film_unit_price", "Film birim fiyat (₺/m²)"],
                ["ink_cost", "Mürekkep (₺)"],
                ["labor_cost", "İşçilik (₺)"],
                ["waste_percent", "Fire %"],
                ["quantity", "Adet"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                <span className="text-[11px] text-baykus-muted">{label}</span>
                <input
                  type="number"
                  step="any"
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="bk-input mt-0.5"
                />
              </label>
            ))}
            <div className="md:col-span-3">
              <button type="submit" className="bk-btn bk-btn-primary text-xs">
                Hesapla
              </button>
            </div>
          </form>

          {result && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <div className="bk-card px-3 py-2">
                <div className="text-[11px] text-baykus-muted">Film</div>
                <div className="font-bold tabular-nums">{formatMoney(Number(result.film_cost))}</div>
              </div>
              <div className="bk-card px-3 py-2">
                <div className="text-[11px] text-baykus-muted">Fire</div>
                <div className="font-bold tabular-nums">{formatMoney(Number(result.waste_cost))}</div>
              </div>
              <div className="bk-card px-3 py-2">
                <div className="text-[11px] text-emerald-800">Toplam</div>
                <div className="font-bold text-emerald-900 tabular-nums">{formatMoney(Number(result.total_cost))}</div>
              </div>
              <div className="bk-card px-3 py-2">
                <div className="text-[11px] text-sky-800">Birim</div>
                <div className="font-bold text-sky-900 tabular-nums">{formatMoney(Number(result.unit_cost))}</div>
              </div>
            </div>
          )}

          <form onSubmit={saveScenario} className="rounded border bg-white p-3 flex flex-wrap gap-3 items-end text-sm">
            <label className="flex-1 min-w-[180px]">
              <span className="text-[11px] text-baykus-muted">Senaryo adı</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="bk-input mt-0.5"
                placeholder="Örn. A4 standart"
              />
            </label>
            <label className="flex-1 min-w-[180px]">
              <span className="text-[11px] text-baykus-muted">Not</span>
              <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="bk-input mt-0.5" />
            </label>
            <button type="submit" className="bk-btn bk-btn-ghost text-xs">
              Senaryoyu kaydet
            </button>
          </form>

          <div className="bk-table-wrap">
            <table className="bk-table">
              <thead>
                <tr>
                  <th>Ad</th>
                  <th className="text-right">Adet</th>
                  <th className="text-right">Birim</th>
                  <th className="text-right">Toplam</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td className="text-right">{s.quantity}</td>
                    <td className="text-right tabular-nums">{formatMoney(Number(s.unit_cost || 0))}</td>
                    <td className="text-right tabular-nums">{formatMoney(Number(s.total_cost || 0))}</td>
                    <td className="text-right space-x-2 text-xs">
                      <button
                        type="button"
                        className="text-baykus-primary hover:underline"
                        onClick={() => {
                          setForm({
                            film_m2: String(s.film_m2),
                            film_unit_price: String(s.film_unit_price),
                            ink_cost: String(s.ink_cost),
                            labor_cost: String(s.labor_cost),
                            waste_percent: String(s.waste_percent),
                            quantity: String(s.quantity),
                            name: s.name,
                            note: s.note || "",
                          });
                          void calculateFilm();
                        }}
                      >
                        Yükle
                      </button>
                      <button type="button" className="text-red-600 hover:underline" onClick={() => remove(s.id)}>
                        Sil
                      </button>
                    </td>
                  </tr>
                ))}
                {scenarios.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-baykus-muted py-6">
                      Kayıtlı senaryo yok
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
