from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    table_num: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="open")
    subtotal: Mapped[float] = mapped_column(Float, default=0.0)
    discount: Mapped[float] = mapped_column(Float, default=0.0)
    total: Mapped[float] = mapped_column(Float, default=0.0)
    total_cost: Mapped[float] = mapped_column(Float, default=0.0)
    cash_session_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("cash_sessions.id"), nullable=True
    )
    all_scanned: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    items: Mapped[list["OrderItem"]] = relationship(
        "OrderItem",
        back_populates="order",
        foreign_keys="OrderItem.order_id",
        cascade="all, delete-orphan",
    )
    cash_session: Mapped["CashSession"] = relationship("CashSession", back_populates="orders")


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("products.id"), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    total: Mapped[float] = mapped_column(Float, nullable=False)
    cost_price: Mapped[float] = mapped_column(Float, default=0.0)
    is_kit_component: Mapped[bool] = mapped_column(Boolean, default=False)
    parent_kit_item_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("order_items.id"), nullable=True
    )
    kit_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("products.id"), nullable=True)
    show_in_receipt: Mapped[bool] = mapped_column(Boolean, default=True)
    scanned_quantity: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    order: Mapped["Order"] = relationship("Order", back_populates="items", foreign_keys=[order_id])
    product: Mapped["Product"] = relationship("Product", foreign_keys=[product_id])
    parent_kit_item: Mapped["OrderItem | None"] = relationship(
        "OrderItem", remote_side=[id], foreign_keys=[parent_kit_item_id]
    )
    child_items: Mapped[list["OrderItem"]] = relationship(
        "OrderItem", foreign_keys=[parent_kit_item_id]
    )
    batch_allocations: Mapped[list["OrderItemBatch"]] = relationship(
        "OrderItemBatch", back_populates="order_item", cascade="all, delete-orphan"
    )


class BatchMovement(Base):
    __tablename__ = "batch_movements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    batch_id: Mapped[int] = mapped_column(Integer, ForeignKey("product_batches.id"), nullable=False)
    order_item_id: Mapped[int] = mapped_column(Integer, ForeignKey("order_items.id"), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    movement_type: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    batch: Mapped["ProductBatch"] = relationship("ProductBatch", back_populates="movements")
    order_item: Mapped["OrderItem"] = relationship("OrderItem")


class OrderItemBatch(Base):
    __tablename__ = "order_item_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    order_item_id: Mapped[int] = mapped_column(Integer, ForeignKey("order_items.id"), nullable=False)
    batch_id: Mapped[int] = mapped_column(Integer, ForeignKey("product_batches.id"), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)

    order_item: Mapped["OrderItem"] = relationship("OrderItem", back_populates="batch_allocations")
    batch: Mapped["ProductBatch"] = relationship("ProductBatch")


from app.models.product import Product, ProductBatch  # noqa: E402
from app.models.cash import CashSession  # noqa: E402
