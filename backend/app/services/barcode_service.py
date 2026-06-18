"""EAN-13 barcode utilities."""

import random


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
