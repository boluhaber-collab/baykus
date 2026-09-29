# BH → Baykuş gap inventory BEFORE — 2026-09-29 (Europe/Istanbul)

Source DBs: box `/workspace/baykus-web/apps/api/baykus.db` vs PC `C:\Users\engin\Desktop\baykus\apps\api\baykus.db`.
BH portal KPI (scraped 21:33 TR): Eylül Cirosu **14.153,44** · Masraf 17.552,86 · Kasa 402,06 · Banka 3.270,32.

## Counts

| Domain | Box | PC | Expected / notes | Gap |
|--------|----:|---:|------------------|------|
| Customers (cari) | 37 | 37 | BH list ~37 | OK |
| Suppliers | 13 | 13 | BH list ~13 | OK |
| cari_movements | 159 | 159 | ekstre PDF | OK totals; **Sep sales only 210** |
| supplier_movements | 213 | 213 | ekstre PDF | OK |
| cash_movements | 311 | 311 | GetCashTrx (TL Kasa 314−3 zero) | OK Sep 27 |
| bank_movements | 1085 | 1085 | GetCashTrx all banks/POS/KK/ortak | OK Sep 27 |
| expense_categories | 5 (demo) | **39** | BH masraf kalemi ~39 | **BOX MISSING** |
| expenses | 4 (demo) | **597** | BH masraf ~597 | **BOX MISSING** |
| loans / installments | 3 / 94 | 3 / 94 | kredler | OK |
| products / variants | 97 / 3034 | 96 / 3034 | B2B stock | OK-ish |
| assets (demirbaş) | 6 | 7 | panel demirbaş | minor |
| orders | 10 (demo) | **0** (wiped) | local | PC wiped demo |
| Perakende Satışlar customer | none | none | needed for ciro | **MISSING** |
| GetSalesReport archive | HTML shell only | none | full-range JSON | **MISSING** |
| Invoice/ekstre PDF archive under docs/archives | no dated pack | partial tmp | offline keep | **MISSING dated archive** |

## Eylül 2026 ciro (BH 14.153,44)

| Source in Baykuş | Amount |
|------------------|-------:|
| cari_movements sale Sep | 210,00 |
| cash_movements note∋Perakende Sep | 4.950,00 |
| bank_movements note∋Perakende Sep | 8.993,44 |
| **Sum** | **14.153,44** |

Sales report (commit 60dec29) reads **only cari sale** → shows ~210 / 0 for Ana Sayfa parity. Perakende lives on kasa/banka as Tahsilat, not on a customer card.

## Priority actions

1. Live refresh GetCashTrx + masraflar + krediler + stock + KPI + **GetSalesReport** full range.
2. Materialize Perakende → cari sale(+payment) so sales report / KPIs use complete set.
3. Import masraflar into box DB; keep PC as prod.
4. Archive raw BH under `apps/api/data/bh-export-20260929` (+ docs/archives pointer).
5. Push main → PC pull → restart.
