from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.product import Product, KitComponent, ProductBatch, PriceHistory
from app.routers.auth import get_current_user, User
from app.schemas.product import (
    ProductCreate,
    ProductUpdate,
    ProductResponse,
    KitComponentResponse,
    ProductBatchResponse,
    PriceHistoryResponse,
)
from app.services.batch_service import get_product_stock
from app.services.kit_service import calculate_kit_price
from app.services.barcode_service import normalize_barcode, generate_internal_ean13
from app.schemas.receiving import BarcodeBindRequest, BarcodeProductResponse

router = APIRouter(prefix="/api/products", tags=["products"])


def build_product_response(db: Session, product: Product) -> ProductResponse:
    stock = 0.0 if product.is_kit else get_product_stock(db, product.id)
    components = []
    if product.is_kit:
        for comp in product.kit_components:
            components.append(
                KitComponentResponse(
                    id=comp.id,
                    component_id=comp.component_id,
                    component_name=comp.component.name,
                    quantity=comp.quantity,
                    show_in_receipt=comp.show_in_receipt,
                    show_in_order=comp.show_in_order,
                    price_override=comp.price_override,
                    component_price=comp.component.retail_price,
                    component_unit=comp.component.unit,
                )
            )
    return ProductResponse(
        id=product.id,
        name=product.name,
        category=product.category,
        unit=product.unit,
        retail_price=product.retail_price,
        stock=stock,
        min_stock=product.min_stock,
        abv=product.abv,
        ibu=product.ibu,
        is_kit=product.is_kit,
        kit_price_type=product.kit_price_type,
        is_active=product.is_active,
        barcode=product.barcode,
        created_at=product.created_at,
        updated_at=product.updated_at,
        components=components,
    )


@router.get("", response_model=list[ProductResponse])
def list_products(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    category: str | None = None,
    active_only: bool = True,
):
    query = db.query(Product).options(
        joinedload(Product.kit_components).joinedload(KitComponent.component)
    )
    if active_only:
        query = query.filter(Product.is_active == True)  # noqa: E712
    if category:
        query = query.filter(Product.category == category)
    products = query.order_by(Product.name).all()
    return [build_product_response(db, p) for p in products]


def check_barcode_unique(db: Session, barcode: str, exclude_product_id: int | None = None) -> None:
    if not barcode:
        return
    barcode = normalize_barcode(barcode)
    query = db.query(Product).filter(Product.barcode == barcode)
    if exclude_product_id:
        query = query.filter(Product.id != exclude_product_id)
    if query.first():
        raise HTTPException(status_code=400, detail="Штрихкод уже используется другим товаром")


@router.get("/by-barcode/{barcode}", response_model=BarcodeProductResponse)
def get_product_by_barcode(
    barcode: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    barcode = normalize_barcode(barcode)
    product = db.query(Product).filter(Product.barcode == barcode).first()
    if not product:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "barcode": barcode},
        )
    stock = 0.0 if product.is_kit else get_product_stock(db, product.id)
    return BarcodeProductResponse(
        id=product.id,
        name=product.name,
        unit=product.unit,
        retail_price=product.retail_price,
        stock=stock,
        barcode=product.barcode,
    )


@router.get("/generate-barcode")
def generate_barcode(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    existing = {row.barcode for row in db.query(Product).filter(Product.barcode.isnot(None)).all()}
    barcode = generate_internal_ean13(existing)
    return {"barcode": barcode}


@router.get("/available-components", response_model=list[ProductResponse])
def available_components(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    products = (
        db.query(Product)
        .filter(Product.is_active == True, Product.is_kit == False)  # noqa: E712
        .order_by(Product.name)
        .all()
    )
    return [build_product_response(db, p) for p in products]


@router.get("/{product_id}", response_model=ProductResponse)
def get_product(
    product_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    product = (
        db.query(Product)
        .options(joinedload(Product.kit_components).joinedload(KitComponent.component))
        .filter(Product.id == product_id)
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")
    return build_product_response(db, product)


@router.post("", response_model=ProductResponse, status_code=201)
def create_product(
    data: ProductCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if data.is_kit and data.components:
        for comp in data.components:
            component = db.query(Product).filter(Product.id == comp.component_id).first()
            if not component:
                raise HTTPException(status_code=400, detail=f"Компонент {comp.component_id} не найден")
            if component.is_kit:
                raise HTTPException(status_code=400, detail="Нельзя добавить комплект как компонент")

    if data.barcode:
        check_barcode_unique(db, data.barcode)

    product = Product(
        name=data.name,
        category=data.category,
        unit=data.unit,
        retail_price=data.retail_price,
        min_stock=data.min_stock,
        abv=data.abv,
        ibu=data.ibu,
        is_kit=data.is_kit,
        kit_price_type=data.kit_price_type if data.is_kit else None,
        barcode=normalize_barcode(data.barcode) if data.barcode else None,
    )
    db.add(product)
    db.flush()

    if data.is_kit and data.components:
        for comp in data.components:
            db.add(
                KitComponent(
                    kit_id=product.id,
                    component_id=comp.component_id,
                    quantity=comp.quantity,
                    show_in_receipt=comp.show_in_receipt,
                    show_in_order=comp.show_in_order,
                    price_override=comp.price_override,
                )
            )

    db.commit()
    db.refresh(product)
    product = (
        db.query(Product)
        .options(joinedload(Product.kit_components).joinedload(KitComponent.component))
        .filter(Product.id == product.id)
        .first()
    )
    return build_product_response(db, product)


@router.put("/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: int,
    data: ProductUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    product = (
        db.query(Product)
        .options(joinedload(Product.kit_components).joinedload(KitComponent.component))
        .filter(Product.id == product_id)
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")

    if data.barcode is not None:
        check_barcode_unique(db, data.barcode, exclude_product_id=product.id)

    if data.retail_price is not None and data.retail_price != product.retail_price:
        db.add(
            PriceHistory(
                product_id=product.id,
                old_price=product.retail_price,
                new_price=data.retail_price,
            )
        )

    update_data = data.model_dump(exclude_unset=True, exclude={"components"})
    for key, value in update_data.items():
        if key == "barcode" and value:
            value = normalize_barcode(value)
        setattr(product, key, value)

    if data.components is not None and product.is_kit:
        for comp in data.components:
            component = db.query(Product).filter(Product.id == comp.component_id).first()
            if component and component.is_kit:
                raise HTTPException(status_code=400, detail="Нельзя добавить комплект как компонент")
        db.query(KitComponent).filter(KitComponent.kit_id == product.id).delete()
        for comp in data.components:
            db.add(
                KitComponent(
                    kit_id=product.id,
                    component_id=comp.component_id,
                    quantity=comp.quantity,
                    show_in_receipt=comp.show_in_receipt,
                    show_in_order=comp.show_in_order,
                    price_override=comp.price_override,
                )
            )

    db.commit()
    product = (
        db.query(Product)
        .options(joinedload(Product.kit_components).joinedload(KitComponent.component))
        .filter(Product.id == product.id)
        .first()
    )
    return build_product_response(db, product)


@router.delete("/{product_id}")
def deactivate_product(
    product_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")

    used_in_kit = (
        db.query(KitComponent)
        .filter(KitComponent.component_id == product_id)
        .first()
    )
    if used_in_kit:
        raise HTTPException(
            status_code=400,
            detail="Товар используется как компонент в комплекте",
        )

    product.is_active = False
    db.commit()
    return {"message": "Товар деактивирован"}


@router.get("/{product_id}/batches", response_model=list[ProductBatchResponse])
def get_product_batches(
    product_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    batches = (
        db.query(ProductBatch)
        .filter(ProductBatch.product_id == product_id)
        .order_by(ProductBatch.created_at.desc())
        .all()
    )
    return batches


@router.get("/{product_id}/price-history", response_model=list[PriceHistoryResponse])
def get_price_history(
    product_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    history = (
        db.query(PriceHistory)
        .filter(PriceHistory.product_id == product_id)
        .order_by(PriceHistory.changed_at.desc())
        .all()
    )
    return history


@router.post("/{product_id}/barcode")
def bind_barcode(
    product_id: int,
    data: BarcodeBindRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")

    barcode = normalize_barcode(data.barcode)
    check_barcode_unique(db, barcode, exclude_product_id=product_id)
    product.barcode = barcode
    db.commit()
    return {"message": "Штрихкод привязан", "barcode": barcode}


@router.delete("/{product_id}/barcode")
def unbind_barcode(
    product_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")
    product.barcode = None
    db.commit()
    return {"message": "Штрихкод отвязан"}
