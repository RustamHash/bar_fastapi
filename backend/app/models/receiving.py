from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ReceivingSession(Base):
    __tablename__ = "receiving_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    supplier: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    expected_items_count: Mapped[int] = mapped_column(Integer, default=0)
    scanned_items_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    items: Mapped[list["ReceivingSessionItem"]] = relationship(
        "ReceivingSessionItem",
        back_populates="session",
        cascade="all, delete-orphan",
    )


class ReceivingSessionItem(Base):
    __tablename__ = "receiving_session_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("receiving_sessions.id"), nullable=False
    )
    product_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("products.id"), nullable=True
    )
    barcode: Mapped[str] = mapped_column(String(50), nullable=False)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    expected_quantity: Mapped[float] = mapped_column(Float, default=0.0)
    scanned_quantity: Mapped[float] = mapped_column(Float, default=0.0)
    purchase_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")

    session: Mapped["ReceivingSession"] = relationship(
        "ReceivingSession", back_populates="items"
    )
    product: Mapped["Product | None"] = relationship("Product")


from app.models.product import Product  # noqa: E402
