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
            if "show_in_search" not in cols:
                conn.execute(text(
                    "ALTER TABLE products ADD COLUMN show_in_search BOOLEAN DEFAULT TRUE"
                ))
                conn.execute(text(
                    "UPDATE products SET show_in_search = FALSE "
                    "WHERE is_kit = FALSE AND category IN ('beer', 'packaging')"
                ))

        if "orders" in existing_tables:
            cols = {c["name"] for c in inspector.get_columns("orders")}
            if "all_scanned" not in cols:
                conn.execute(text(
                    "ALTER TABLE orders ADD COLUMN all_scanned BOOLEAN DEFAULT FALSE"
                ))
            if "comment" not in cols:
                conn.execute(text(
                    "ALTER TABLE orders ADD COLUMN comment VARCHAR(255)"
                ))

        if "order_items" in existing_tables:
            cols = {c["name"] for c in inspector.get_columns("order_items")}
            if "scanned_quantity" not in cols:
                conn.execute(text(
                    "ALTER TABLE order_items ADD COLUMN scanned_quantity FLOAT DEFAULT 0"
                ))

        if "bar_tables" in existing_tables and "tables" not in existing_tables:
            conn.execute(text("ALTER TABLE bar_tables RENAME TO tables"))

        if "tables" in existing_tables:
            table_cols = {c["name"] for c in inspector.get_columns("tables")}
            for col in ("label", "width", "height", "capacity", "section", "is_reserved"):
                if col in table_cols:
                    conn.execute(text(f"ALTER TABLE tables DROP COLUMN {col}"))
            conn.execute(text(
                "ALTER TABLE tables ALTER COLUMN number TYPE VARCHAR(50) "
                "USING number::text"
            ))

        if "orders" in existing_tables:
            order_cols = {c["name"] for c in inspector.get_columns("orders")}
            col_info = next(
                (c for c in inspector.get_columns("orders") if c["name"] == "table_num"),
                None,
            )
            if col_info and "INT" in str(col_info.get("type", "")).upper():
                conn.execute(text(
                    "ALTER TABLE orders ALTER COLUMN table_num TYPE VARCHAR(50) "
                    "USING table_num::text"
                ))
