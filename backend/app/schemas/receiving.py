from datetime import datetime

from pydantic import BaseModel, Field


class ReceivingSessionItemInput(BaseModel):
    barcode: str | None = None
    product_id: int | None = None
    quantity: float = 1.0
    purchase_price: float | None = None


class ReceivingSessionCreate(BaseModel):
    supplier: str
    invoice_number: str | None = None
    items: list[ReceivingSessionItemInput] = Field(default_factory=list)


class ReceivingSessionCreateResponse(BaseModel):
    session_id: int
    status: str


class ReceivingSessionListItem(BaseModel):
    id: int
    supplier: str
    invoice_number: str | None
    status: str
    expected_items_count: int
    scanned_items_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ReceivingSessionItemResponse(BaseModel):
    id: int
    product_id: int | None
    barcode: str
    product_name: str
    expected_quantity: float
    scanned_quantity: float
    purchase_price: float | None
    status: str

    model_config = {"from_attributes": True}


class ReceivingSessionDetail(BaseModel):
    id: int
    supplier: str
    invoice_number: str | None
    status: str
    expected_items_count: int
    scanned_items_count: int
    created_at: datetime
    confirmed_at: datetime | None
    items: list[ReceivingSessionItemResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class ReceivingScanRequest(BaseModel):
    session_id: int
    barcode: str


class ReceivingScanResponse(BaseModel):
    barcode: str
    product_name: str
    product_id: int | None
    expected_quantity: float
    scanned_quantity: float
    status: str
    session_progress: float


class ReceivingAddItemRequest(BaseModel):
    product_id: int
    quantity: float
    purchase_price: float | None = None


class ReceivingUpdateItemRequest(BaseModel):
    expected_quantity: float | None = None
    scanned_quantity: float | None = None
    purchase_price: float | None = None


class ReceivingLinkItemRequest(BaseModel):
    item_id: int
    product_id: int


class ReceivingConfirmResponse(BaseModel):
    invoice_id: int
    created_batches: list[dict]


class BarcodeProductResponse(BaseModel):
    id: int
    name: str
    unit: str
    retail_price: float
    stock: float
    barcode: str | None
