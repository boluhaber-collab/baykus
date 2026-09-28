# İşyeri paketleri

İki teslim seçeneği:

| Klasör | Ne | İşyerinde |
|--------|----|-----------|
| `tasinabilir/` | Gömülü Python + Node. `kurulum.bat` yok. | Zip aç → `baslat.bat` |
| `sade/` | Sistem Python 3.11+ ve Node LTS. | `kurulum.bat` (bir kez internet) → `baslat.bat` |

Paketleri Windows güncelleme PC'de üretmek için: `packaging/build-packs.ps1`

`guncelle.bat` her iki pakette de önce yedek alır, en sonda `baykus.db` + `uploads` yedekten geri yazar.
