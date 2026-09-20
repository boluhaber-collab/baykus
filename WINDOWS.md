# Windows — Docker yok (SQLite)

Bu rehber **PostgreSQL / Docker olmadan** Baykuş Baskı web ERP’yi Windows’ta çalıştırmak içindir.

| Bileşen | Adres |
|---------|--------|
| Web | http://localhost:3000 |
| API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |
| Veritabanı | `apps/api/baykus.db` (SQLite dosyası) |

**Giriş:** `admin@baykus.local` / `admin123`

---

## Gereksinimler

- **Python 3.11+** (PATH’te `py` veya `python`)
- **Node.js 20+** + npm
- PowerShell (Windows 10/11 ile gelir)

> SQLite için **Alembic çalıştırmayın**. Şema `create_all` ile oluşur.  
> Postgres / Docker yolu için `README.md` → Docker Compose.

---

## Hızlı kurulum (önerilen)

Repo kökünde PowerShell:

```powershell
cd C:\yol\baykus          # kendi klon yolunuz
.\scripts\run-windows.ps1
```

Script:

1. `.env` yazar (`DATABASE_URL=sqlite:///./baykus.db` + `NEXT_PUBLIC_API_URL`)
2. `apps/api` içinde venv + `pip install`
3. Bir kez `create_all` + seed çalıştırır
4. Gerekirse `apps/web` için `npm install`
5. **İki pencere** talimatı basar

### İki pencere

**Pencere 1 — API**

```powershell
cd C:\yol\baykus
.\scripts\dev-api-windows.ps1
```

**Pencere 2 — Web**

```powershell
cd C:\yol\baykus
.\scripts\dev-web-windows.ps1
```

Tarayıcı: http://localhost:3000

---

## Elle adımlar (script istemezseniz)

```powershell
cd C:\yol\baykus

# 1) .env
copy .env.example .env
# .env içinde Postgres satırını yorumlayıp şunu açın:
# DATABASE_URL=sqlite:///./baykus.db

# 2) API
cd apps\api
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:DATABASE_URL = "sqlite:///./baykus.db"
python -m app.bootstrap_sqlite
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Yeni PowerShell penceresi:

```powershell
cd C:\yol\baykus\apps\web
$env:NEXT_PUBLIC_API_URL = "http://localhost:8000"
npm install
npm run dev
```

---

## SQLite vs Postgres

| | SQLite (Windows kolay) | Postgres (Docker / prod benzeri) |
|--|------------------------|----------------------------------|
| `DATABASE_URL` | `sqlite:///./baykus.db` | `postgresql+psycopg2://baykus:baykus@localhost:5432/baykus` |
| Şema | `python -m app.bootstrap_sqlite` (`create_all`) | `alembic upgrade head` |
| Seed | bootstrap içinde veya `python -m app.seed` | `python -m app.seed` |
| Dosya | `apps/api/baykus.db` | Docker volume / yerel PG |

---

## Sorun giderme

- **ExecutionPolicy:**  
  `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`
- **Port dolu:** 8000 / 3000 kullanan süreci kapatın veya farklı port verin.
- **DB sıfırla:** API’yi durdurup `apps\api\baykus.db` silin, sonra tekrar `.\scripts\dev-api-windows.ps1`.
- **Module not found:** venv aktif mi? `apps\api` içinde mi çalışıyorsunuz?
- **CORS / login fail:** Web `NEXT_PUBLIC_API_URL=http://localhost:8000` ve API ayakta olmalı.

---

## Notlar

- `sqlite:///./baykus.db` yolu **`apps/api` çalışma dizinine** göredir.
- SQLAlchemy SQLite için `check_same_thread=False` kullanılır (`app/db/session.py`).
- Mevcut Postgres / `docker compose` yolu bozulmaz; sadece alternatif yerel yoldur.
