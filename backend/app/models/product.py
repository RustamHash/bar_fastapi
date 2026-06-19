from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    retail_price: Mapped[float] = mapped_column(Float, default=0.0)
    min_stock: Mapped[float] = mapped_column(Float, default=0.0)
    is_kit: Mapped[bool] = mapped_column(Boolean, default=False)
    kit_price_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sellable: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    kit_components: Mapped[list["KitComponent"]] = relationship(
        "KitComponent",
        foreign_keys="KitComponent.kit_id",
        back_populates="kit",
        cascade="all, delete-orphan",
    )
    batches: Mapped[list["ProductBatch"]] = relationship(
        "ProductBatch", back_populates="product"
    )
    price_history: Mapped[list["PriceHistory"]] = relationship(
        "PriceHistory", back_populates="product"
    )
    barcodes: Mapped[list["ProductBarcode"]] = relationship(
        "ProductBarcode", back_populates="product", cascade="all, delete-orphan"
    )


class ProductBarcode(Base):
    __tablename__ = "product_barcodes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("products.id"), nullable=False)
    barcode: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)

    product: Mapped["Product"] = relationship("Product", back_populates="barcodes")

    @property
    def stock(self) -> float:
        if self.is_kit:
            return 0.0
        return sum(
            b.remaining_quantity for b in self.batches if b.is_active and b.remaining_quantity > 0
        )


class KitComponent(Base):
    __tablename__ = "kit_components"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    kit_id: Mapped[int] = mapped_column(Integer, ForeignKey("products.id"), nullable=False)
    component_id: Mapped[int] = mapped_column(Integer, ForeignKey("products.id"), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    show_in_receipt: Mapped[bool] = mapped_column(Boolean, default=True)
    show_in_order: Mapped[bool] = mapped_column(Boolean, default=True)
    price_override: Mapped[float | None] = mapped_column(Float, nullable=True)

    kit: Mapped["Product"] = relationship(
        "Product", foreign_keys=[kit_id], back_populates="kit_components"
    )
    component: Mapped["Product"] = relationship("Product", foreign_keys=[component_id])


class ProductBatch(Base):
    __tablename__ = "product_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("products.id"), nullable=False)
    invoice_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("invoices.id"), nullable=True)
    invoice_item_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("invoice_items.id"), nullable=True
    )
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    remaining_quantity: Mapped[float] = mapped_column(Float, nullable=False)
    purchase_price: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    product: Mapped["Product"] = relationship("Product", back_populates="batches")
    invoice: Mapped["Invoice"] = relationship("Invoice", back_populates="batches")
    movements: Mapped[list["BatchMovement"]] = relationship(
        "BatchMovement", back_populates="batch"
    )


class PriceHistory(Base):
    __tablename__ = "price_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("products.id"), nullable=False)
    old_price: Mapped[float] = mapped_column(Float, nullable=False)
    new_price: Mapped[float] = mapped_column(Float, nullable=False)
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    product: Mapped["Product"] = relationship("Product", back_populates="price_history")


from app.models.invoice import Invoice  # noqa: E402
from app.models.order import BatchMovement  # noqa: E402
