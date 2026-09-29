"use client";

import {
  DateSortDir,
  dateSortIndicator,
  dateSortLabel,
  toggleDateSort,
} from "@/lib/dateSort";

type Props = {
  dir: DateSortDir;
  onChange: (next: DateSortDir) => void;
  label?: string;
  className?: string;
};

/** Clickable "Tarih" column header — toggles newest↔oldest. */
export default function SortableDateHeader({
  dir,
  onChange,
  label = "Tarih",
  className = "",
}: Props) {
  return (
    <button
      type="button"
      className={`bk-th-sort ${className}`.trim()}
      title={`${dateSortLabel(dir)} — tıklayınca tersine çevir`}
      aria-label={`${label}: ${dateSortLabel(dir)}. Sıralamayı değiştir.`}
      onClick={() => onChange(toggleDateSort(dir))}
    >
      <span>{label}</span>
      <span className="bk-th-sort-ind" aria-hidden>
        {dateSortIndicator(dir)}
      </span>
    </button>
  );
}
