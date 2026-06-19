from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def run_migrations(engine: Engine) -> None:
    """Add new columns/tables for existing databases (create_all won't alter tables)."""
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()

    with engine.begin() as conn:
        if "products" in existing_tables:
            cols = {c["name"] for c in inspector.get_columns("products")}
            if "sellable" not in cols:
                if "show_in_search" in cols:
                    conn.execute(text(
                        "ALTER TABLE products RENAME COLUMN show_in_search TO sellable"
                    ))
                else:
                    conn.execute(text(
                        "ALTER TABLE products ADD COLUMN sellable BOOLEAN DEFAULT 1"
                    ))
                    conn.execute(text(
                        "UPDATE products SET sellable = 0 "
                        "WHERE is_kit = 0 AND category IN ('beer', 'packaging')"
                    ))
            for col in ("abv", "ibu"):
                if col in cols:
                    conn.execute(text(f"ALTER TABLE products DROP COLUMN {col}"))

        if "orders" in existing_tables:
            cols = {c["name"] for c in inspector.get_columns("orders")}
            if "all_scanned" not in cols:
                conn.execute(text(
                    "ALTER TABLE orders ADD COLUMN all_scanned BOOLEAN DEFAULT 0"
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
            if "created_at" not in cols:
                conn.execute(text(
                    "ALTER TABLE order_items ADD COLUMN created_at DATETIME"
                ))
                conn.execute(text(
                    "UPDATE order_items SET created_at = CURRENT_TIMESTAMP "
                    "WHERE created_at IS NULL"
                ))

        had_bar_tables = "bar_tables" in existing_tables
        had_tables = "tables" in existing_tables
        if had_bar_tables and not had_tables:
            conn.execute(text("ALTER TABLE bar_tables RENAME TO tables"))

        if had_tables or had_bar_tables:
            table_cols = {c["name"] for c in inspector.get_columns("tables")}
            for col in ("label", "width", "height", "capacity", "section", "is_reserved"):
                if col in table_cols:
                    conn.execute(text(f"ALTER TABLE tables DROP COLUMN {col}"))

        if "product_barcodes" not in existing_tables:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS product_barcodes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_id INTEGER NOT NULL REFERENCES products(id),
                    barcode VARCHAR(50) NOT NULL UNIQUE,
                    is_primary BOOLEAN DEFAULT 0
                )
            """))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_product_barcodes_barcode ON product_barcodes (barcode)"
            ))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_product_barcodes_product_id ON product_barcodes (product_id)"
            ))

        if "products" in existing_tables:
            cols = {c["name"] for c in inspector.get_columns("products")}
            if "barcode" in cols:
                conn.execute(text("""
                    INSERT OR IGNORE INTO product_barcodes (product_id, barcode, is_primary)
                    SELECT id, barcode, 1 FROM products
                    WHERE barcode IS NOT NULL AND barcode != ''
                """))
                conn.execute(text("DROP INDEX IF EXISTS ix_products_barcode"))
                conn.execute(text("ALTER TABLE products DROP COLUMN barcode"))

        if "invoices" in existing_tables:
            cols = {c["name"] for c in inspector.get_columns("invoices")}
            if "invoice_number" not in cols:
                conn.execute(text(
                    "ALTER TABLE invoices ADD COLUMN invoice_number VARCHAR(100)"
                ))

        if "receiving_sessions" in existing_tables:
            cols = {c["name"] for c in inspector.get_columns("receiving_sessions")}
            if "invoice_number" not in cols:
                conn.execute(text(
                    "ALTER TABLE receiving_sessions ADD COLUMN invoice_number VARCHAR(100)"
                ))

        if "product_batches" in existing_tables:
            cols = {c["name"] for c in inspector.get_columns("product_batches")}
            if "invoice_item_id" not in cols:
                conn.execute(text(
                    "ALTER TABLE product_batches ADD COLUMN invoice_item_id INTEGER "
                    "REFERENCES invoice_items(id)"
                ))

        if "orders" in existing_tables and "order_items" in existing_tables:
            conn.execute(text("""
                UPDATE orders SET total_cost = (
                    SELECT COALESCE(SUM(oi.cost_price), 0)
                    FROM order_items oi
                    WHERE oi.order_id = orders.id AND oi.is_kit_component = 0
                )
            """))
