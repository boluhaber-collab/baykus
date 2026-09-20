
## gunluk_kasa_paneli (line 27188)
def gunluk_kasa_paneli():
    if not os.path.exists(SIPARIS_DOSYASI):
        messagebox.showwarning("Günlük Kasa", "Henüz sipariş kaydı yok.")
        return

    if DateEntry is None:
        messagebox.showerror(
            "Eksik Kütüphane",
            "Takvim özelliği için tkcalendar kurulmalı.\n\nCMD'de şu komutu çalıştırın:\npip install tkcalendar"
        )
        return

    siparis_dosyasi_duzenle()

    _, pencere_kasa = ana_sag_icerik_sayfasi_ac(
        "Günlük Kasa",
        yol="Finans  ›  Günlük Kasa",
    )

    ust = tk.Frame(pencere_kasa)
    ust.pack(fill="x", padx=10, pady=8)

    bugun_dt = datetime.now()

    tk.Label(ust, text="Başlangıç:").pack(side="left", padx=4)
    entry_baslangic = DateEntry(
        ust,
        width=13,
        date_pattern="dd.mm.yyyy",
        locale="tr_TR"
    )
    entry_baslangic.set_date(bugun_dt)
    entry_baslangic.pack(side="left", padx=4)

    tk.Label(ust, text="Bitiş:").pack(side="left", padx=4)
    entry_bitis = DateEntry(
        ust,
        width=13,
        date_pattern="dd.mm.yyyy",
        locale="tr_TR"
    )
    entry_bitis.set_date(bugun_dt)
    entry_bitis.pack(side="left", padx=4)

    ozet_frame = tk.LabelFrame(pencere_kasa, text="Kasa Özeti", padx=10, pady=10)
    ozet_frame.pack(fill="x", padx=10, pady=5)

    lbl_siparis = tk.Label(ozet_frame, text="Sipariş: 0", font=("Arial", 12, "bold"))
    lbl_siparis.grid(row=0, column=0, padx=18, pady=5, sticky="w")

    lbl_ciro = tk.Label(ozet_frame, text="Ciro: 0 TL", font=("Arial", 12, "bold"))
    lbl_ciro.grid(row=0, column=1, padx=18, pady=5, sticky="w")

    lbl_tahsilat = tk.Label(ozet_frame, text="Tahsilat/Kapora: 0 TL", font=("Arial", 12, "bold"))
    lbl_tahsilat.grid(row=0, column=2, padx=18, pady=5, sticky="w")

    lbl_kalan = tk.Label(ozet_frame, text="Kalan Alacak: 0 TL", font=("Arial", 12, "bold"))
    lbl_kalan.grid(row=0, column=3, padx=18, pady=5, sticky="w")

    lbl_maliyet = tk.Label(ozet_frame, text="Maliyet: 0 TL", font=("Arial", 12, "bold"))
    lbl_maliyet.grid(row=1, column=0, padx=18, pady=5, sticky="w")

    lbl_kar = tk.Label(ozet_frame, text="Brüt Kâr: 0 TL", font=("Arial", 12, "bold"))
    lbl_kar.grid(row=1, column=1, padx=18, pady=5, sticky="w")

    lbl_gider = tk.Label(ozet_frame, text="Gider: 0 TL", font=("Arial", 12, "bold"))
    lbl_gider.grid(row=1, column=2, padx=18, pady=5, sticky="w")

    lbl_net_kazanc = tk.Label(ozet_frame, text="Net Kazanç: 0 TL", font=("Arial", 12, "bold"))
    lbl_net_kazanc.grid(row=1, column=3, padx=18, pady=5, sticky="w")

    lbl_teklif = tk.Label(ozet_frame, text="Teklif: 0", font=("Arial", 12, "bold"))
    lbl_teklif.grid(row=2, column=0, padx=18, pady=5, sticky="w")

    lbl_teslim = tk.Label(ozet_frame, text="Teslim Edilen: 0", font=("Arial", 12, "bold"))
    lbl_teslim.grid(row=2, column=1, padx=18, pady=5, sticky="w")

    lbl_aralik = tk.Label(ozet_frame, text="Tarih Aralığı: -", font=("Arial", 10, "bold"))
    lbl_aralik.grid(row=2, column=2, columnspan=2, padx=18, pady=5, sticky="w")

    lbl_en_urun = tk.Label(ozet_frame, text="En Çok Satılan Ürün: -", font=("Arial", 10, "bold"))
    lbl_en_urun.grid(row=3, column=0, columnspan=2, padx=18, pady=5, sticky="w")

    lbl_en_kategori = tk.Label(ozet_frame, text="En Çok Kazandıran Kategori: -", font=("Arial", 10, "bold"))
    lbl_en_kategori.grid(row=3, column=2, columnspan=2, padx=18, pady=5, sticky="w")

    kolonlar = ("Sipariş No", "Belge Tipi", "Tarih", "Müşteri", "Telefon", "Ürün", "Adet", "Genel Toplam", "Kapora", "Kalan Ödeme", "Kar", "Durum")
    tablo_kasa = ttk.Treeview(pencere_kasa, columns=kolonlar, show="headings")

    for kolon in kolonlar:
        tablo_kasa.heading(kolon, text=kolon)
        tablo_kasa.column(kolon, width=110)

    tablo_kasa.pack(fill="both", expand=True, padx=10, pady=10)

    hareket_frame = tk.LabelFrame(pencere_kasa, text="Kasa / Banka Hareketleri", padx=6, pady=6)
    hareket_frame.pack(fill="both", expand=True, padx=10, pady=(0, 8))
    hareket_kolonlar = ("Tarih", "Kaynak", "Hesap", "İşlem", "Açıklama", "Giriş", "Çıkış", "Ödeme Türü")
    tablo_hareket = agac_tablo_scroll_ekle(hareket_frame, hareket_kolonlar, height=8)
    for kolon in hareket_kolonlar:

## acik_bakiyeler_penceresi (line 26771)
def acik_bakiyeler_penceresi():
    siparis_dosyasi_duzenle()

    _, win = ana_sag_icerik_sayfasi_ac(
        "Açık Bakiyeler",
        yol="Finans  ›  Açık Bakiyeler",
    )
    win.configure(bg="#eef1f6")

    ust = tk.Frame(win, bg="#eef1f6")
    ust.pack(fill="x", padx=12, pady=(10, 6))

    ozet_kart = tk.Frame(ust, bg="#fff7ed", highlightbackground="#fed7aa", highlightthickness=1)
    ozet_kart.pack(side="left", fill="x", expand=True, padx=(0, 10))
    tk.Label(
        ozet_kart,
        text="Açık Bakiyeler",
        bg="#fff7ed",
        fg="#9a3412",
        font=("Segoe UI", 15, "bold")
    ).pack(anchor="w", padx=14, pady=(10, 2))
    lbl_ozet = tk.Label(
        ozet_kart,
        text="Yükleniyor...",
        bg="#fff7ed",
        fg="#334155",
        font=("Segoe UI", 10, "bold"),
        justify="left"
    )
    lbl_ozet.pack(anchor="w", padx=14, pady=(0, 10))

    filtre = tk.LabelFrame(win, text="Filtre", padx=8, pady=8, bg="#eef1f6")
    filtre.pack(fill="x", padx=12, pady=(0, 8))
    tk.Label(filtre, text="Ara", bg="#eef1f6").grid(row=0, column=0, padx=(4, 5), pady=3, sticky="w")
    entry_ara = tk.Entry(filtre, width=34)
    entry_ara.grid(row=0, column=1, padx=5, pady=3, sticky="ew")
    tk.Label(filtre, text="Durum", bg="#eef1f6").grid(row=0, column=2, padx=(14, 5), pady=3, sticky="w")
    combo_durum = ttk.Combobox(
        filtre,
        values=["Tümü", "Sipariş Alındı", "Hazırlanıyor", "Baskıda", "Hazır", "Teslim Edildi"],
        width=18,
        state="readonly"
    )
    combo_durum.set("Tümü")
    combo_durum.grid(row=0, column=3, padx=5, pady=3, sticky="w")
    filtre.grid_columnconfigure(1, weight=1)

    btn_frame = tk.Frame(filtre, bg="#eef1f6")
    btn_frame.grid(row=0, column=4, padx=(14, 4), pady=3, sticky="e")

    kolonlar = (
        "Müşteri",
        "Telefon",
        "Sipariş No",
        "Tarih",
        "Teslim Tarihi",
        "Durum",
        "Toplam",
        "Kapora/Tahsilat",
        "Açık Bakiye",
        "Ürünler",
    )
    tablo = agac_tablo_scroll_ekle(win, kolonlar, height=22)
    tablo.column("Müşteri", width=190, anchor="w")
    tablo.column("Telefon", width=110, anchor="center")
    tablo.column("Sipariş No", width=100, anchor="center")
    tablo.column("Tarih", width=120, anchor="center")
    tablo.column("Teslim Tarihi", width=105, anchor="center")
    tablo.column("Durum", width=115, anchor="center")
    tablo.column("Toplam", width=110, anchor="e")
    tablo.column("Kapora/Tahsilat", width=125, anchor="e")
    tablo.column("Açık Bakiye", width=125, anchor="e")
    tablo.column("Ürünler", width=380, anchor="w")
    for kolon in kolonlar:
        tablo.heading(kolon, text=kolon)
    tablo.tag_configure("geciken", background="#fee2e2")
    tablo.tag_configure("teslim", background="#fef3c7")
    tablo.tag_configure("normal", background="#ffffff")

    satir_verileri = {}

    def acik_bakiye_satirlari():
        if not os.path.exists(SIPARIS_DOSYASI):
            return []
        df = guvenli_excel_oku(SIPARIS_DOSYASI)
        if df.empty or "Sipariş No" not in df.columns:
            return []
        if "Belge Tipi" in df.columns:
            df = df[~df["Belge Tipi"].apply(belge_tipi_teklif_mi)]
        if "Durum" in df.columns:
            iptal_maskesi = df["Durum"].astype(str).apply(lambda d: cari_metin_normalize(d) in {"sipariş iptali", "siparis iptali", "iptal", "iptal edildi"})
            df = df[~iptal_maskesi]
        if df.empty:
            return []

        satirlar = []
        bugun = datetime.now().date()
        for siparis_no, grup in df.groupby(df["Sipariş No"].astype(str), dropna=False):
            siparis_no = str(siparis_no or "").strip()
            if not siparis_no or siparis_no.lower() == "nan":

## banka_hesaplari_paneli (line 27833)
def banka_hesaplari_paneli():
    finans_dosyalari_duzenle()

    _, hesap_sayfa_govde = ana_sag_icerik_sayfasi_ac(
        "Hesaplarım",
        yol="Finans  ›  Hesaplarım",
    )
    win, _, _ = kaydirilabilir_icerik_olustur(hesap_sayfa_govde, bg=RENK_ARKA)

    ust = tk.LabelFrame(win, text="Hesap Ekle / Güncelle", padx=10, pady=10)
    ust.pack(fill="x", padx=10, pady=8)

    tk.Label(ust, text="Hesap Türü").grid(row=0, column=0, padx=5, pady=5)
    combo_hesap_turu = ttk.Combobox(ust, values=["Banka", "POS", "Kredi Kartı", "Şirket Ortağı"], width=18, state="readonly")
    combo_hesap_turu.set("Banka")
    combo_hesap_turu.grid(row=0, column=1, padx=5, pady=5)

    lbl_banka_kurum = tk.Label(ust, text="Banka / Kurum")
    lbl_banka_kurum.grid(row=0, column=2, padx=5, pady=5)
    entry_banka = tk.Entry(ust, width=20)
    entry_banka.grid(row=0, column=3, padx=5, pady=5)
    entry_hesap = tk.Entry(ust, width=24)
    lbl_hesap_adi = tk.Label(ust, text="Hesap Adı")
    lbl_hesap_adi.grid(row=0, column=4, padx=5, pady=5)
    entry_hesap.grid(row=0, column=5, padx=5, pady=5)
    lbl_iban = tk.Label(ust, text="IBAN")
    lbl_iban.grid(row=1, column=0, padx=5, pady=5)
    entry_iban = tk.Entry(ust, width=34)
    entry_iban.grid(row=1, column=1, columnspan=3, padx=5, pady=5, sticky="ew")
    tk.Label(ust, text="Devir Bakiye").grid(row=1, column=4, padx=5, pady=5)
    entry_acilis = tk.Entry(ust, width=14)
    entry_acilis.insert(0, "0")
    entry_acilis.grid(row=1, column=5, padx=5, pady=5)
    tk.Label(ust, text="Not").grid(row=2, column=0, padx=5, pady=5)
    entry_not = tk.Entry(ust, width=58)
    entry_not.grid(row=2, column=1, columnspan=5, padx=5, pady=5, sticky="ew")

    def hesap_turu_formunu_ayarla(event=None):
        ortak_hesabi = combo_hesap_turu.get().strip() == "Şirket Ortağı"
        if ortak_hesabi:
            lbl_banka_kurum.config(text="Hesap Grubu")
            lbl_hesap_adi.config(text="Ortak Adı")
            lbl_iban.config(text="Kimlik / Referans")
            if not entry_banka.get().strip():
                entry_banka.insert(0, "Şirket Ortakları")
        else:
            lbl_banka_kurum.config(text="Banka / Kurum")
            lbl_hesap_adi.config(text="Hesap Adı")
            lbl_iban.config(text="IBAN")
            if entry_banka.get().strip() == "Şirket Ortakları":
                entry_banka.delete(0, tk.END)

    combo_hesap_turu.bind("<<ComboboxSelected>>", hesap_turu_formunu_ayarla)

    ozet = tk.LabelFrame(win, text="Finans Özeti", padx=10, pady=8)
    ozet.pack(fill="x", padx=10, pady=5)
    lbl_banka_toplam = tk.Label(ozet, text="Banka Toplam: 0 TL", font=("Arial", 12, "bold"))
    lbl_banka_toplam.pack(side="left", padx=12)
    lbl_kasa_toplam = tk.Label(ozet, text="Kasa Toplam: 0 TL", font=("Arial", 12, "bold"))
    lbl_kasa_toplam.pack(side="left", padx=12)
    tk.Label(ozet, text="Kasa Devir Bakiye").pack(side="left", padx=(22, 5))
    entry_kasa_devir = tk.Entry(ozet, width=14)
    entry_kasa_devir.insert(0, str(kasa_devir_bakiyesi_getir()).replace(".", ","))
    entry_kasa_devir.pack(side="left", padx=4)

    def kasa_devir_kaydet():
        kasa_devir_bakiyesi_kaydet(entry_kasa_devir.get())
        messagebox.showinfo(
            "Kasa Devir Bakiye",
            "Kasa devir bakiyesi kaydedildi. Geçmiş kasa hareketleri değiştirilmedi.",
            parent=win,
        )
        banka_hesaplari_paneli()

    tk.Button(ozet, text="Kaydet", command=kasa_devir_kaydet, bg="#0f766e", fg="white", width=10).pack(side="left", padx=5)

    hesap_grup_frame = tk.Frame(win, bg=RENK_ARKA)
    hesap_grup_frame.pack(fill="x", padx=10, pady=6)
    hesap_gruplari = {}

    def hesap_grup_panel(parent, anahtar, baslik, renk, satir, sutun):
        panel = tk.Frame(parent, bg="#fffde7", relief="ridge", bd=1)
        panel.grid(row=satir, column=sutun, sticky="nsew", padx=8, pady=8)
        parent.grid_columnconfigure(sutun, weight=1)

        bas = tk.Frame(panel, bg=renk)
        bas.pack(fill="x")
        tk.Label(bas, text=baslik, bg=renk, fg="white", font=("Segoe UI", 10, "bold")).pack(side="left", padx=12, pady=8)
        toplam_lbl = tk.Label(bas, text="0 TL", bg=renk, fg="white", font=("Segoe UI", 10, "bold"))
        toplam_lbl.pack(side="right", padx=12, pady=8)

        govde = tk.Frame(panel, bg="#fffde7", height=72)
        govde.pack(fill="x", padx=10, pady=10)
        govde.pack_propagate(False)
        hesap_gruplari[anahtar] = {"toplam": toplam_lbl, "govde": govde, "renk": renk}

    def hesap_mini_kart(parent, ad, bakiye, hedef_hesap=None):
        kart = tk.Frame(parent, bg="#ffffff", relief="raised", bd=1, padx=10, pady=6)
        kart.pack(side="left", padx=6, pady=2)
        try:

## gider_yonetimi (line 22454)
def gider_yonetimi():
    gider_dosyasi_duzenle()
    masraf_kalemleri_dosyasi_duzenle()
    if DateEntry is None:
        messagebox.showerror("Eksik Kütüphane", "Takvim özelliği için tkcalendar kurulmalıdır.")
        return

    _, win = ana_sag_icerik_sayfasi_ac("Masraflar", yol="Finans  ›  Masraflar")
    modern_tema_uygula(win)
    win.configure(bg=RENK_ARKA)

    ust = tk.Frame(win, bg=RENK_ARKA)
    ust.pack(fill="x", padx=12, pady=10)
    tk.Button(ust, text="+ Yeni Masraf Gir", command=yeni_masraf_penceresi, bg=RENK_DANGER, fg="white", width=18).pack(side="left", padx=4)
    tk.Button(ust, text="✎ Masraf Kalemleri", command=masraf_kalemleri_penceresi, bg=RENK_SUCCESS, fg="white", width=18).pack(side="left", padx=4)

    filtre = tk.LabelFrame(win, text="", padx=10, pady=8, bg=RENK_ARKA)
    filtre.pack(fill="x", padx=12, pady=(0, 8))
    durum_var = tk.StringVar(value="Tümü")
    durum_butonlari = {}

    arama = tk.Entry(filtre, width=34)
    tk.Label(filtre, text="Ara:", bg=RENK_ARKA).pack(side="right", padx=(8, 4))
    arama.pack(side="right", padx=4)
    combo_donem = ttk.Combobox(filtre, values=["Son 30 Gün", "Son 3 Ay", "Son 6 Ay", "Bu Yıl", "Tümü"], state="readonly", width=14)
    combo_donem.set("Son 3 Ay")
    combo_donem.pack(side="left", padx=(12, 4))

    tablo_frame = tk.Frame(win, bg=RENK_ARKA)
    tablo_frame.pack(fill="both", expand=True, padx=12, pady=8)
    kolonlar = ("İşlem Tarihi", "Belge No", "Vadesi", "Masraf", "Hesap", "Tutar", "Ödeme", "Durumu", "Not", "İşlem")
    tablo = agac_tablo_scroll_ekle(tablo_frame, kolonlar, height=18)
    genislikler = {"İşlem Tarihi": 105, "Belge No": 100, "Vadesi": 105, "Masraf": 190, "Hesap": 150, "Tutar": 110, "Ödeme": 110, "Durumu": 100, "Not": 240, "İşlem": 85}
    for kolon in kolonlar:
        tablo.heading(kolon, text=kolon)
        tablo.column(kolon, width=genislikler[kolon], anchor="e" if kolon == "Tutar" else "w", stretch=kolon == "Not")
    tablo.tag_configure("gecikmis", background="#fee2e2")
    tablo.tag_configure("odenecek", background="#fef3c7")
    lbl_ozet = tk.Label(win, text="", bg=RENK_ARKA, fg=RENK_METIN, font=("Segoe UI", 10, "bold"))
    lbl_ozet.pack(anchor="w", padx=14, pady=(0, 8))
    satir_haritasi = {}

    def kayit_durumu(row):
        durum = masraf_rapor_metin(row.get("Ödeme Durumu", "")) or "Ödenmiş"
        if durum in ("Ödenmiş", "Odendi", "Ödendi"):
            return "Ödenmiş"
        vade = pd.to_datetime(row.get("Vade Tarihi", ""), dayfirst=True, errors="coerce")
        if not pd.isna(vade) and vade.date() < datetime.now().date():
            return "Gecikmiş"
        return "Ödenecek"

    def filtre_baslangici():
        bugun = datetime.now()
        donem = combo_donem.get()
        if donem == "Son 30 Gün":
            return bugun - timedelta(days=30)
        if donem == "Son 3 Ay":
            return bugun - timedelta(days=92)
        if donem == "Son 6 Ay":
            return bugun - timedelta(days=184)
        if donem == "Bu Yıl":
            return datetime(bugun.year, 1, 1)
        return None

    def yukle():
        tablo.delete(*tablo.get_children())
        satir_haritasi.clear()
        df_g = guvenli_excel_oku(GIDER_DOSYASI)
        df_g = kayitlari_tarihe_gore_yeni_eski_sirala(df_g, "Tarih")
        aranan = arama.get().strip().casefold()
        baslangic = filtre_baslangici()
        toplam = 0
        sayac = 0
        for idx, row in df_g.iterrows():
            if tedarikci_odeme_kaydi_mi(row.get("Gider Kategorisi", ""), row.get("Açıklama", "")) or kredi_odeme_kaydi_mi(row.get("Gider Kategorisi", ""), row.get("Açıklama", "")):
                continue
            tarih_obj = pd.to_datetime(row.get("Tarih", ""), dayfirst=True, errors="coerce")
            if baslangic and (pd.isna(tarih_obj) or tarih_obj.to_pydatetime() < baslangic):
                continue
            durum = kayit_durumu(row)
            if durum_var.get() != "Tümü" and durum != durum_var.get():
                continue
            metin = " ".join(str(row.get(k, "")) for k in df_g.columns).casefold()
            if aranan and aranan not in metin:
                continue
            grup = masraf_rapor_metin(row.get("Gider Grubu", "")) or masraf_kalemi_grubu_getir(row.get("Gider Kategorisi", ""))
            kalem = masraf_rapor_metin(row.get("Gider Kategorisi", ""))
            hesap = masraf_rapor_metin(row.get("Banka Hesabı", "")) or "Kasa"
            tutar = sayiya_cevir(row.get("Tutar", 0), 0)
            iid = f"gider|{idx}"
            satir_haritasi[iid] = idx
            tablo.insert("", "end", iid=iid, values=(
                row.get("Tarih", ""), row.get("Belge No", ""), row.get("Vade Tarihi", ""),
                f"{grup} / {kalem}", hesap, para_formatla(tutar),
                row.get("Ödeme Türü", ""), durum, row.get("Açıklama", ""), "İşlem ▼",
            ), tags=("gecikmis" if durum == "Gecikmiş" else "odenecek" if durum == "Ödenecek" else "",))
            toplam += tutar
            sayac += 1
        lbl_ozet.config(text=f"Listelenen: {sayac} masraf | Toplam: {para_formatla(toplam)}")


## atelye_paneli (line 18025)
def atelye_paneli():
    """Eski tablo paneli yerine birleşik üretim Kanban ekranını açar."""
    return siparis_kanban_paneli()


def satin_alma_talebi_paneli():
    urun_dosyasi_duzenle()
    _, win = ana_sag_icerik_sayfasi_ac(
        "Satın Alma Talebi",
        yol="Tedarik Merkezi  ›  Satın Alma Talebi",
    )
    modern_tema_uygula(win)

    ust = tk.Frame(win)
    ust.pack(fill="x", padx=10, pady=8)
    tk.Label(ust, text="Kritik Seviye").pack(side="left", padx=5)
    entry_kritik = tk.Entry(ust, width=8)
    entry_kritik.insert(0, "5")
    entry_kritik.pack(side="left", padx=5)
    tk.Label(ust, text="Ara").pack(side="left", padx=(18, 5))
    entry_ara = tk.Entry(ust, width=30)
    entry_ara.pack(side="left", padx=5)
    lbl_ozet = tk.Label(ust, text="", fg="gray")
    lbl_ozet.pack(side="left", padx=12)

    secim_cubugu = tk.Frame(win)
    secim_cubugu.pack(fill="x", padx=10, pady=(0, 4))
    lbl_secim_ozet = tk.Label(
        secim_cubugu,
        text="Seçilen ürün: 0 | Talep edilen toplam: 0 adet",
        fg="#0f766e",
        font=("Segoe UI", 10, "bold"),
    )
    lbl_secim_ozet.pack(side="right", padx=8)

    tablo_frame = tk.Frame(win)
    tablo_frame.pack(fill="both", expand=True, padx=10, pady=8)
    secim_kolonu = "Seç"
    kolonlar = (secim_kolonu, "Tedarikçi", "Kategori", "Ürün", "Beden", "Renk", "Baskı", "Stok", "Talep Adedi", "Alış Fiyatı")
    tablo = agac_tablo_scroll_ekle(tablo_frame, kolonlar, height=16)
    for kolon in kolonlar:
        tablo.heading(kolon, text="Talep Adedi (Düzenle)" if kolon == "Talep Adedi" else kolon)
        if kolon == secim_kolonu:
            genislik = 54
        else:
            genislik = 240 if kolon == "Ürün" else 140
        tablo.column(kolon, width=genislik, anchor="center" if kolon in (secim_kolonu, "Stok", "Talep Adedi") else "w")
    tablo.tag_configure("eksi", background="#fecaca")
    tablo.tag_configure("kritik", background="#fef3c7")
    satir_map = {}
    secilen_anahtarlar = set()

    def satir_anahtari(row):
        return "|".join(
            cari_metin_normalize(row.get(k, ""))
            for k in ("Tedarikçi", "Kategori", "Ürün", "Beden", "Renk", "Baskı")
        )

    def satirlari_getir():
        df = urun_tablosu_oku()
        kritik = sayiya_cevir(entry_kritik.get(), 5)
        satirlar = []
        arama = entry_ara.get().strip().lower()
        for _, row in df.iterrows():
            stok = sayiya_cevir(row.get("Stok Miktarı", row.get("Stok Adedi", 0)), 0)
            if stok > kritik:
                continue
            metin = " ".join([str(row.get(k, "")) for k in ["Tedarikçi", "Kategori", "Ürün Adı", "BEDEN", "RENK", "Baskı"]]).lower()
            if arama and arama not in metin:
                continue
            hedef = max(kritik, 1)
            onerilen = int(max(hedef - stok, 1))
            satirlar.append({
                "Fotoğraf": urun_fotografi_bul(
                    row.get("Ürün Adı", ""),
                    row.get("BEDEN", ""),
                    row.get("RENK", ""),
                    row.get("Baskı", ""),
                ),
                "Tedarikçi": row.get("Tedarikçi", ""),
                "Kategori": row.get("Kategori", ""),
                "Ürün": row.get("Ürün Adı", ""),
                "Beden": row.get("BEDEN", ""),
                "Renk": row.get("RENK", ""),
                "Baskı": row.get("Baskı", ""),
                "Stok": stok,
                "Talep Adedi": onerilen,
                "Alış Fiyatı": row.get("Alış Fiyatı", ""),
            })
        return satirlar

    def yukle():
        for item in tablo.get_children():
            tablo.delete(item)
        satir_map.clear()
        satirlar = satirlari_getir()
        mevcut_anahtarlar = {satir_anahtari(row) for row in satirlar}
        secilen_anahtarlar.intersection_update(mevcut_anahtarlar)
        for i, row in enumerate(satirlar):
            iid = str(i)

## internet_satislari_penceresi (line 31392)
def internet_satislari_penceresi():
    return internet_siparisi_penceresi("liste")


def hizli_satis_penceresi(
    satis_turu="perakende",
    yenile_callback=None,
    musteri_onsecim="",
    telefon_onsecim="",
):
    satis_turu = str(satis_turu or "perakende").strip().casefold()
    satis_turu = {
        "kayıtlı": "kayitli",
        "kayitli musteri": "kayitli",
        "kayıtlı müşteri": "kayitli",
        "yeni musteri": "yeni",
        "yeni müşteri": "yeni",
        "internet siparişi": "internet",
        "internet siparisi": "internet",
        "e-ticaret": "internet",
        "eticaret": "internet",
    }.get(satis_turu, satis_turu)
    if satis_turu == "perakende":
        return perakende_satis_gir_penceresi(yenile_callback)
    if satis_turu == "internet":
        return internet_siparisi_penceresi("giris")
    basliklar = {
        "perakende": "Perakende Satış",
        "yeni": "Yeni Müşteriye Satış",
        "kayitli": "Kayıtlı Müşteriye Satış",
        "teklif": "Teklif Girişi",
    }
    kanallar = {
        "perakende": "Perakende",
        "yeni": "Yeni Müşteri",
        "kayitli": "Kayıtlı Müşteri",
        "teklif": "Teklif",
    }
    baslik = basliklar.get(satis_turu, basliklar["perakende"])
    tur_etiketleri = {
        "perakende": "Perakende Satış",
        "internet": "İnternet Siparişi",
        "yeni": "Yeni Müşteriye Satış",
        "kayitli": "Kayıtlı Müşteriye Satış",
        "teklif": "Teklif Girişi",
    }
    etiket_turleri = {etiket: anahtar for anahtar, etiket in tur_etiketleri.items()}
    _, win = ana_sag_icerik_sayfasi_ac(
        baslik,
        geri_komutu=satis_belgeleri_paneli,
        yol=f"Satış / Sipariş  ›  {baslik}",
    )

    urunler = [str(x).strip() for x in urun_listesi_getir(sadece_stokta=True) if str(x).strip()]
    urunler = list(dict.fromkeys(urunler))
    urun_lookup = {x.casefold(): x for x in urunler}
    banka_hesaplari = banka_hesap_listesi_getir()
    banka_odeme_hesaplari = finans_hesap_listesi_getir(["Banka"]) or banka_hesaplari
    pos_odeme_hesaplari = finans_hesap_listesi_getir(["POS", "Kredi Kartı"]) or banka_hesaplari
    sepet = []
    musteri_map = {}
    secili_varyant_kaynagi = {"urun": "", "depo": ""}

    def musteri_kayitlari_getir():
        try:
            musteri_dosyasi_duzenle()
            df_m = guvenli_excel_oku(MUSTERI_DOSYASI)
        except Exception:
            return []
        kayitlar = []
        for _, row in df_m.iterrows():
            ad = musteri_deger_temizle(row.get("Müşteri", ""))
            telefon = musteri_deger_temizle(row.get("Telefon", ""))
            if not ad:
                continue
            label = f"{ad} | {telefon}" if telefon else ad
            kayitlar.append({"label": label, "musteri": ad, "telefon": telefon})
        return kayitlar

    musteri_kayitlari = musteri_kayitlari_getir()

    govde_kapsayici = tk.Frame(win, bg=RENK_ARKA)
    govde_kapsayici.pack(fill="both", expand=True)
    govde_scroll_icerik, _, _ = kaydirilabilir_icerik_olustur(govde_kapsayici)
    govde = tk.Frame(govde_scroll_icerik, bg=RENK_ARKA)
    govde.pack(fill="both", expand=True, padx=12, pady=12)

    ust = tk.LabelFrame(govde, text="Satış Bilgileri", padx=10, pady=8)
    ust.pack(fill="x", pady=(0, 8))

    tk.Label(ust, text="Tarih").grid(row=0, column=0, padx=5, pady=5, sticky="w")
    entry_tarih = tk.Entry(ust, width=18)
    entry_tarih.insert(0, datetime.now().strftime("%d.%m.%Y %H:%M"))
    entry_tarih.grid(row=0, column=1, padx=5, pady=5, sticky="w")

    tk.Label(ust, text="Satış Tipi").grid(row=0, column=2, padx=(18, 5), pady=5, sticky="w")
    combo_satis_tipi = ttk.Combobox(ust, values=list(tur_etiketleri.values()), state="readonly", width=28)
    combo_satis_tipi.set(tur_etiketleri.get(satis_turu, tur_etiketleri["perakende"]))
    combo_satis_tipi.grid(row=0, column=3, padx=5, pady=5, sticky="w")


## fihrist_penceresi (line 42074)
def fihrist_penceresi():
    fihrist_dosyasi_olustur()
    _, win = ana_sag_icerik_sayfasi_ac(
        "Fihrist",
        geri_komutu=musteri_iletisim_penceresi,
        yol="Müşteri İletişim  ›  Fihrist",
    )
    win.configure(bg=RENK_ARKA)
    win.bind("<Escape>", lambda e: ana_sag_onceki_sayfaya_don())

    ust = tk.Frame(win, bg=RENK_ARKA)
    ust.pack(fill="x", padx=12, pady=10)
    tk.Label(ust, text="Fihrist", bg=RENK_ARKA, fg=RENK_METIN, font=("Segoe UI", 16, "bold")).pack(side="left", padx=4)
    tk.Button(ust, text="Sınıflandırma Ekle", command=lambda: siniflandirma_ekle(), bg="#198754", fg="white", width=18).pack(side="right", padx=4)
    tk.Button(ust, text="Yenile", command=lambda: tumunu_yukle(senkronize=True, force=True), width=12).pack(side="right", padx=4)

    form = tk.LabelFrame(win, text="Kart Bilgileri", padx=10, pady=8)
    form.pack(fill="x", padx=12, pady=(0, 8))
    form.grid_columnconfigure(1, weight=1)
    form.grid_columnconfigure(3, weight=1)

    alanlar = {}
    satirlar = [
        ("İsim / Ünvan", "İsim / Ünvan", 0, 0, 1),
        ("Sınıflandırma", "Sınıflandırma", 0, 2, 1),
        ("Yetkili Kişi", "Yetkili Kişi", 1, 0, 1),
        ("E-Posta", "E-Posta", 1, 2, 1),
        ("Telefon", "Telefon", 2, 0, 1),
        ("Telefon 2", "Telefon 2", 2, 2, 1),
        ("Web Sitesi", "Web Sitesi", 3, 0, 3),
    ]
    for key, label, row, col, colspan in satirlar:
        tk.Label(form, text=label).grid(row=row, column=col, padx=5, pady=4, sticky="e")
        ent = ttk.Combobox(form, width=26) if key == "Sınıflandırma" else tk.Entry(form, width=34)
        ent.grid(row=row, column=col + 1, columnspan=colspan, padx=5, pady=4, sticky="ew")
        alanlar[key] = ent

    tk.Label(form, text="Adres").grid(row=4, column=0, padx=5, pady=4, sticky="ne")
    text_adres = tk.Text(form, height=3, width=45)
    text_adres.grid(row=4, column=1, padx=5, pady=4, sticky="ew")
    tk.Label(form, text="Not").grid(row=4, column=2, padx=5, pady=4, sticky="ne")
    text_not = tk.Text(form, height=3, width=45)
    text_not.grid(row=4, column=3, padx=5, pady=4, sticky="ew")

    secili_index = {"idx": None}
    notebook = ttk.Notebook(win)
    notebook.pack(fill="both", expand=True, padx=12, pady=8)
    tablolar = {}
    aramalar = {}
    fihrist_veri = {"df": pd.DataFrame()}

    def siniflar_getir(df=None):
        if df is None:
            df = fihrist_veri.get("df")
        if df is None or df.empty:
            try:
                df = guvenli_excel_oku(FIHRIST_DOSYASI)
            except Exception:
                df = pd.DataFrame(columns=FIHRIST_KOLONLARI)
        siniflar = ["Müşteriler", "Tedarikçiler", "Firmalar", "Diğer"]
        if not df.empty and "Sınıflandırma" in df.columns:
            siniflar.extend([str(x).strip() for x in df["Sınıflandırma"].dropna().tolist() if str(x).strip()])
        return list(dict.fromkeys(siniflar))

    def sinif_combo_guncelle():
        degerler = siniflar_getir()
        alanlar["Sınıflandırma"]["values"] = degerler
        if not alanlar["Sınıflandırma"].get():
            alanlar["Sınıflandırma"].set("Diğer")

    def form_temizle():
        secili_index["idx"] = None
        for key, ent in alanlar.items():
            if isinstance(ent, ttk.Combobox):
                ent.set("Diğer")
            else:
                ent.delete(0, tk.END)
        text_adres.delete("1.0", tk.END)
        text_not.delete("1.0", tk.END)

    def kaydet():
        isim = alanlar["İsim / Ünvan"].get().strip()
        sinif = alanlar["Sınıflandırma"].get().strip() or "Diğer"
        if not isim:
            messagebox.showwarning("Fihrist", "İsim / Ünvan alanı gerekli.", parent=win)
            return
        fihrist_dosyasi_olustur()
        df = guvenli_excel_oku(FIHRIST_DOSYASI)
        satir = {
            "Sınıflandırma": sinif,
            "İsim / Ünvan": isim,
            "Yetkili Kişi": alanlar["Yetkili Kişi"].get().strip(),
            "Telefon": alanlar["Telefon"].get().strip(),
            "Telefon 2": alanlar["Telefon 2"].get().strip(),
            "E-Posta": alanlar["E-Posta"].get().strip(),
            "Web Sitesi": alanlar["Web Sitesi"].get().strip(),
            "Adres": text_adres.get("1.0", tk.END).strip(),
            "Not": text_not.get("1.0", tk.END).strip(),
            "Kaynak": "Manuel",
            "Güncelleme Tarihi": datetime.now().strftime("%d.%m.%Y %H:%M"),
