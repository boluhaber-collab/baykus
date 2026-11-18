/** Stok hareketi neden kodu → Türkçe etiket */
const LABELS: Record<string, string> = {
  sale: "Satış",
  sale_cancel: "Satış iptali / iade",
  sale_edit: "Satış düzenleme (fark)",
  purchase_cancel: "Alış iptali",
  purchase_edit: "Alış düzenleme (eski satır geri alındı)",
  bizimhesap_import: "BizimHesap aktarımı",
  dupfix: "Çift hareket onarımı",
};

export function stockReasonLabel(reason?: string | null): string {
  const r = (reason || "").trim();
  if (!r) return "";
  return LABELS[r] || r;
}
