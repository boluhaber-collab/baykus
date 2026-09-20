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
    <div className="min-h-screen flex items-stretch bg-baykus-splash">
      <div className="hidden lg:flex w-1/2 flex-col justify-between p-10 border-r border-slate-800">
        <div>
          <Image
            src="/300x100logo.png"
            alt="Baykuş Baskı"
            width={240}
            height={80}
            className="object-contain mb-6"
            priority
          />
          <div className="text-baykus-accent text-sm tracking-[0.2em] uppercase">Baykuş Yazılım</div>
          <h1 className="mt-4 text-4xl font-bold text-white leading-tight">
            BAYKUŞ BASKI
            <span className="block text-baykus-accent text-2xl font-semibold mt-2">
              İşletme Programı
            </span>
          </h1>
          <p className="mt-6 text-slate-400 max-w-md text-sm leading-relaxed">
            Masaüstü Baykuş Baskı (v2.34) ile aynı merkezler: müşteri, stok, satış, atölye,
            e-ticaret, finans ve raporlar.
          </p>
        </div>
        <div className="text-xs text-slate-500">© Baykuş Baskı ERP · Tema Açık</div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-10 bg-gradient-to-br from-baykus-splash via-slate-900 to-slate-800">
        <div className="w-full max-w-md rounded-2xl border border-baykus-line bg-white shadow-xl p-8">
          <div className="text-center mb-7">
            <Image
              src="/ana_ekran_logo.png"
              alt="Baykuş"
              width={88}
              height={88}
              className="mx-auto rounded-full bg-slate-50 object-contain p-1"
              priority
            />
            <h1 className="text-xl font-bold text-baykus-text mt-3">BAYKUŞ BASKI</h1>
            <p className="text-xs text-baykus-muted mt-1 uppercase tracking-wider">İşletme Programı</p>
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
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={loading} className="bk-btn bk-btn-primary w-full py-2.5">
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
