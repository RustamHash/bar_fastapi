from datetime import datetime

from pydantic import BaseModel, Field


class KitComponentCreate(BaseModel):
    component_id: int
    quantity: float
    show_in_receipt: bool = True
    show_in_order: bool = True
    price_override: float | None = None


class KitComponentResponse(BaseModel):
    id: int
    component_id: int
    component_name: str
    quantity: float
    show_in_receipt: bool
    show_in_order: bool
    price_override: float | None
    component_price: float
    component_unit: str

    model_config = {"from_attributes": True}


class ProductCreate(BaseModel):
    name: str
    category: str
    unit: str
    retail_price: float = 0.0
    min_stock: float = 0.0
    abv: float | None = None
    ibu: int | None = None
    is_kit: bool = False
    kit_price_type: str | None = "manual"
    components: list[KitComponentCreate] = Field(default_factory=list)


class ProductUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    unit: str | None = None
    retail_price: float | None = None
    min_stock: float | None = None
    abv: float | None = None
    ibu: int | None = None
    is_kit: bool | None = None
    kit_price_type: str | None = None
    is_active: bool | None = None
    components: list[KitComponentCreate] | None = None


class ProductResponse(BaseModel):
    id: int
    name: str
    category: str
    unit: str
    retail_price: float
    stock: float
    min_stock: float
    abv: float | None
    ibu: int | None
    is_kit: bool
    kit_price_type: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    components: list[KitComponentResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class ProductBatchResponse(BaseModel):
    id: int
    product_id: int
    invoice_id: int | None
    quantity: float
    remaining_quantity: float
    purchase_price: float
    created_at: datetime
    is_active: bool

    model_config = {"from_attributes": True}


class PriceHistoryResponse(BaseModel):
    id: int
    product_id: int
    old_price: float
    new_price: float
    changed_at: datetime

    model_config = {"from_attributes": True}
