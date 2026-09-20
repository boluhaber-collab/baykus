"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@baykus.local");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Giriş başarısız");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-stretch bg-[#0b1220]">
      <div className="hidden lg:flex w-[48%] flex-col justify-between p-10 relative overflow-hidden border-r border-slate-800">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(ellipse at 30% 20%, #1e3a5f 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, #0f766e55 0%, transparent 50%)",
          }}
        />
        <div className="relative z-10">
          <Image
            src="/300x100logo.png"
            alt="Baykuş Baskı"
            width={260}
            height={86}
            className="object-contain mb-8 drop-shadow-lg"
            priority
          />
          <div className="text-baykus-accent text-xs tracking-[0.28em] uppercase font-semibold">
            Baykuş Yazılım
          </div>
          <h1 className="mt-4 text-4xl font-bold text-white leading-tight">
            BAYKUŞ BASKI
            <span className="block text-teal-300 text-2xl font-semibold mt-2">İşletme Programı</span>
          </h1>
          <p className="mt-6 text-slate-400 max-w-md text-sm leading-relaxed">
            Masaüstü Baykuş Baskı ile aynı merkezler: müşteri, stok, satış, atölye, e-ticaret, finans ve
            raporlar. Web arayüzü 1:1 parity.
          </p>
          <ul className="mt-8 space-y-2 text-sm text-slate-400">
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-400" /> Sipariş · üretim · teslim
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Cari · kasa · tedarikçi fişleri
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400" /> Rapor · PDF · barkod etiket
            </li>
          </ul>
        </div>
        <div className="relative z-10 text-xs text-slate-500">© Baykuş Baskı ERP · Tema Açık</div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-10 bg-gradient-to-br from-[#0b1220] via-slate-900 to-slate-800">
        <div className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-white shadow-2xl shadow-black/40 p-8">
          <div className="text-center mb-7">
            <div className="mx-auto h-24 w-24 rounded-full bg-gradient-to-b from-slate-50 to-slate-100 border border-slate-200 flex items-center justify-center shadow-inner">
              <Image
                src="/ana_ekran_logo.png"
                alt="Baykuş"
                width={72}
                height={72}
                className="object-contain"
                priority
              />
            </div>
            <h1 className="text-xl font-bold text-baykus-text mt-3 tracking-wide">BAYKUŞ BASKI</h1>
            <p className="text-xs text-baykus-muted mt-1 uppercase tracking-[0.2em]">İşletme Programı</p>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-baykus-muted mb-1">E-posta</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bk-input"
                required
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-baykus-muted mb-1">Şifre</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bk-input"
                required
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="bk-btn bk-btn-primary w-full py-2.5 font-semibold tracking-wide"
            >
              {loading ? "Giriş yapılıyor…" : "Giriş Yap"}
            </button>
          </form>
          <p className="mt-6 text-[11px] text-center text-baykus-muted">
            Demo: admin@baykus.local / admin123
          </p>
        </div>
      </div>
    </div>
  );
}
