from datetime import date, datetime

from pydantic import BaseModel, Field


class InvoiceItemCreate(BaseModel):
    product_id: int
    quantity: float
    purchase_price: float


class InvoiceCreate(BaseModel):
    supplier: str
    date: date
    comment: str | None = None
    items: list[InvoiceItemCreate]


class InvoiceItemResponse(BaseModel):
    id: int
    product_id: int
    product_name: str
    quantity: float
    purchase_price: float
    total: float

    model_config = {"from_attributes": True}


class InvoiceResponse(BaseModel):
    id: int
    supplier: str
    date: date
    invoice_number: str | None = None
    total_amount: float
    comment: str | None
    created_at: datetime
    items: list[InvoiceItemResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}
