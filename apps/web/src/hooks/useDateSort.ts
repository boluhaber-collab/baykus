"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_DATE_SORT,
  DateSortDir,
  sortByDate,
} from "@/lib/dateSort";

/** Client-side newest↔oldest sort for any transaction row list. */
export function useDateSort<T>(
  rows: T[],
  getDate: (row: T) => string | null | undefined,
  getTie?: (row: T) => string | number | null | undefined,
  defaultDir: DateSortDir = DEFAULT_DATE_SORT,
) {
  const [dir, setDir] = useState<DateSortDir>(defaultDir);
  const sorted = useMemo(
    () => sortByDate(rows, getDate, dir, getTie),
    [rows, getDate, getTie, dir],
  );
  return { dir, setDir, sorted };
}
