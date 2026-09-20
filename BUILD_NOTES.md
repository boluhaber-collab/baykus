# BUILD_NOTES — Baykuş Baskı Web Monorepo

**Tarih:** 2026-09-20 ~14:00 TR (Europe/Istanbul)  
**Konum:** `/workspace/baykus-web`  
**Zip:** `/workspace/baykus-web.zip`

## Bu turda eklenenler (Raporlar — gerçek modül)

### API (`apps/api`)
- `GET /api/reports` — katalog
- `GET /api/reports/sales` — tarih / durum; özet + satırlar; `format=csv`; `/sales/print` HTML
- `GET /api/reports/stock` — qty, değer (cost|sale), kritik; CSV; `/stock/print`
- `GET /api/reports/receivables` — cari bakiyeler
- `GET /api/reports/payables` — tedarikçi borç
- `GET /api/reports/finance` — kasa+banka hareket (tarih, kaynak)
- `GET /api/reports/profit` — ay ciro vs onaylı satın alma (varsayımlar response’ta)
- JWT: admin / muhasebe / satış

### Web (`apps/web`, TR)
- `/reports` hub (kartlar)
- `/reports/sales|stock|receivables|payables|finance|profit`
- Filtreler, özet kartlar, tablo, CSV indir
- Sidebar: Raporlar (mevcut)

### Notlar
- Sahte satır yok; seed / canlı DB verisi
- Kar özeti bilinçli olarak basit (COGS değil) — UI + API assumptions

### Seed giriş
| E-posta | Şifre | Rol |
|---------|-------|-----|
| admin@baykus.local | admin123 | admin |

## Zip
`/workspace/baykus-web.zip` — `node_modules`, `.venv`, `__pycache__`, `.next` hariç.
