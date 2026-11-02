"use client";

import { VARIANT_DATALIST_IDS, VariantChoices } from "@/lib/variantOptions";

/** Renk / Beden / Baskı alanları için açılır öneri listeleri (Ayarlar > Varyant Yönetimi). */
export default function VariantDatalists({ choices }: { choices: VariantChoices }) {
  return (
    <>
      <datalist id={VARIANT_DATALIST_IDS.renk}>
        {choices.renk.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id={VARIANT_DATALIST_IDS.beden}>
        {choices.beden.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id={VARIANT_DATALIST_IDS.baski}>
        {choices.baski.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
    </>
  );
}
