"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type PlanEvent = {
  tur: string;
  baslik: string;
  detay?: string;
  renk: string;
  href?: string | null;
};

type PlanDay = {
  date: string;
  label: string;
  is_today: boolean;
  events: PlanEvent[];
};

type WeeklyPlan = {
  week_start: string;
  week_end: string;
  today: string;
  days: PlanDay[];
};

function mondayOf(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function fmtTR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export default function WeeklyPlanPage() {
  const [weekStart, setWeekStart] = useState(() => toISODate(mondayOf(new Date())));
  const [data, setData] = useState<WeeklyPlan | null>(null);
  const [error, setError] = useState("");
  const [noteText, setNoteText] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await apiFetch<WeeklyPlan>(`/api/dashboard/weekly-plan?week_start=${weekStart}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  const rangeLabel = useMemo(() => {
    if (!data) return "";
    return `${fmtTR(data.week_start)} - ${fmtTR(data.week_end)}`;
  }, [data]);

  function shiftWeek(days: number) {
    const d = new Date(weekStart + "T12:00:00");
    d.setDate(d.getDate() + days);
    setWeekStart(toISODate(mondayOf(d)));
  }

  function goToday() {
    setWeekStart(toISODate(mondayOf(new Date())));
  }

  async function addNote() {
    if (!noteText.trim()) return;
    setNoteBusy(true);
    setError("");
    try {
      type NotesOut = { notes: { id: string; text: string; at: string }[] };
      const current = await apiFetch<NotesOut>("/api/dashboard/notes");
      const next = [
        { id: Math.random().toString(36).slice(2), text: noteText.trim(), at: new Date().toISOString() },
        ...(current.notes || []),
      ].slice(0, 100);
      await apiFetch("/api/dashboard/notes", {
        method: "PUT",
        body: JSON.stringify({ notes: next }),
      });
      setNoteText("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Not eklenemedi");
    } finally {
      setNoteBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Haftalık Plan</h2>
          <p className="text-xs text-baykus-muted">Operasyon › Haftalık Plan · teslim / kredi / not / masraf</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/orders/delivery" className="bk-btn bk-btn-ghost text-xs">
            Teslim Takibi
          </Link>
          <Link href="/orders/delivery-alarm" className="bk-btn bk-btn-ghost text-xs">
            Teslim Alarmı
          </Link>
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={load}>
            Yenile
          </button>
        </div>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="flex flex-wrap items-center gap-2 rounded border bg-[#f3f4f6] px-3 py-2">
        <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => shiftWeek(-7)}>
          &lt; Önceki Hafta
        </button>
        <div className="flex-1 text-center text-sm font-bold text-slate-900">{rangeLabel || "…"}</div>
        <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={goToday}>
          Bugün
        </button>
        <div className="flex items-center gap-1">
          <input
            className="bk-input text-xs w-48"
            placeholder="Not ekle…"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addNote();
              }
            }}
          />
          <button
            type="button"
            disabled={noteBusy || !noteText.trim()}
            className="bk-btn text-xs text-white"
            style={{ background: "#198754" }}
            onClick={() => void addNote()}
          >
            Not Ekle
          </button>
        </div>
        <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => shiftWeek(7)}>
          Sonraki Hafta &gt;
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
        {(data?.days || []).map((day) => (
          <div key={day.date} className="rounded border bg-white flex flex-col min-h-[220px]">
            <div
              className="px-2 py-2 text-center text-white text-xs font-bold"
              style={{ background: day.is_today ? "#be123c" : "#123d2a" }}
            >
              <div>{day.label}</div>
              <div className="opacity-90 font-normal">{fmtTR(day.date)}</div>
            </div>
            <div className="flex-1 p-2 space-y-1.5 overflow-auto max-h-[360px]">
              {day.events.length === 0 && (
                <div className="text-[11px] text-slate-400 px-1 py-2">Kayıt yok</div>
              )}
              {day.events.map((ev, i) => {
                const body = (
                  <div
                    className="rounded px-2 py-1.5 text-white text-[11px] leading-snug"
                    style={{ background: ev.renk || "#64748b" }}
                  >
                    <div className="font-bold opacity-90">{ev.tur}</div>
                    <div className="font-semibold">{ev.baslik}</div>
                    {ev.detay ? <div className="opacity-90 mt-0.5">{ev.detay}</div> : null}
                  </div>
                );
                return ev.href ? (
                  <Link key={i} href={ev.href} className="block hover:opacity-90">
                    {body}
                  </Link>
                ) : (
                  <div key={i}>{body}</div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
