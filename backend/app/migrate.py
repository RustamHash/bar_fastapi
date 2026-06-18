from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def run_migrations(engine: Engine) -> None:
    """Add new columns/tables for existing databases (create_all won't alter tables)."""
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()

    with engine.begin() as conn:
        if "products" in existing_tables:
            cols = {c["name"] for c in inspector.get_columns("products")}
            if "barcode" not in cols:
                conn.execute(text(
                    "ALTER TABLE products ADD COLUMN barcode VARCHAR(50) UNIQUE"
                ))
                conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS ix_products_barcode ON products (barcode)"
                ))

        if "orders" in existing_tables:
            cols = {c["name"] for c in inspector.get_columns("orders")}
            if "all_scanned" not in cols:
                conn.execute(text(
                    "ALTER TABLE orders ADD COLUMN all_scanned BOOLEAN DEFAULT FALSE"
                ))

        if "order_items" in existing_tables:
            cols = {c["name"] for c in inspector.get_columns("order_items")}
            if "scanned_quantity" not in cols:
                conn.execute(text(
                    "ALTER TABLE order_items ADD COLUMN scanned_quantity FLOAT DEFAULT 0"
                ))
