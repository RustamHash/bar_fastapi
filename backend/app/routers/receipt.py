from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.order import Order, OrderItem
from app.models.product import Product, KitComponent
from app.routers.auth import get_current_user, User

router = APIRouter(prefix="/api/receipt", tags=["receipt"])


def get_receipt_items(order: Order, db: Session, mode: str = "receipt") -> list[dict]:
    items = []
    for item in order.items:
        if item.is_kit_component:
            if mode == "receipt" and not item.show_in_receipt:
                continue
            if mode == "full":
                pass
            elif mode == "kitchen":
                kit_name = ""
                if item.kit_id:
                    kit = db.query(Product).filter(Product.id == item.kit_id).first()
                    kit_name = kit.name if kit else ""
                items.append({
                    "name": item.product.name,
                    "quantity": item.quantity,
                    "unit": item.product.unit,
                    "price": 0,
                    "total": 0,
                    "is_kit_component": True,
                    "kit_name": kit_name,
                    "note": f"Компонент комплекта: {kit_name}",
                })
                continue
            else:
                continue

        if not item.is_kit_component:
            items.append({
                "name": item.product.name,
                "quantity": item.quantity,
                "unit": item.product.unit,
                "price": item.price,
                "total": item.total,
                "is_kit_component": False,
                "kit_name": None,
                "note": None,
            })
        elif mode in ("receipt", "full") and item.show_in_receipt:
            kit_name = ""
            if item.kit_id:
                kit = db.query(Product).filter(Product.id == item.kit_id).first()
                kit_name = kit.name if kit else ""
            items.append({
                "name": item.product.name,
                "quantity": item.quantity,
                "unit": item.product.unit,
                "price": 0,
                "total": 0,
                "is_kit_component": True,
                "kit_name": kit_name,
                "note": f"({kit_name})" if kit_name else None,
            })

    return items


@router.get("/order/{order_id}")
def get_receipt(
    order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    order = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    receipt_items = []
    for item in order.items:
        if item.is_kit_component:
            if item.show_in_receipt:
                kit_name = ""
                if item.kit_id:
                    kit = db.query(Product).filter(Product.id == item.kit_id).first()
                    kit_name = kit.name if kit else ""
                receipt_items.append({
                    "name": item.product.name,
                    "quantity": item.quantity,
                    "unit": item.product.unit,
                    "price": 0,
                    "total": 0,
                    "is_kit_component": True,
                    "kit_name": kit_name,
                })
        else:
            receipt_items.append({
                "name": item.product.name,
                "quantity": item.quantity,
                "unit": item.product.unit,
                "price": item.price,
                "total": item.total,
                "is_kit_component": False,
                "kit_name": None,
            })

    return {
        "order_id": order.id,
        "table_num": order.table_num,
        "created_at": order.created_at.isoformat(),
        "paid_at": order.paid_at.isoformat() if order.paid_at else None,
        "status": order.status,
        "items": receipt_items,
        "subtotal": order.subtotal,
        "discount": order.discount,
        "total": order.total,
    }


@router.get("/order/{order_id}/full")
def get_receipt_full(
    order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    order = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    items = []
    for item in order.items:
        kit_name = None
        if item.kit_id:
            kit = db.query(Product).filter(Product.id == item.kit_id).first()
            kit_name = kit.name if kit else None

        items.append({
            "id": item.id,
            "name": item.product.name,
            "quantity": item.quantity,
            "unit": item.product.unit,
            "price": item.price,
            "total": item.total,
            "cost_price": item.cost_price,
            "is_kit_component": item.is_kit_component,
            "kit_name": kit_name,
            "show_in_receipt": item.show_in_receipt,
            "parent_kit_item_id": item.parent_kit_item_id,
        })

    return {
        "order_id": order.id,
        "table_num": order.table_num,
        "status": order.status,
        "items": items,
        "total": order.total,
        "total_cost": order.total_cost,
    }


@router.get("/order/{order_id}/kitchen")
def get_receipt_kitchen(
    order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    order = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    items = []
    for item in order.items:
        kit_name = None
        note = None
        if item.kit_id:
            kit = db.query(Product).filter(Product.id == item.kit_id).first()
            kit_name = kit.name if kit else None

        if item.is_kit_component:
            note = f"Компонент комплекта «{kit_name}»"
        elif item.product.is_kit:
            note = "Комплект"

        items.append({
            "name": item.product.name,
            "quantity": item.quantity,
            "unit": item.product.unit,
            "is_kit_component": item.is_kit_component,
            "kit_name": kit_name,
            "note": note,
        })

    return {
        "order_id": order.id,
        "table_num": order.table_num,
        "created_at": order.created_at.isoformat(),
        "items": items,
    }
