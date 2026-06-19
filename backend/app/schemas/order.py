from datetime import datetime

from pydantic import BaseModel, Field


class OrderItemCreate(BaseModel):
    product_id: int
    quantity: float


class OrderCreate(BaseModel):
    table_num: str
    items: list[OrderItemCreate] = Field(default_factory=list)
    comment: str | None = None


class OrderItemAdd(BaseModel):
    product_id: int
    quantity: float = 1.0


class OrderItemQuantityUpdate(BaseModel):
    quantity: float


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
    scanned_quantity: float = 0.0

    model_config = {"from_attributes": True}


class OrderResponse(BaseModel):
    id: int
    table_num: str
    status: str
    subtotal: float
    discount: float
    total: float
    total_cost: float
    cash_session_id: int | None
    all_scanned: bool = False
    comment: str | None = None
    created_at: datetime
    paid_at: datetime | None
    items: list[OrderItemResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class OrderListResponse(BaseModel):
    id: int
    table_num: str
    status: str
    subtotal: float
    discount: float
    total: float
    total_cost: float
    items_count: int
    all_scanned: bool = False
    comment: str | None = None
    created_at: datetime
    paid_at: datetime | None

    model_config = {"from_attributes": True}


class OrderScanRequest(BaseModel):
    order_id: int
    barcode: str


class OrderScanResponse(BaseModel):
    product_name: str
    in_order: bool
    scanned: float
    need: float
    order_complete: bool


class OrderScanStatusItem(BaseModel):
    product_name: str
    quantity: float
    scanned_quantity: float
    complete: bool


class OrderScanStatusResponse(BaseModel):
    order_id: int
    all_scanned: bool
    items: list[OrderScanStatusItem]
