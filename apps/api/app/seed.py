"""Seed roles, users, and fake Turkish demo data."""

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import (
    BankAccount,
    BankMovement,
    CariMovement,
    CashMovement,
    CashRegister,
    Customer,
    Order,
    OrderLine,
    OrderStatusHistory,
    Payment,
    Product,
    ProductVariant,
    Purchase,
    PurchaseLine,
    Role,
    Supplier,
    SupplierMovement,
    User,
)
# StockMovement imported lazily in product seed block when needed
from app.models.order import DEFAULT_ORDER_STATUS


ROLES = [
    ("admin", "Tam yetki"),
    ("satış", "Satış ve müşteri yönetimi"),
    ("üretim", "Üretim ve stok"),
    ("muhasebe", "Finans ve raporlar"),
]


def seed(db: Session) -> None:
    if db.query(Role).count() == 0:
        roles = [Role(name=n, description=d) for n, d in ROLES]
        db.add_all(roles)
        db.commit()

    role_map = {r.name: r for r in db.query(Role).all()}

    def ensure_user(email: str, name: str, password: str, role_names: list[str]) -> None:
        user = db.query(User).filter(User.email == email).first()
        if user:
            return
        user = User(
            email=email,
            full_name=name,
            hashed_password=hash_password(password),
            is_active=True,
        )
        user.roles = [role_map[r] for r in role_names if r in role_map]
        db.add(user)

    ensure_user("admin@baykus.local", "Sistem Yöneticisi", "admin123", ["admin"])
    ensure_user("satis@baykus.local", "Ayşe Satış", "satis123", ["satış"])
    ensure_user("uretim@baykus.local", "Mehmet Üretim", "uretim123", ["üretim"])
    ensure_user("muhasebe@baykus.local", "Zeynep Muhasebe", "muhasebe123", ["muhasebe"])
    db.commit()

    if db.query(Customer).count() == 0:
        customers = [
            Customer(
                code="M-001",
                name="Ali Yılmaz",
                company="Anadolu Tekstil Ltd.",
                email="ali@anadolutekstil.com",
                phone="+90 532 111 2233",
                city="İstanbul",
                address="Merkez Mah. Baskı Cad. No:12",
                tax_number="1234567890",
                tax_office="Kadıköy",
                notes="Kurumsal müşteri — aylık sipariş",
                is_active=True,
                special_day_note="Firma kuruluş yıldönümü",
                special_day_date=date(2010, 5, 12),
                opening_balance=Decimal("1500.00"),
            ),
            Customer(
                code="M-002",
                name="Fatma Demir",
                company="Marmara AVM",
                email="fatma@marmaraavm.com",
                phone="+90 533 222 3344",
                city="Ankara",
                address="Kızılay İş Merkezi Kat:5",
                tax_number="9876543210",
                tax_office="Çankaya",
                is_active=True,
                opening_balance=Decimal("0"),
            ),
            Customer(
                code="M-003",
                name="Can Öztürk",
                company="Ege Promosyon",
                email="can@egepromosyon.com",
                phone="+90 534 333 4455",
                city="İzmir",
                address="Alsancak Liman Sk. No:8",
                tax_number="1122334455",
                tax_office="Konak",
                notes="Fuar sezonunda yoğun",
                is_active=True,
                opening_balance=Decimal("750.00"),
            ),
            Customer(
                code="M-004",
                name="Elif Kara",
                company="Karadeniz Giyim",
                email="elif@karadenizgiyim.com",
                phone="+90 535 444 5566",
                city="Trabzon",
                address="Uzun Sokak No:45",
                tax_number="5566778899",
                tax_office="Ortahisar",
                is_active=True,
                special_day_note="Doğum günü",
                special_day_date=date(1988, 11, 3),
                opening_balance=Decimal("0"),
            ),
            Customer(
                code="M-005",
                name="Burak Şahin",
                company="Akdeniz Reklam",
                email="burak@akdenizreklam.com",
                phone="+90 536 555 6677",
                city="Antalya",
                address="Lara Cad. No:100",
                tax_number="6677889900",
                tax_office="Muratpaşa",
                is_active=True,
                opening_balance=Decimal("2000.00"),
            ),
            Customer(
                code="M-006",
                name="Selin Aydın",
                company="Boğaziçi Etkinlik",
                email="selin@bogazicietkinlik.com",
                phone="+90 537 666 7788",
                city="İstanbul",
                address="Beşiktaş Barbaros Bulvarı No:22",
                tax_number="3344556677",
                tax_office="Beşiktaş",
                notes="Etkinlik tişörtleri",
                is_active=True,
                opening_balance=Decimal("500.00"),
            ),
            Customer(
                code="M-007",
                name="Hakan Çelik",
                company="Ankara Spor Kulübü",
                email="hakan@ankarspor.org",
                phone="+90 538 777 8899",
                city="Ankara",
                address="Yenimahalle Spor Cad. No:7",
                tax_number="4455667788",
                tax_office="Yenimahalle",
                is_active=True,
                opening_balance=Decimal("0"),
            ),
            Customer(
                code="M-008",
                name="Zeynep Arslan",
                company="Kapadokya Turizm",
                email="zeynep@kapadokyaturizm.com",
                phone="+90 539 888 9900",
                city="Nevşehir",
                address="Göreme Merkez",
                tax_number="7788990011",
                tax_office="Merkez",
                is_active=True,
                special_day_note="Sezon açılışı",
                special_day_date=date(2026, 4, 1),
                opening_balance=Decimal("1200.00"),
            ),
            Customer(
                code="M-009",
                name="Emre Koç",
                company="Koç Matbaa",
                email="emre@kocmatbaa.com",
                phone="+90 541 999 0011",
                city="Bursa",
                address="Nilüfer Sanayi Sitesi",
                tax_number="8899001122",
                tax_office="Nilüfer",
                notes="Pasif — sadece eski borç",
                is_active=False,
                opening_balance=Decimal("350.00"),
            ),
            Customer(
                code="M-010",
                name="Deniz Yıldız",
                company="Yıldız Okulları",
                email="deniz@yildizokullari.edu.tr",
                phone="+90 542 101 2233",
                city="İzmir",
                address="Bornova Kampüs",
                tax_number="9900112233",
                tax_office="Bornova",
                is_active=True,
                opening_balance=Decimal("0"),
            ),
        ]
        db.add_all(customers)
        db.commit()

    if db.query(Product).count() == 0:
        from app.models.product import StockMovement

        def P(**kw):
            defaults = dict(
                product_type="stoklu",
                is_active=True,
                critical_stock_threshold=10,
                warehouse="Ana Depo",
                purchase_price=Decimal("0"),
                cost=Decimal("0"),
            )
            defaults.update(kw)
            return Product(**defaults)

        products = [
            P(sku="TSH-001", name="Basic Tişört", category="Giyim", brand="Baykuş", supplier_name="İstanbul Kumaş A.Ş.",
              base_price=Decimal("149.90"), purchase_price=Decimal("75.00"), cost=Decimal("82.00"),
              critical_stock_threshold=50, stock_qty=0, description="Pamuklu basic tişört"),
            P(sku="HDD-001", name="Kapüşonlu Sweatshirt", category="Giyim", brand="Baykuş",
              base_price=Decimal("399.00"), purchase_price=Decimal("210.00"), cost=Decimal("230.00"),
              critical_stock_threshold=20, stock_qty=0),
            P(sku="CP-001", name="Seramik Kupa", category="Promosyon", brand="PromoPlus",
              base_price=Decimal("89.50"), purchase_price=Decimal("35.00"), cost=Decimal("42.00"),
              critical_stock_threshold=100, stock_qty=0),
            P(sku="BG-001", name="Bez Çanta", category="Promosyon", brand="EcoBag",
              base_price=Decimal("65.00"), purchase_price=Decimal("22.00"), cost=Decimal("28.00"),
              critical_stock_threshold=30, stock_qty=5),  # below critical, no variants
            P(sku="POL-001", name="Polo Yaka", category="Giyim", brand="Baykuş",
              base_price=Decimal("279.00"), purchase_price=Decimal("140.00"), cost=Decimal("155.00"),
              critical_stock_threshold=25, stock_qty=0),
            P(sku="SNAP-001", name="Snapback Şapka", category="Aksesuar", brand="CapCo",
              base_price=Decimal("119.00"), purchase_price=Decimal("45.00"), cost=Decimal("52.00"),
              critical_stock_threshold=15, stock_qty=0),
            P(sku="MOUSE-001", name="Mouse Pad", category="Promosyon", brand="DeskPro",
              base_price=Decimal("49.90"), purchase_price=Decimal("18.00"), cost=Decimal("22.00"),
              critical_stock_threshold=40, stock_qty=8),  # below critical
            P(sku="HOOD-KID", name="Çocuk Kapüşonlu", category="Giyim", brand="Baykuş Kids",
              base_price=Decimal("249.00"), purchase_price=Decimal("120.00"), cost=Decimal("135.00"),
              critical_stock_threshold=20, stock_qty=0),
            P(sku="SVC-DTF", name="DTF Baskı Hizmeti", category="Hizmet", brand="Baykuş",
              product_type="hizmet", base_price=Decimal("15.00"), purchase_price=Decimal("0"),
              cost=Decimal("5.00"), critical_stock_threshold=0, stock_qty=0,
              description="Metrekare başına DTF baskı"),
            P(sku="SVC-NAK", name="Nakış Hizmeti", category="Hizmet", brand="Baykuş",
              product_type="hizmet", base_price=Decimal("25.00"), cost=Decimal("8.00"),
              critical_stock_threshold=0, stock_qty=0),
            P(sku="APR-001", name="Önlük (Mutfak)", category="Giyim", brand="WorkWear",
              base_price=Decimal("189.00"), purchase_price=Decimal("90.00"), cost=Decimal("100.00"),
              critical_stock_threshold=12, stock_qty=0),
            P(sku="BOTTLE-001", name="Metal Matara 500ml", category="Promosyon", brand="Hydro",
              base_price=Decimal("175.00"), purchase_price=Decimal("70.00"), cost=Decimal("85.00"),
              critical_stock_threshold=20, stock_qty=3),  # below critical
        ]
        db.add_all(products)
        db.flush()

        variants = [
            # TSH-001 — some below critical (50)
            ProductVariant(product_id=products[0].id, name="Siyah / S", sku="TSH-001-BK-S", color="Siyah", size="S",
                           print_type="DTF", barcode="8690001001011", price=Decimal("149.90"), stock_qty=12),
            ProductVariant(product_id=products[0].id, name="Siyah / M", sku="TSH-001-BK-M", color="Siyah", size="M",
                           print_type="DTF", barcode="8690001001028", price=Decimal("149.90"), stock_qty=80),
            ProductVariant(product_id=products[0].id, name="Beyaz / L", sku="TSH-001-WH-L", color="Beyaz", size="L",
                           print_type="Serigrafi", barcode="8690001001035", price=Decimal("149.90"), stock_qty=70),
            ProductVariant(product_id=products[0].id, name="Lacivert / XL", sku="TSH-001-NV-XL", color="Lacivert", size="XL",
                           print_type="DTF", barcode="8690001001042", price=Decimal("149.90"), stock_qty=8),  # critical
            # HDD-001
            ProductVariant(product_id=products[1].id, name="Antrasit / L", sku="HDD-001-AN-L", color="Antrasit", size="L",
                           print_type="Nakış", barcode="8690001002018", price=Decimal("399.00"), stock_qty=25),
            ProductVariant(product_id=products[1].id, name="Siyah / M", sku="HDD-001-BK-M", color="Siyah", size="M",
                           print_type="Nakış", barcode="8690001002025", price=Decimal("399.00"), stock_qty=5),  # critical
            # CP-001
            ProductVariant(product_id=products[2].id, name="Beyaz", sku="CP-001-WH", color="Beyaz", size=None,
                           print_type="Sublimasyon", barcode="8690001003015", price=Decimal("89.50"), stock_qty=300),
            ProductVariant(product_id=products[2].id, name="Siyah", sku="CP-001-BK", color="Siyah", size=None,
                           print_type="Sublimasyon", barcode="8690001003022", price=Decimal("89.50"), stock_qty=40),  # critical (<100)
            # POL-001
            ProductVariant(product_id=products[4].id, name="Lacivert / L", sku="POL-001-NV-L", color="Lacivert", size="L",
                           print_type="Nakış", barcode="8690001004012", price=Decimal("279.00"), stock_qty=45),
            ProductVariant(product_id=products[4].id, name="Beyaz / M", sku="POL-001-WH-M", color="Beyaz", size="M",
                           print_type="DTF", barcode="8690001004029", price=Decimal("279.00"), stock_qty=18),  # critical (<25)
            # SNAP-001
            ProductVariant(product_id=products[5].id, name="Siyah", sku="SNAP-001-BK", color="Siyah", size="Tek Beden",
                           print_type="Nakış", barcode="8690001005019", price=Decimal("119.00"), stock_qty=40),
            ProductVariant(product_id=products[5].id, name="Kırmızı", sku="SNAP-001-RD", color="Kırmızı", size="Tek Beden",
                           print_type="Nakış", barcode="8690001005026", price=Decimal("119.00"), stock_qty=4),  # critical
            # HOOD-KID
            ProductVariant(product_id=products[7].id, name="Gri / 8 yaş", sku="HOOD-KID-GR-8", color="Gri", size="8",
                           print_type="DTF", barcode="8690001006016", price=Decimal("249.00"), stock_qty=30),
            ProductVariant(product_id=products[7].id, name="Mavi / 10 yaş", sku="HOOD-KID-BL-10", color="Mavi", size="10",
                           print_type="DTF", barcode="8690001006023", price=Decimal("249.00"), stock_qty=6),  # critical
            # APR-001
            ProductVariant(product_id=products[10].id, name="Siyah", sku="APR-001-BK", color="Siyah", size="Tek Beden",
                           print_type="Serigrafi", barcode="8690001007013", price=Decimal("189.00"), stock_qty=22),
            ProductVariant(product_id=products[10].id, name="Beyaz", sku="APR-001-WH", color="Beyaz", size="Tek Beden",
                           print_type="Serigrafi", barcode="8690001007020", price=Decimal("189.00"), stock_qty=3),  # critical
        ]
        db.add_all(variants)
        db.flush()

        # Sync product.stock_qty from variants
        for p in products:
            if p.product_type == "hizmet":
                continue
            vs = [v for v in variants if v.product_id == p.id]
            if vs:
                p.stock_qty = sum(v.stock_qty for v in vs)

        # Sample stock movements
        admin = db.query(User).filter(User.email == "admin@baykus.local").first()
        uid = admin.id if admin else None
        movements = [
            StockMovement(
                product_id=products[0].id, variant_id=variants[1].id, direction="increase",
                quantity=80, qty_before=0, qty_after=80, reason="İlk stok girişi",
                note="Depo sayımı", warehouse="Ana Depo", created_by_user_id=uid,
            ),
            StockMovement(
                product_id=products[3].id, variant_id=None, direction="decrease",
                quantity=25, qty_before=30, qty_after=5, reason="Sipariş çıkışı",
                note="SIP-2026-007 için", warehouse="Ana Depo", created_by_user_id=uid,
            ),
            StockMovement(
                product_id=products[6].id, variant_id=None, direction="decrease",
                quantity=32, qty_before=40, qty_after=8, reason="Fuar numunesi",
                warehouse="Ana Depo", created_by_user_id=uid,
            ),
        ]
        db.add_all(movements)
        db.commit()

    if db.query(Order).count() == 0:
        customers = db.query(Customer).order_by(Customer.id).all()
        products = db.query(Product).order_by(Product.id).all()
        variants = {v.sku: v for v in db.query(ProductVariant).all()}
        today = date.today()
        # Spread across all 6 desktop statuses for Kanban demo
        orders_data = [
            # Sipariş Alındı
            ("SIP-2026-001", "Sipariş Alındı", customers[0], products[0], variants.get("TSH-001-BK-M"),
             50, Decimal("149.90"), "Siyah", "M", "DTF", Decimal("2000"), today + timedelta(days=10), "Logo baskı — acil değil"),
            ("SIP-2026-007", "Sipariş Alındı", customers[4], products[3], None,
             200, Decimal("65.00"), "Natural", None, "Serigrafi", Decimal("3000"), today + timedelta(days=14), "Bez çanta fuar seti"),
            # Hazırlanıyor
            ("SIP-2026-002", "Hazırlanıyor", customers[1], products[1], variants.get("HDD-001-AN-L"),
             20, Decimal("399.00"), "Antrasit", "L", "Nakış", Decimal("2000"), today + timedelta(days=7), "Kurumsal sweatshirt"),
            ("SIP-2026-008", "Hazırlanıyor", customers[2], products[4], None,
             40, Decimal("279.00"), "Lacivert", "XL", "DTF", Decimal("1500"), today + timedelta(days=8), None),
            # Baskıda
            ("SIP-2026-003", "Baskıda", customers[2], products[2], variants.get("CP-001-WH"),
             100, Decimal("89.50"), "Beyaz", None, "Sublimasyon", Decimal("2500"), today + timedelta(days=5), "Kupa baskı makinesi sırada"),
            # Hazır
            ("SIP-2026-004", "Hazır", customers[3], products[4], None,
             30, Decimal("279.00"), "Siyah", "L", "Serigrafi", Decimal("4000"), today + timedelta(days=2), "Teslim için bekliyor"),
            # Teslim Edildi
            ("SIP-2026-005", "Teslim Edildi", customers[0], products[0], variants.get("TSH-001-WH-L"),
             25, Decimal("149.90"), "Beyaz", "L", "DTF", Decimal("3747.50"), today - timedelta(days=3), "Teslim alındı"),
            # Sipariş İptali
            ("SIP-2026-006", "Sipariş İptali", customers[4], products[3], None,
             10, Decimal("65.00"), "Natural", None, "Serigrafi", Decimal("0"), today - timedelta(days=1), "Müşteri vazgeçti"),
        ]
        for num, status, cust, prod, variant, qty, price, color, size, print_type, deposit, due, notes in orders_data:
            line_total = price * qty
            order_discount = Decimal("0")
            total = line_total - order_discount
            order = Order(
                order_number=num,
                customer_id=cust.id,
                status=status,
                total_amount=total,
                deposit_amount=deposit if deposit <= total else total,
                discount_amount=order_discount,
                due_date=due,
                notes=notes or "Demo sipariş",
            )
            db.add(order)
            db.flush()
            db.add(
                OrderLine(
                    order_id=order.id,
                    product_id=prod.id,
                    variant_id=variant.id if variant else None,
                    description=prod.name,
                    quantity=qty,
                    size=size,
                    color=color,
                    print_type=print_type,
                    unit_price=price,
                    discount_rate=Decimal("0"),
                    discount_amount=Decimal("0"),
                    line_total=line_total,
                )
            )
            db.add(
                OrderStatusHistory(
                    order_id=order.id,
                    from_status=None,
                    to_status=status,
                    note="Seed",
                )
            )
            if deposit > 0 and status != "Sipariş İptali":
                db.add(
                    Payment(
                        order_id=order.id,
                        amount=min(deposit, total),
                        method="kapora",
                        status="tamamlandi",
                        notes="Kapora",
                    )
                )
            if status == "Teslim Edildi":
                remaining = total - min(deposit, total)
                if remaining > 0:
                    db.add(
                        Payment(
                            order_id=order.id,
                            amount=remaining,
                            method="havale",
                            status="tamamlandi",
                            notes="Kalan ödeme",
                        )
                    )
            elif status == "Hazır" and deposit < total:
                # Partial extra payment
                pass
        db.commit()


    if db.query(CariMovement).count() == 0:
        customers = {c.code: c for c in db.query(Customer).all() if c.code}
        orders = {o.order_number: o for o in db.query(Order).all()}
        today = date.today()
        movements: list[CariMovement] = []

        def add(code: str, mtype: str, debit: Decimal, credit: Decimal, days_ago: int, note: str, order_num: str | None = None):
            cust = customers.get(code)
            if not cust:
                return
            oid = orders[order_num].id if order_num and order_num in orders else None
            movements.append(
                CariMovement(
                    customer_id=cust.id,
                    movement_type=mtype,
                    debit=debit,
                    credit=credit,
                    movement_date=today - timedelta(days=days_ago),
                    order_id=oid,
                    note=note,
                )
            )

        # Linked to seed orders where possible
        add("M-001", "sale", Decimal("7495.00"), Decimal("0"), 25, "SIP-2026-001 satış", "SIP-2026-001")
        add("M-001", "deposit", Decimal("0"), Decimal("2000.00"), 24, "Kapora", "SIP-2026-001")
        add("M-001", "sale", Decimal("3747.50"), Decimal("0"), 10, "SIP-2026-005 satış", "SIP-2026-005")
        add("M-001", "payment", Decimal("0"), Decimal("3747.50"), 8, "Kalan ödeme havale", "SIP-2026-005")
        add("M-001", "payment", Decimal("0"), Decimal("500.00"), 3, "Açılış bakiyesi kısmi ödeme")

        add("M-002", "sale", Decimal("7980.00"), Decimal("0"), 18, "SIP-2026-002 satış", "SIP-2026-002")
        add("M-002", "deposit", Decimal("0"), Decimal("2000.00"), 17, "Kapora", "SIP-2026-002")

        add("M-003", "sale", Decimal("8950.00"), Decimal("0"), 12, "SIP-2026-003 satış", "SIP-2026-003")
        add("M-003", "deposit", Decimal("0"), Decimal("2500.00"), 11, "Kapora", "SIP-2026-003")
        add("M-003", "sale", Decimal("11160.00"), Decimal("0"), 9, "SIP-2026-008 satış", "SIP-2026-008")
        add("M-003", "deposit", Decimal("0"), Decimal("1500.00"), 9, "Kapora", "SIP-2026-008")

        add("M-004", "sale", Decimal("8370.00"), Decimal("0"), 6, "SIP-2026-004 satış", "SIP-2026-004")
        add("M-004", "deposit", Decimal("0"), Decimal("4000.00"), 6, "Kapora", "SIP-2026-004")

        add("M-005", "sale", Decimal("13000.00"), Decimal("0"), 14, "SIP-2026-007 satış", "SIP-2026-007")
        add("M-005", "deposit", Decimal("0"), Decimal("3000.00"), 13, "Kapora", "SIP-2026-007")
        add("M-005", "adjustment", Decimal("250.00"), Decimal("0"), 5, "Kargo farkı düzeltme", None)

        add("M-006", "sale", Decimal("4500.00"), Decimal("0"), 20, "Etkinlik tişört satışı")
        add("M-006", "payment", Decimal("0"), Decimal("2000.00"), 15, "Nakit kısmi ödeme")

        add("M-007", "sale", Decimal("3200.00"), Decimal("0"), 7, "Forma baskı")
        add("M-007", "payment", Decimal("0"), Decimal("3200.00"), 2, "Tam ödeme — bakiye sıfır")

        add("M-008", "sale", Decimal("6800.00"), Decimal("0"), 30, "Turizm sezon seti")
        add("M-008", "payment", Decimal("0"), Decimal("2000.00"), 20, "Havale")
        add("M-008", "deposit", Decimal("0"), Decimal("1000.00"), 10, "Kapora yeni iş")

        add("M-009", "payment", Decimal("0"), Decimal("100.00"), 40, "Eski borç kısmi")

        add("M-010", "sale", Decimal("2100.00"), Decimal("0"), 4, "Okul forma siparişi")
        add("M-010", "adjustment", Decimal("0"), Decimal("100.00"), 1, "İskonto düzeltme (alacak)")

        db.add_all(movements)
        db.commit()


    # ─── Finance: Kasa + Banka ─────────────────────────────────────────────
    if db.query(CashRegister).count() == 0:
        kasa = CashRegister(
            name="Ana Kasa",
            opening_balance=Decimal("5000.00"),
            currency="TRY",
            is_active=True,
        )
        db.add(kasa)
        db.flush()

        banks = [
            BankAccount(
                name="Ziraat İşletme",
                iban="TR330001000158123456789001",
                currency="TRY",
                opening_balance=Decimal("25000.00"),
                is_active=True,
                notes="Ana işletme hesabı",
            ),
            BankAccount(
                name="Garanti Ticari",
                iban="TR640006200012345678901234",
                currency="TRY",
                opening_balance=Decimal("12000.00"),
                is_active=True,
                notes="İkinci hesap — havale tahsilat",
            ),
        ]
        db.add_all(banks)
        db.flush()

        customers = {c.code: c for c in db.query(Customer).all() if c.code}
        admin = db.query(User).filter(User.email == "admin@baykus.local").first()
        uid = admin.id if admin else None
        today = date.today()

        cash_movs = [
            CashMovement(
                cash_register_id=kasa.id,
                movement_type="tahsilat",
                amount=Decimal("2000.00"),
                movement_date=today - timedelta(days=5),
                category="Müşteri tahsilat",
                note="Ali Yılmaz nakit ödeme",
                customer_id=customers["M-001"].id if "M-001" in customers else None,
                created_by_user_id=uid,
            ),
            CashMovement(
                cash_register_id=kasa.id,
                movement_type="gider",
                amount=Decimal("350.00"),
                movement_date=today - timedelta(days=3),
                category="Ofis",
                note="Kırtasiye ve toner",
                created_by_user_id=uid,
            ),
            CashMovement(
                cash_register_id=kasa.id,
                movement_type="odeme",
                amount=Decimal("800.00"),
                movement_date=today - timedelta(days=2),
                category="Tedarikçi",
                note="Kumaş tedarikçi nakit ödeme",
                created_by_user_id=uid,
            ),
            CashMovement(
                cash_register_id=kasa.id,
                movement_type="tahsilat",
                amount=Decimal("1500.00"),
                movement_date=today,
                category="Müşteri tahsilat",
                note="Bugünkü nakit tahsilat — Boğaziçi Etkinlik",
                customer_id=customers["M-006"].id if "M-006" in customers else None,
                created_by_user_id=uid,
            ),
        ]
        db.add_all(cash_movs)

        bank_movs = [
            BankMovement(
                bank_account_id=banks[0].id,
                movement_type="deposit",
                amount=Decimal("3747.50"),
                movement_date=today - timedelta(days=8),
                category="Havale tahsilat",
                note="SIP-2026-005 kalan ödeme",
                customer_id=customers["M-001"].id if "M-001" in customers else None,
                created_by_user_id=uid,
            ),
            BankMovement(
                bank_account_id=banks[0].id,
                movement_type="fee",
                amount=Decimal("45.00"),
                movement_date=today - timedelta(days=7),
                category="Banka masrafı",
                note="Havale komisyonu",
                created_by_user_id=uid,
            ),
            BankMovement(
                bank_account_id=banks[1].id,
                movement_type="deposit",
                amount=Decimal("2000.00"),
                movement_date=today - timedelta(days=4),
                category="Havale tahsilat",
                note="Kapadokya Turizm havale",
                customer_id=customers["M-008"].id if "M-008" in customers else None,
                created_by_user_id=uid,
            ),
            BankMovement(
                bank_account_id=banks[0].id,
                movement_type="withdrawal",
                amount=Decimal("1500.00"),
                movement_date=today - timedelta(days=1),
                category="Çekim",
                note="Maaş avansı / nakit ihtiyaç",
                created_by_user_id=uid,
            ),
            BankMovement(
                bank_account_id=banks[1].id,
                movement_type="deposit",
                amount=Decimal("3200.00"),
                movement_date=today,
                category="Havale tahsilat",
                note="Ankara Spor Kulübü tam ödeme",
                customer_id=customers["M-007"].id if "M-007" in customers else None,
                created_by_user_id=uid,
            ),
        ]
        db.add_all(bank_movs)

        # Sample cash → bank transfer (paired)
        import uuid as _uuid
        tg = str(_uuid.uuid4())
        db.add(
            CashMovement(
                cash_register_id=kasa.id,
                movement_type="transfer_out",
                amount=Decimal("1000.00"),
                movement_date=today - timedelta(days=6),
                note="Kasadan Ziraat'e yatırma",
                bank_account_id=banks[0].id,
                transfer_group_id=tg,
                created_by_user_id=uid,
            )
        )
        db.add(
            BankMovement(
                bank_account_id=banks[0].id,
                movement_type="transfer_in",
                amount=Decimal("1000.00"),
                movement_date=today - timedelta(days=6),
                note="Kasadan Ziraat'e yatırma",
                cash_register_id=kasa.id,
                transfer_group_id=tg,
                created_by_user_id=uid,
            )
        )
        db.commit()



    if db.query(Supplier).count() == 0:
        suppliers = [
            Supplier(
                code="T-001",
                name="İstanbul Kumaş A.Ş.",
                email="siparis@istanbulkumas.com",
                phone="+90 212 555 0101",
                city="İstanbul",
                address="Merter Tekstil Merkezi Blok A No:15",
                tax_number="1234567891",
                tax_office="Merter",
                notes="Ana kumaş tedarikçisi",
                is_active=True,
                opening_balance=Decimal("2500.00"),
            ),
            Supplier(
                code="T-002",
                name="Bursa Baskı Malzemeleri",
                email="info@bursabaski.com",
                phone="+90 224 555 0202",
                city="Bursa",
                address="Nilüfer OSB 3. Cadde No:42",
                tax_number="2345678901",
                tax_office="Nilüfer",
                notes="Mürekkep ve transfer kağıdı",
                is_active=True,
                opening_balance=Decimal("0"),
            ),
            Supplier(
                code="T-003",
                name="Ankara Ambalaj Ltd.",
                email="satis@ankaraambalaj.com",
                phone="+90 312 555 0303",
                city="Ankara",
                address="Ostim 1. Cadde No:8",
                tax_number="3456789012",
                tax_office="Yenimahalle",
                is_active=True,
                opening_balance=Decimal("800.00"),
            ),
            Supplier(
                code="T-004",
                name="İzmir Etiket Sanayi",
                email="siparis@izmiretiket.com",
                phone="+90 232 555 0404",
                city="İzmir",
                address="Çiğli Atatürk OSB",
                tax_number="4567890123",
                tax_office="Çiğli",
                notes="Dokuma etiket ve care label",
                is_active=True,
                opening_balance=Decimal("0"),
            ),
            Supplier(
                code="T-005",
                name="Gaziantep İplik Ticaret",
                email="info@gantepiplik.com",
                phone="+90 342 555 0505",
                city="Gaziantep",
                address="Organize Sanayi Bölgesi 5. Cadde",
                tax_number="5678901234",
                tax_office="Şehitkamil",
                is_active=True,
                opening_balance=Decimal("1200.00"),
            ),
            Supplier(
                code="T-006",
                name="Konya Nakış Aksesuar",
                email="siparis@konyanakis.com",
                phone="+90 332 555 0606",
                city="Konya",
                address="Selçuklu Sanayi Sitesi",
                tax_number="6789012345",
                tax_office="Selçuklu",
                notes="Pasif — eski borç",
                is_active=False,
                opening_balance=Decimal("450.00"),
            ),
        ]
        db.add_all(suppliers)
        db.flush()

        admin = db.query(User).filter(User.email == "admin@baykus.local").first()
        uid = admin.id if admin else None
        today = date.today()
        variants = {v.sku: v for v in db.query(ProductVariant).all()}
        products = {p.sku: p for p in db.query(Product).all()}
        by_code = {s.code: s for s in suppliers}

        # Confirmed purchase 1 — stock + payable
        p1_lines_data = []
        v_tsh = variants.get("TSH-001-BK-M")
        v_cup = variants.get("CP-001-WH")
        if v_tsh:
            p1_lines_data.append(
                dict(
                    product_id=v_tsh.product_id,
                    variant_id=v_tsh.id,
                    description="Basic Tişört Siyah/M",
                    quantity=Decimal("50"),
                    unit_cost=Decimal("75.00"),
                )
            )
        if v_cup:
            p1_lines_data.append(
                dict(
                    product_id=v_cup.product_id,
                    variant_id=v_cup.id,
                    description="Seramik Kupa Beyaz",
                    quantity=Decimal("100"),
                    unit_cost=Decimal("35.00"),
                )
            )
        if not p1_lines_data and products.get("BG-001"):
            bg = products["BG-001"]
            p1_lines_data.append(
                dict(
                    product_id=bg.id,
                    variant_id=None,
                    description=bg.name,
                    quantity=Decimal("40"),
                    unit_cost=Decimal("22.00"),
                )
            )

        from datetime import datetime as _dt

        def make_purchase(number, supplier, purchase_date, notes, lines_data, status="confirmed"):
            lines = []
            subtotal = Decimal("0")
            for ld in lines_data:
                lt = (ld["quantity"] * ld["unit_cost"]).quantize(Decimal("0.01"))
                subtotal += lt
                lines.append(PurchaseLine(line_total=lt, **ld))
            tax = Decimal("0")
            total = subtotal + tax
            p = Purchase(
                purchase_number=number,
                supplier_id=supplier.id,
                purchase_date=purchase_date,
                status=status,
                notes=notes,
                subtotal=subtotal,
                tax_amount=tax,
                total_amount=total,
                confirmed_at=_dt.utcnow() if status == "confirmed" else None,
                created_by_user_id=uid,
                lines=lines,
            )
            return p, total

        purchases_to_add = []
        if p1_lines_data:
            p, total = make_purchase(
                f"SA-{today.year}-0001",
                by_code["T-001"],
                today - timedelta(days=12),
                "Aylık kumaş / ürün alımı",
                p1_lines_data,
                "confirmed",
            )
            purchases_to_add.append((p, total, by_code["T-001"], True))

        # Purchase 2 — Bursa mürekkep (description-only + optional product)
        ink_lines = [
            dict(
                product_id=None,
                variant_id=None,
                description="DTF mürekkep seti (CMYK)",
                quantity=Decimal("10"),
                unit_cost=Decimal("450.00"),
            ),
            dict(
                product_id=None,
                variant_id=None,
                description="Transfer film rulo 60cm",
                quantity=Decimal("5"),
                unit_cost=Decimal("320.00"),
            ),
        ]
        p2, t2 = make_purchase(
            f"SA-{today.year}-0002",
            by_code["T-002"],
            today - timedelta(days=7),
            "Baskı sarf malzeme",
            ink_lines,
            "confirmed",
        )
        purchases_to_add.append((p2, t2, by_code["T-002"], False))

        # Draft purchase
        draft_lines = [
            dict(
                product_id=None,
                variant_id=None,
                description="Karton kutu 30x40",
                quantity=Decimal("200"),
                unit_cost=Decimal("4.50"),
            )
        ]
        p3, t3 = make_purchase(
            f"SA-{today.year}-0003",
            by_code["T-003"],
            today - timedelta(days=1),
            "Taslak — henüz onaylanmadı",
            draft_lines,
            "draft",
        )
        purchases_to_add.append((p3, t3, by_code["T-003"], False))

        # Confirmed purchase 4 — İzmir etiket
        etiket_lines = [
            dict(
                product_id=None,
                variant_id=None,
                description="Dokuma etiket 1000 adet",
                quantity=Decimal("5"),
                unit_cost=Decimal("180.00"),
            )
        ]
        p4, t4 = make_purchase(
            f"SA-{today.year}-0004",
            by_code["T-004"],
            today - timedelta(days=4),
            "Etiket siparişi",
            etiket_lines,
            "confirmed",
        )
        purchases_to_add.append((p4, t4, by_code["T-004"], False))

        for p, _total, _sup, apply_stock in purchases_to_add:
            db.add(p)
        db.flush()

        # Apply stock for confirmed purchase with variants (seed-time)
        from app.models.product import StockMovement, DEFAULT_WAREHOUSE

        for p, total, sup, apply_stock in purchases_to_add:
            if p.status != "confirmed":
                continue
            if apply_stock:
                for line in p.lines:
                    qty_int = int(line.quantity)
                    if line.variant_id:
                        variant = db.get(ProductVariant, line.variant_id)
                        if not variant:
                            continue
                        product = db.get(Product, variant.product_id)
                        before = variant.stock_qty or 0
                        after = before + qty_int
                        variant.stock_qty = after
                        if product:
                            product.stock_qty = sum(v.stock_qty for v in product.variants)
                            db.add(
                                StockMovement(
                                    product_id=product.id,
                                    variant_id=variant.id,
                                    direction="increase",
                                    quantity=qty_int,
                                    qty_before=before,
                                    qty_after=after,
                                    reason="Satın alma",
                                    note=f"{p.purchase_number}: {line.description}",
                                    warehouse=product.warehouse or DEFAULT_WAREHOUSE,
                                    created_by_user_id=uid,
                                )
                            )
                    elif line.product_id:
                        product = db.get(Product, line.product_id)
                        if not product or product.variants:
                            continue
                        before = product.stock_qty or 0
                        after = before + qty_int
                        product.stock_qty = after
                        db.add(
                            StockMovement(
                                product_id=product.id,
                                variant_id=None,
                                direction="increase",
                                quantity=qty_int,
                                qty_before=before,
                                qty_after=after,
                                reason="Satın alma",
                                note=f"{p.purchase_number}: {line.description}",
                                warehouse=product.warehouse or DEFAULT_WAREHOUSE,
                                created_by_user_id=uid,
                            )
                        )
            db.add(
                SupplierMovement(
                    supplier_id=sup.id,
                    movement_type="purchase",
                    debit=total,
                    credit=Decimal("0"),
                    movement_date=p.purchase_date,
                    purchase_id=p.id,
                    note=f"Satın alma {p.purchase_number}",
                )
            )

        # Partial payment to T-001
        db.add(
            SupplierMovement(
                supplier_id=by_code["T-001"].id,
                movement_type="payment",
                debit=Decimal("0"),
                credit=Decimal("3000.00"),
                movement_date=today - timedelta(days=5),
                note="Kısmi havale ödemesi",
            )
        )
        # Payment to T-002
        db.add(
            SupplierMovement(
                supplier_id=by_code["T-002"].id,
                movement_type="payment",
                debit=Decimal("0"),
                credit=Decimal("2000.00"),
                movement_date=today - timedelta(days=3),
                note="Nakit ödeme",
            )
        )
        db.commit()


    print("Seed tamamlandı: admin@baykus.local / admin123")


def main() -> None:
    """Seed only. For SQLite first-time setup prefer: python -m app.bootstrap_sqlite

    Postgres: alembic upgrade head && python -m app.seed
    SQLite:   python -m app.bootstrap_sqlite   (create_all + seed; skip alembic)
    """
    from app.core.config import get_settings

    settings = get_settings()
    if settings.database_url.startswith("sqlite"):
        from sqlalchemy import inspect

        import app.models  # noqa: F401
        from app.db.base import Base
        from app.db.session import engine

        if "users" not in set(inspect(engine).get_table_names()):
            print("SQLite tabloları yok — create_all...")
            Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
