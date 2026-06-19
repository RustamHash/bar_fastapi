"""Barcode utilities and database helpers."""

import random

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.product import Product, ProductBarcode


def calculate_ean13_check_digit(digits12: str) -> str:
    total = 0
    for i, ch in enumerate(digits12):
        n = int(ch)
        total += n * (1 if i % 2 == 0 else 3)
    check = (10 - (total % 10)) % 10
    return str(check)


def generate_internal_ean13(existing_barcodes: set[str]) -> str:
    """Generate unique EAN-13 with internal prefix 200."""
    for _ in range(1000):
        body = "200" + "".join(str(random.randint(0, 9)) for _ in range(9))
        barcode = body + calculate_ean13_check_digit(body)
        if barcode not in existing_barcodes:
            return barcode
    raise RuntimeError("Не удалось сгенерировать уникальный штрихкод")


def normalize_barcode(barcode: str) -> str:
    return barcode.strip()


def get_all_barcodes(db: Session) -> set[str]:
    return {row.barcode for row in db.query(ProductBarcode.barcode).all()}


def find_product_by_barcode(db: Session, barcode: str) -> Product | None:
    barcode = normalize_barcode(barcode)
    if not barcode:
        return None
    record = (
        db.query(ProductBarcode)
        .filter(ProductBarcode.barcode == barcode)
        .first()
    )
    return record.product if record else None


def get_primary_barcode(db: Session, product_id: int) -> str | None:
    primary = (
        db.query(ProductBarcode)
        .filter(ProductBarcode.product_id == product_id, ProductBarcode.is_primary == True)  # noqa: E712
        .first()
    )
    if primary:
        return primary.barcode
    any_bc = (
        db.query(ProductBarcode)
        .filter(ProductBarcode.product_id == product_id)
        .first()
    )
    return any_bc.barcode if any_bc else None


def check_barcode_unique(
    db: Session,
    barcode: str,
    exclude_product_id: int | None = None,
) -> None:
    barcode = normalize_barcode(barcode)
    if not barcode:
        return
    query = db.query(ProductBarcode).filter(ProductBarcode.barcode == barcode)
    existing = query.first()
    if existing and (exclude_product_id is None or existing.product_id != exclude_product_id):
        raise HTTPException(status_code=400, detail="Штрихкод уже используется другим товаром")


def set_primary_barcode(db: Session, product_id: int, barcode_id: int) -> None:
    db.query(ProductBarcode).filter(ProductBarcode.product_id == product_id).update(
        {"is_primary": False}, synchronize_session=False
    )
    record = db.query(ProductBarcode).filter(
        ProductBarcode.id == barcode_id,
        ProductBarcode.product_id == product_id,
    ).first()
    if record:
        record.is_primary = True
