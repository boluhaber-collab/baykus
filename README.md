# Baykuş Baskı — Web ERP İskeleti

Özel baskı / promosyon işletmeleri için **yerel monorepo** iskeleti.

| Uygulama | Teknoloji | Port |
|----------|-----------|------|
| `apps/web` | Next.js 15 (App Router) + React + TypeScript + Tailwind | 3000 |
| `apps/api` | FastAPI + SQLAlchemy 2 + Alembic + Pydantic v2 | 8000 |
| `db` | PostgreSQL 16 | 5432 |

## Hızlı başlangıç (Docker Compose)

```bash
git clone <repo> baykus-web
cd baykus-web
cp .env.example .env

docker compose up --build
```

- Web: http://localhost:3000  
- API docs: http://localhost:8000/docs  
- Health: http://localhost:8000/health  

### Giriş bilgileri (seed)

| Rol | E-posta | Şifre |
|-----|---------|-------|
| **admin** | `admin@baykus.local` | `admin123` |
| satış | `satis@baykus.local` | `satis123` |
| üretim | `uretim@baykus.local` | `uretim123` |
| muhasebe | `muhasebe@baykus.local` | `muhasebe123` |

1. http://localhost:3000/login adresine gidin.  
2. Admin ile giriş yapın.  
3. **Gösterge Paneli** canlı KPI’ları gösterir (`GET /api/dashboard/summary`: sipariş/ciro, kanban, kritik stok, alacaklar, kasa/banka).  
4. Sol menüden **Müşteriler** → liste / yeni / detay (cari ekstre + ödeme).
5. **Cari / Alacaklar** → açık alacaklar özeti.
6. **Siparişler** / **Kanban** → seed kartları, durum değiştirme, sipariş oluşturma.
7. **Ürünler** → liste / yeni / detay (varyant + stok hareketi); **Stok** / **Kritik stok** filtreleri.  
8. **Tedarikçiler** / **Satın Alma** / **Borçlar** → tedarikçi kartı, satın alma onayı (stok+borç), ödeme.  
9. **Finans** → kasa/banka özeti; **Kasa** hareket ekle; **Banka** hesap detayı + hareket.  
10. **Raporlar** → hub kartları; her rapor filtre + tablo + CSV.  

## Windows (Docker yok)

SQLite ile Docker / PostgreSQL olmadan çalıştırma:

→ **[WINDOWS.md](WINDOWS.md)** (Türkçe adımlar)

```powershell
.\scripts\run-windows.ps1
# sonra iki pencere:
.\scripts\dev-api-windows.ps1
.\scripts\dev-web-windows.ps1
```

`DATABASE_URL=sqlite:///./baykus.db` → şema için **Alembic değil**, `python -m app.bootstrap_sqlite` (`create_all` + seed).

---

## Docker olmadan (yerel geliştirme)

### 1) PostgreSQL

```bash
# örn. Docker ile sadece DB:
docker run -d --name baykus-db -e POSTGRES_USER=baykus -e POSTGRES_PASSWORD=baykus \
  -e POSTGRES_DB=baykus -p 5432:5432 postgres:16-alpine
```

### 2) API (Python 3.12 + uv veya pip)

```bash
cd apps/api
python3.12 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

export DATABASE_URL=postgresql+psycopg2://baykus:baykus@localhost:5432/baykus
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload --port 8000
```

`uv` ile:

```bash
cd apps/api
uv venv && source .venv/bin/activate
uv pip install -r requirements.txt
# ... aynı alembic / seed / uvicorn
```

### 3) Web (Node 20+)

```bash
cd apps/web
npm install
export NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```

## Modüller

- **Gösterge paneli** — `GET /api/dashboard/summary` (sipariş bugün/ay, durum sayıları, kritik stok, cari alacak, kasa/banka, son listeler); legacy `GET /api/dashboard/kpis`
- **Müşteriler + Cari** (kart, açılış bakiyesi, ekstre, ödeme/düzeltme, açık alacaklar)
- **Ürünler / Stok** (tam CRUD: kart, varyant, stok giriş-çıkış, hareket geçmişi, kritik stok)
- Teklifler (stub)
- **Siparişler** (tam CRUD: liste / yeni / detay) + **Kanban** (durum kolonları, karttan durum değiştirme, seed demo)
- **Tedarikçiler + Satın Alma + Borçlar** (kart, ekstre, ödeme, satın alma onayında stok/borç)
- **Finans / Kasa / Banka** (özet, kasa hareketleri, banka hesapları + hareketler, transfer)
- **Raporlar** (canlı): satış, stok, cari/alacak, tedarikçi borç, kasa/banka hareket, kar özeti (basit)
  - Hub: `/reports` · API: `GET /api/reports/...` (+ `format=csv`)
- WhatsApp şablonları (stub)
- Ayarlar / kullanıcılar + RBAC roller: `admin`, `satış`, `üretim`, `muhasebe`

## Kimlik doğrulama

- JWT (OAuth2 password flow → Bearer token)
- Roller: admin tüm endpoint’lere erişir; diğer roller router bazlı kısıtlanır

## Veritabanı

Alembic migrations `001`–`006_suppliers_purchases`:  
`users`, `roles`, `user_roles`, `customers` (+ cari), `cari_movements`, `products`, `product_variants`, `stock_movements`, `orders`, `order_lines`, `payments`, `order_status_history`, `cash_registers`, `cash_movements`, `bank_accounts`, `bank_movements`, `suppliers`, `supplier_movements`, `purchases`, `purchase_lines`

## Güvenlik notu

`.env.example` içindeki değerler **yalnızca geliştirme** içindir. Üretimde `SECRET_KEY` ve DB şifrelerini değiştirin. Gerçek müşteri / masaüstü uygulama verisi kopyalanmamıştır.

## Lisans

İç kullanım / iskelet — özel proje.
