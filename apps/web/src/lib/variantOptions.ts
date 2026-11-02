"use client";

import { useEffect, useState } from "react";
import { VariantOption, apiFetch } from "@/lib/api";

/** Ayarlar > Varyant Yönetimi değerleri (Renk / Beden / Baskı), ayarlardaki sırayla. */
export type VariantChoices = { renk: string[]; beden: string[]; baski: string[] };

export const VARIANT_DATALIST_IDS = {
  renk: "bk-variant-renk",
  beden: "bk-variant-beden",
  baski: "bk-variant-baski",
} as const;

function trKey(v: string): string {
  return v.toLocaleLowerCase("tr").trim();
}

export function useVariantChoices(): VariantChoices {
  const [choices, setChoices] = useState<VariantChoices>({ renk: [], beden: [], baski: [] });
  useEffect(() => {
    let alive = true;
    apiFetch<VariantOption[]>("/api/settings/variants")
      .then((rows) => {
        if (!alive) return;
        const pick = (kind: string) =>
          rows.filter((r) => trKey(r.kind) === trKey(kind)).map((r) => r.value);
        setChoices({ renk: pick("Renk"), beden: pick("Beden"), baski: pick("Baskı") });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return choices;
}
