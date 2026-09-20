"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Campaign, Customer, apiFetch } from "@/lib/api";

const DEFAULT_TEMPLATES: Record<string, string> = {
  "Doğum günü mesajı":
    "Merhaba {musteri}, doğum gününüzü kutlar; sağlıklı, mutlu ve güzel bir yıl dileriz. Baykuş Baskı",
  "Bayram mesajı":
    "Merhaba {musteri}, bayramınızı kutlar; sevdiklerinizle mutlu günler dileriz. Baykuş Baskı",
  "Kampanya mesajı":
    "Merhaba {musteri}, size özel kampanya ve baskı çözümlerimiz hakkında bilgi vermek isteriz. Baykuş Baskı",
  "Eski müşteriye tekrar ulaşma":
    "Merhaba {musteri}, uzun zamandır görüşemedik. Yeni baskı ihtiyaçlarınızda yardımcı olmaktan memnuniyet duyarız. Baykuş Baskı",
};

type WaLink = {
  customer_id: number;
  customer_name: string;
  phone: string;
  message: string;
  wa_url: string;
};

export default function CampaignsPage() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({
    title: "",
    message_template: DEFAULT_TEMPLATES["Kampanya mesajı"],
    start_date: "",
    end_date: "",
    active: true,
  });
  const [tplKey, setTplKey] = useState("Kampanya mesajı");
  const [customerQ, setCustomerQ] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [waMessage, setWaMessage] = useState(DEFAULT_TEMPLATES["Kampanya mesajı"]);
  const [links, setLinks] = useState<WaLink[]>([]);

  const load = useCallback(async () => {
    setError("");
    try {
      const [c, cust] = await Promise.all([
        apiFetch<Campaign[]>("/api/crm/campaigns"),
        apiFetch<Customer[]>("/api/customers"),
      ]);
      setItems(c);
      setCustomers(cust.filter((x) => x.is_active !== false));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredCustomers = useMemo(() => {
    const needle = customerQ.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter((c) =>
      [c.name, c.phone, c.company, c.special_day_note].filter(Boolean).join(" ").toLowerCase().includes(needle),
    );
  }, [customers, customerQ]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await apiFetch("/api/crm/campaigns", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          message_template: form.message_template,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          active: form.active,
        }),
      });
      setForm({
        title: "",
        message_template: DEFAULT_TEMPLATES["Kampanya mesajı"],
        start_date: "",
        end_date: "",
        active: true,
      });
      await load();
      setMsg("Kampanya eklendi");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    }
  }

  async function toggle(c: Campaign) {
    await apiFetch(`/api/crm/campaigns/${c.id}`, {
      method: "PUT",
      body: JSON.stringify({ active: !c.active }),
    });
    await load();
  }

  async function remove(id: number) {
    if (!confirm("Kampanyayı sil?")) return;
    await apiFetch(`/api/crm/campaigns/${id}`, { method: "DELETE" });
    await load();
  }

  function toggleAll(on: boolean) {
    if (!on) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(filteredCustomers.map((c) => c.id)));
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function generateWa() {
    setError("");
    setMsg("");
    setLinks([]);
    if (!selected.size) {
      setError("Mesaj gönderilecek müşterileri seçin");
      return;
    }
    if (!waMessage.trim()) {
      setError("Mesaj metni boş olamaz");
      return;
    }
    try {
      const res = await apiFetch<{ count: number; links: WaLink[]; note: string }>("/api/crm/bulk-wa", {
        method: "POST",
        body: JSON.stringify({
          customer_ids: Array.from(selected),
          message_template: waMessage,
        }),
      });
      setLinks(res.links || []);
      setMsg(`${res.count} wa.me linki hazır · Selenium yok`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Link üretilemedi");
    }
  }

  function openAll() {
    for (const l of links) {
      if (l.wa_url) window.open(l.wa_url, "_blank");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Özel Gün / Kampanya</h2>
          <p className="text-xs text-baykus-muted">
            Müşteri İletişim › kampanya CRUD + toplu wa.me (Selenium yok)
          </p>
        </div>
        <Link href="/crm/special-days" className="bk-btn bk-btn-ghost text-xs">
          Özel günler
        </Link>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{msg}</div>}

      <form onSubmit={create} className="rounded border bg-white p-3 grid md:grid-cols-2 gap-3 text-sm">
        <label className="md:col-span-2">
          <span className="text-[11px] text-baykus-muted">Başlık</span>
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="bk-input mt-0.5"
          />
        </label>
        <label>
          <span className="text-[11px] text-baykus-muted">Taslak</span>
          <select
            className="bk-input mt-0.5"
            value={tplKey}
            onChange={(e) => {
              setTplKey(e.target.value);
              const t = DEFAULT_TEMPLATES[e.target.value] || "";
              setForm({ ...form, message_template: t });
              setWaMessage(t);
            }}
          >
            {Object.keys(DEFAULT_TEMPLATES).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <label className="flex-1">
            <span className="text-[11px] text-baykus-muted">Başlangıç</span>
            <input
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              className="bk-input mt-0.5"
            />
          </label>
          <label className="flex-1">
            <span className="text-[11px] text-baykus-muted">Bitiş</span>
            <input
              type="date"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              className="bk-input mt-0.5"
            />
          </label>
        </div>
        <label className="md:col-span-2">
          <span className="text-[11px] text-baykus-muted">Mesaj şablonu</span>
          <textarea
            required
            rows={3}
            value={form.message_template}
            onChange={(e) => setForm({ ...form, message_template: e.target.value })}
            className="bk-input mt-0.5"
            placeholder="Merhaba {musteri}, ..."
          />
        </label>
        <div className="md:col-span-2">
          <button type="submit" className="bk-btn text-white text-xs" style={{ background: "#f59e0b" }}>
            Kampanya Ekle
          </button>
        </div>
      </form>

      <div className="space-y-2">
        {items.map((c) => (
          <div key={c.id} className="rounded border bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-sm">{c.title}</h3>
                <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{c.message_template}</p>
                <p className="text-xs text-slate-400 mt-2">
                  {c.start_date || "—"} → {c.end_date || "—"} · {c.active ? "aktif" : "pasif"}
                </p>
              </div>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  className="text-baykus-primary hover:underline"
                  onClick={() => {
                    setWaMessage(c.message_template);
                    setMsg(`Şablon yüklendi: ${c.title}`);
                  }}
                >
                  Toplu WA’da kullan
                </button>
                <button type="button" onClick={() => toggle(c)} className="text-baykus-primary hover:underline">
                  {c.active ? "Pasifleştir" : "Aktifleştir"}
                </button>
                <button type="button" onClick={() => remove(c.id)} className="text-red-600 hover:underline">
                  Sil
                </button>
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-baykus-muted">Kampanya yok.</p>}
      </div>

      <fieldset className="rounded border bg-white px-3 py-3 space-y-3">
        <legend className="px-1 text-xs font-semibold">Toplu WhatsApp (wa.me)</legend>
        <label className="block text-sm">
          <span className="text-[11px] text-baykus-muted">Mesaj</span>
          <textarea
            rows={3}
            className="bk-input mt-0.5"
            value={waMessage}
            onChange={(e) => setWaMessage(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            className="bk-input max-w-xs"
            placeholder="Müşteri ara…"
            value={customerQ}
            onChange={(e) => setCustomerQ(e.target.value)}
          />
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => toggleAll(true)}>
            Tümünü Seç
          </button>
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => toggleAll(false)}>
            Seçimi Temizle
          </button>
          <button
            type="button"
            className="bk-btn text-white text-xs"
            style={{ background: "#15803d" }}
            onClick={generateWa}
          >
            Seçilenlere Link Üret ({selected.size})
          </button>
        </div>
        <div className="bk-table-wrap max-h-64 overflow-auto">
          <table className="bk-table text-xs">
            <thead>
              <tr>
                <th></th>
                <th>Müşteri</th>
                <th>Telefon</th>
                <th>Özel not</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((c) => (
                <tr key={c.id}>
                  <td>
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} />
                  </td>
                  <td className="font-medium">{c.name}</td>
                  <td>{c.phone || "—"}</td>
                  <td className="text-baykus-muted">{c.special_day_note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {links.length > 0 && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <button type="button" className="bk-btn text-white text-xs" style={{ background: "#15803d" }} onClick={openAll}>
                Tümünü Aç ({links.length})
              </button>
              <span className="text-[11px] text-baykus-muted self-center">Tarayıcı pop-up engelini kontrol edin</span>
            </div>
            <ul className="text-xs space-y-1 max-h-48 overflow-auto">
              {links.map((l) => (
                <li key={l.customer_id} className="flex flex-wrap gap-2 items-center border-b py-1">
                  <span className="font-medium">{l.customer_name}</span>
                  <span className="text-baykus-muted">{l.phone || "tel yok"}</span>
                  <a href={l.wa_url} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">
                    wa.me aç
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </fieldset>
    </div>
  );
}
