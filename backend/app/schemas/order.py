from datetime import datetime

from pydantic import BaseModel, Field


class OrderItemCreate(BaseModel):
    product_id: int
    quantity: float


class OrderCreate(BaseModel):
    table_num: int
    items: list[OrderItemCreate]


class OrderItemResponse(BaseModel):
    id: int
    product_id: int
    product_name: str
    quantity: float
    price: float
    total: float
    cost_price: float
    is_kit_component: bool
    parent_kit_item_id: int | None
    kit_id: int | None
    kit_name: str | None
    show_in_receipt: bool
    show_in_order: bool = True
    unit: str

    model_config = {"from_attributes": True}


class OrderResponse(BaseModel):
    id: int
    table_num: int
    status: str
    subtotal: float
    discount: float
    total: float
    total_cost: float
    cash_session_id: int | None
    created_at: datetime
    paid_at: datetime | None
    items: list[OrderItemResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class OrderListResponse(BaseModel):
    id: int
    table_num: int
    status: str
    subtotal: float
    discount: float
    total: float
    total_cost: float
    items_count: int
    created_at: datetime
    paid_at: datetime | None

    model_config = {"from_attributes": True}
