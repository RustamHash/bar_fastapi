from datetime import datetime

from pydantic import BaseModel


class CashOpen(BaseModel):
    balance: float = 0.0


class CashClose(BaseModel):
    cash_amount: float
    card_amount: float


class CashStatusResponse(BaseModel):
    is_open: bool
    session_id: int | None
    opened_at: datetime | None
    opening_balance: float
    cash_total: float
    card_total: float
    total_revenue: float
    orders_count: int

    model_config = {"from_attributes": True}
