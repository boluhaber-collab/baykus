import { redirect } from "next/navigation";

/** Finans hub = Hesaplarım (BizimHesap düzeni). */
export default function FinanceIndexPage() {
  redirect("/finance/banks");
}
