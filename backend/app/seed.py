from datetime import date

from sqlalchemy.orm import Session

from app.models.product import Product, KitComponent, ProductBatch
from app.models.invoice import Invoice, InvoiceItem
from app.models.table import BarTable


def seed_tables(db: Session) -> None:
    if db.query(BarTable).first():
        return

    layout = [
        {"number": "1", "position_x": 40, "position_y": 40},
        {"number": "2", "position_x": 160, "position_y": 40},
        {"number": "3", "position_x": 280, "position_y": 40},
        {"number": "4", "position_x": 400, "position_y": 40},
        {"number": "5", "position_x": 100, "position_y": 160},
        {"number": "6", "position_x": 280, "position_y": 160},
        {"number": "Бар", "position_x": 40, "position_y": 280},
        {"number": "У окна", "position_x": 200, "position_y": 280},
    ]

    for tdata in layout:
        db.add(BarTable(**tdata))

    db.commit()


def seed_database(db: Session) -> None:
    if db.query(Product).first():
        return

    products_data = [
        {"name": "Жигулевское (литр)", "category": "beer", "unit": "liter", "retail_price": 400, "min_stock": 10, "abv": 4.5, "barcode": "4601234567010", "show_in_search": False},
        {"name": "Чешское (литр)", "category": "beer", "unit": "liter", "retail_price": 500, "min_stock": 10, "abv": 4.8, "barcode": "4601234567027", "show_in_search": False},
        {"name": "IPA (литр)", "category": "beer", "unit": "liter", "retail_price": 700, "min_stock": 5, "abv": 6.5, "barcode": "4601234567034", "show_in_search": False},
        {"name": "Бутылка ПЭТ 1.5л", "category": "packaging", "unit": "piece", "retail_price": 50, "min_stock": 20, "barcode": "4601234567041", "show_in_search": False},
        {"name": "Крышка", "category": "packaging", "unit": "piece", "retail_price": 5, "min_stock": 50, "barcode": "4601234567058", "show_in_search": False},
        {"name": "Бокал пластиковый", "category": "packaging", "unit": "piece", "retail_price": 30, "min_stock": 30, "barcode": "4601234567065", "show_in_search": False},
        {"name": "Гренки чесночные", "category": "snack", "unit": "piece", "retail_price": 150, "min_stock": 5, "barcode": "4601234567072", "show_in_search": True},
        {"name": "Кальмар сушёный", "category": "snack", "unit": "kg", "retail_price": 800, "min_stock": 2, "barcode": "4601234567089", "show_in_search": True},
    ]

    products = {}
    for pdata in products_data:
        p = Product(**pdata, is_kit=False)
        db.add(p)
        db.flush()
        products[pdata["name"]] = p

    kits_data = [
        {
            "name": "Жигулевское 0.5 зал",
            "retail_price": 250,
            "components": [
                ("Жигулевское (литр)", 0.5, True),
                ("Бокал пластиковый", 1, True),
            ],
        },
        {
            "name": "Жигулевское 1.5 навынос",
            "retail_price": 600,
            "components": [
                ("Жигулевское (литр)", 1.5, True),
                ("Бутылка ПЭТ 1.5л", 1, False),
                ("Крышка", 1, False),
            ],
        },
        {
            "name": "Чешское 0.5 зал",
            "retail_price": 300,
            "components": [
                ("Чешское (литр)", 0.5, True),
                ("Бокал пластиковый", 1, True),
            ],
        },
        {
            "name": "IPA 0.3 зал",
            "retail_price": 350,
            "components": [
                ("IPA (литр)", 0.3, True),
            ],
        },
    ]

    for kdata in kits_data:
        kit = Product(
            name=kdata["name"],
            category="kit",
            unit="piece",
            retail_price=kdata["retail_price"],
            min_stock=0,
            is_kit=True,
            kit_price_type="manual",
            show_in_search=True,
        )
        db.add(kit)
        db.flush()
        products[kdata["name"]] = kit

        for comp_name, qty, show_receipt in kdata["components"]:
            db.add(
                KitComponent(
                    kit_id=kit.id,
                    component_id=products[comp_name].id,
                    quantity=qty,
                    show_in_receipt=show_receipt,
                    show_in_order=True,
                )
            )

    today = date.today()

    invoices_data = [
        {
            "supplier": "ПивКо",
            "items": [
                ("Жигулевское (литр)", 100, 100),
                ("Чешское (литр)", 80, 120),
                ("IPA (литр)", 50, 200),
            ],
        },
        {
            "supplier": "ТараОпт",
            "items": [
                ("Бутылка ПЭТ 1.5л", 200, 20),
                ("Крышка", 500, 2),
                ("Бокал пластиковый", 300, 10),
            ],
        },
        {
            "supplier": "СнекиПро",
            "items": [
                ("Гренки чесночные", 50, 60),
                ("Кальмар сушёный", 10, 300),
            ],
        },
    ]

    for inv_data in invoices_data:
        invoice = Invoice(
            supplier=inv_data["supplier"],
            date=today,
            total_amount=0,
        )
        db.add(invoice)
        db.flush()

        total = 0.0
        for prod_name, qty, price in inv_data["items"]:
            product = products[prod_name]
            item_total = qty * price
            total += item_total

            db.add(
                InvoiceItem(
                    invoice_id=invoice.id,
                    product_id=product.id,
                    quantity=qty,
                    purchase_price=price,
                    total=item_total,
                )
            )
            db.add(
                ProductBatch(
                    product_id=product.id,
                    invoice_id=invoice.id,
                    quantity=qty,
                    remaining_quantity=qty,
                    purchase_price=price,
                    is_active=True,
                )
            )

        invoice.total_amount = total

    db.commit()
