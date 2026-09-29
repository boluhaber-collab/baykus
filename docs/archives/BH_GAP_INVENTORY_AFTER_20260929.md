# BH → Baykuş gap inventory AFTER — 2026-09-29 (Europe/Istanbul)

## Box DB (`apps/api/baykus.db`) after imports

| Domain | Before | After | Status |
|--------|-------:|------:|--------|
| Customers | 37 | **38** (+Perakende Satışlar) | OK |
| cari_movements | 159 | **1031** (+872 perakende sale+pay) | OK |
| expenses / cats | 4 / 5 demo | **597 / 39** | OK |
| Sep 2026 cari sales | 210,00 | **14.153,44** | **matches BH Eylül Cirosu** |
| cash/bank/supplier/loans/stock | unchanged | same | OK (live GetCashTrx refresh identical) |

## Live scrapes refreshed

- GetSalesReport `tmp/bizimhesap/sales/` — 626 line rows, Sep MtNet=14.153,44
- GetCashTrx Hesaplarım — balances unchanged vs 27.09 reconcile
- Masraflar — 39 cats / 597 expenses
- Krediler — 3 loans / 94 installments
- Dashboard KPIs — Eylül 14.153,44 / masraf 17.552,86 / kasa 402,06 / banka 3.270,32

## Archive

`apps/api/data/bh-export-20260929/` (+ `docs/archives/bh-export-20260929.tgz`, PC mirror under same relative path)

## Remaining / OOS

- Banka EUR Hesabı (hidden, 0 moves)
- Ekstre PDF re-pull not re-run (existing full-range PDFs in archive; Sep already in data)
- Box still has 10 demo orders (PC wiped to 0) — cosmetic
- GetSalesReport BAY FEROO lines already on cari via ekstre — not double-imported (filter DsIdentity=Perakende only)
