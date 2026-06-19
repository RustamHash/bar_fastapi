from datetime import datetime

from pydantic import BaseModel


class BarTableCreate(BaseModel):
    number: str
    position_x: float = 0.0
    position_y: float = 0.0


class BarTableUpdate(BaseModel):
    number: str | None = None
    position_x: float | None = None
    position_y: float | None = None


class BarTableResponse(BaseModel):
    id: int
    number: str
    position_x: float
    position_y: float
    is_active: bool
    has_open_orders: bool
    open_orders_count: int = 0


class TableOrderSummary(BaseModel):
    id: int
    total: float
    created_at: datetime
    comment: str | None
    items_count: int = 0
