from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.order import Order
from app.models.table import BarTable
from app.routers.auth import get_current_user, User
from app.schemas.table import (
    BarTableCreate,
    BarTableUpdate,
    BarTableResponse,
    TableOrderSummary,
)

router = APIRouter(prefix="/api/tables", tags=["tables"])


def get_open_orders_by_table(db: Session) -> dict[str, list[Order]]:
    orders = (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(Order.status == "open")
        .order_by(Order.created_at.asc())
        .all()
    )
    by_table: dict[str, list[Order]] = defaultdict(list)
    for order in orders:
        by_table[str(order.table_num)].append(order)
    return by_table


def build_order_summary(order: Order) -> TableOrderSummary:
    items_count = sum(1 for i in order.items if not i.is_kit_component)
    return TableOrderSummary(
        id=order.id,
        total=order.total,
        created_at=order.created_at,
        comment=order.comment,
        items_count=items_count,
    )


def build_table_response(table: BarTable, open_orders: list[Order]) -> BarTableResponse:
    return BarTableResponse(
        id=table.id,
        number=table.number,
        position_x=table.position_x,
        position_y=table.position_y,
        is_active=table.is_active,
        has_open_orders=len(open_orders) > 0,
        open_orders_count=len(open_orders),
    )


@router.get("", response_model=list[BarTableResponse])
def list_tables(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    tables = (
        db.query(BarTable)
        .filter(BarTable.is_active == True)  # noqa: E712
        .order_by(BarTable.number)
        .all()
    )
    orders_by_table = get_open_orders_by_table(db)
    return [
        build_table_response(t, orders_by_table.get(t.number, []))
        for t in tables
    ]


@router.post("", response_model=BarTableResponse, status_code=201)
def create_table(
    data: BarTableCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    number = data.number.strip()
    if not number:
        raise HTTPException(status_code=400, detail="Укажите номер стола")

    existing = db.query(BarTable).filter(BarTable.number == number).first()
    if existing:
        raise HTTPException(status_code=400, detail="Стол с таким номером уже существует")

    table = BarTable(
        number=number,
        position_x=data.position_x,
        position_y=data.position_y,
    )
    db.add(table)
    db.commit()
    db.refresh(table)
    return build_table_response(table, [])


@router.get("/{table_id}/orders", response_model=list[TableOrderSummary])
def get_table_orders(
    table_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    table = db.query(BarTable).filter(BarTable.id == table_id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Стол не найден")

    orders = (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(Order.table_num == table.number, Order.status == "open")
        .order_by(Order.created_at.asc())
        .all()
    )
    return [build_order_summary(o) for o in orders]


@router.put("/{table_id}", response_model=BarTableResponse)
def update_table(
    table_id: int,
    data: BarTableUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    table = db.query(BarTable).filter(BarTable.id == table_id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Стол не найден")

    old_number = table.number
    if data.number is not None:
        new_number = data.number.strip()
        if not new_number:
            raise HTTPException(status_code=400, detail="Укажите номер стола")
        if new_number != table.number:
            conflict = db.query(BarTable).filter(BarTable.number == new_number).first()
            if conflict:
                raise HTTPException(status_code=400, detail="Стол с таким номером уже существует")
            table.number = new_number
            db.query(Order).filter(Order.table_num == old_number).update(
                {"table_num": new_number}, synchronize_session=False
            )

    if data.position_x is not None:
        table.position_x = data.position_x
    if data.position_y is not None:
        table.position_y = data.position_y

    db.commit()
    db.refresh(table)
    orders_by_table = get_open_orders_by_table(db)
    return build_table_response(table, orders_by_table.get(table.number, []))


@router.delete("/{table_id}")
def delete_table(
    table_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    table = db.query(BarTable).filter(BarTable.id == table_id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Стол не найден")

    open_orders = (
        db.query(Order)
        .filter(Order.table_num == table.number, Order.status == "open")
        .count()
    )
    if open_orders:
        raise HTTPException(status_code=400, detail="На столе есть открытые заказы")

    db.delete(table)
    db.commit()
    return {"message": "Стол удалён"}
