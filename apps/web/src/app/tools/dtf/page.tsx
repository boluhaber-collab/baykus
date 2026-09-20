"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { DtfCalcResult, DtfScenario, apiFetch, formatMoney } from "@/lib/api";

export default function DtfPage() {
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
      setScenarios(await apiFetch<DtfScenario[]>("/api/tools/dtf/scenarios"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Senaryo yükleme hatası");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function payload() {
    return {
      film_m2: Number(form.film_m2) || 0,
      film_unit_price: Number(form.film_unit_price) || 0,
      ink_cost: Number(form.ink_cost) || 0,
      labor_cost: Number(form.labor_cost) || 0,
      waste_percent: Number(form.waste_percent) || 0,
      quantity: Math.max(1, Number(form.quantity) || 1),
    };
  }

  async function calculate(e?: FormEvent) {
    e?.preventDefault();
    setError("");
    try {
      setResult(await apiFetch<DtfCalcResult>("/api/tools/dtf/calculate", {
        method: "POST",
        body: JSON.stringify(payload()),
      }));
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
        body: JSON.stringify({ ...payload(), name: form.name.trim(), note: form.note || null }),
      });
      setMsg("Senaryo kaydedildi");
      setForm({ ...form, name: "" });
      await load();
      await calculate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    }
  }

  async function remove(id: number) {
    if (!confirm("Senaryoyu sil?")) return;
    await apiFetch(`/api/tools/dtf/scenarios/${id}`, { method: "DELETE" });
    await load();
  }

  function loadScenario(s: DtfScenario) {
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
    setResult({
      film_cost: 0,
      base_cost: 0,
      waste_cost: 0,
      total_cost: Number(s.total_cost || 0),
      unit_cost: Number(s.unit_cost || 0),
      quantity: s.quantity,
    });
    void calculate();
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">DTF maliyet hesaplayıcı</h1>
        <p className="text-sm text-slate-500">Film m², mürekkep, işçilik, fire % → birim + toplam</p>
      </div>
      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}
      {msg && <div className="mb-4 rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm">{msg}</div>}

      <form onSubmit={calculate} className="mb-4 rounded-xl border bg-white p-4 shadow-sm grid md:grid-cols-3 gap-3">
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
          <label key={key} className="text-sm">
            <span className="text-slate-500">{label}</span>
            <input
              type="number"
              step="any"
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
        ))}
        <div className="md:col-span-3">
          <button type="submit" className="rounded-lg bg-baykus-700 text-white px-4 py-2 text-sm">Hesapla</button>
        </div>
      </form>

      {result && (
        <div className="mb-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border bg-slate-50 p-4">
            <div className="text-xs text-slate-500">Film maliyeti</div>
            <div className="text-lg font-bold tabular-nums">{formatMoney(Number(result.film_cost))}</div>
          </div>
          <div className="rounded-xl border bg-slate-50 p-4">
            <div className="text-xs text-slate-500">Fire</div>
            <div className="text-lg font-bold tabular-nums">{formatMoney(Number(result.waste_cost))}</div>
          </div>
          <div className="rounded-xl border bg-emerald-50 p-4">
            <div className="text-xs text-emerald-800">Toplam</div>
            <div className="text-lg font-bold text-emerald-900 tabular-nums">{formatMoney(Number(result.total_cost))}</div>
          </div>
          <div className="rounded-xl border bg-sky-50 p-4">
            <div className="text-xs text-sky-800">Birim maliyet</div>
            <div className="text-lg font-bold text-sky-900 tabular-nums">{formatMoney(Number(result.unit_cost))}</div>
          </div>
        </div>
      )}

      <form onSubmit={saveScenario} className="mb-6 rounded-xl border bg-white p-4 shadow-sm flex flex-wrap gap-3 items-end">
        <label className="text-sm flex-1 min-w-[200px]">
          <span className="text-slate-500">Senaryo adı</span>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="Örn. A4 standart" />
        </label>
        <label className="text-sm flex-1 min-w-[200px]">
          <span className="text-slate-500">Not</span>
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        <button type="submit" className="rounded-lg border border-baykus-700 text-baykus-800 px-4 py-2 text-sm">Senaryoyu kaydet</button>
      </form>

      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2">Ad</th>
              <th className="px-4 py-2 text-right">Adet</th>
              <th className="px-4 py-2 text-right">Birim</th>
              <th className="px-4 py-2 text-right">Toplam</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="px-4 py-2">{s.name}</td>
                <td className="px-4 py-2 text-right">{s.quantity}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatMoney(Number(s.unit_cost || 0))}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatMoney(Number(s.total_cost || 0))}</td>
                <td className="px-4 py-2 text-right space-x-2">
                  <button onClick={() => loadScenario(s)} className="text-baykus-700 hover:underline">Yükle</button>
                  <button onClick={() => remove(s.id)} className="text-red-600 hover:underline">Sil</button>
                </td>
              </tr>
            ))}
            {scenarios.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">Kayıtlı senaryo yok</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
