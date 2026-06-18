from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.cash import CashSession
from app.models.order import Order, OrderItem
from app.models.product import Product, KitComponent
from app.routers.auth import get_current_user, User
from app.schemas.order import (
    OrderCreate, OrderResponse, OrderItemResponse, OrderListResponse,
    OrderScanRequest, OrderScanResponse, OrderScanStatusResponse, OrderScanStatusItem,
)
from app.services.batch_service import deduct_from_batches, return_to_batches, InsufficientStockError
from app.services.kit_service import calculate_kit_price, expand_kit_components, check_simple_product_stock
from app.services.barcode_service import normalize_barcode

router = APIRouter(prefix="/api/orders", tags=["orders"])


def get_open_cash_session(db: Session) -> CashSession:
    session = (
        db.query(CashSession)
        .filter(CashSession.status == "open")
        .first()
    )
    if not session:
        raise HTTPException(status_code=400, detail="Касса не открыта. Откройте смену.")
    return session


def build_order_item_response(item: OrderItem, db: Session) -> OrderItemResponse:
    kit_name = None
    show_in_order = True
    if item.kit_id:
        kit = db.query(Product).filter(Product.id == item.kit_id).first()
        kit_name = kit.name if kit else None
        if item.is_kit_component:
            kc = (
                db.query(KitComponent)
                .filter(
                    KitComponent.kit_id == item.kit_id,
                    KitComponent.component_id == item.product_id,
                )
                .first()
            )
            if kc:
                show_in_order = kc.show_in_order

    return OrderItemResponse(
        id=item.id,
        product_id=item.product_id,
        product_name=item.product.name,
        quantity=item.quantity,
        price=item.price,
        total=item.total,
        cost_price=item.cost_price,
        is_kit_component=item.is_kit_component,
        parent_kit_item_id=item.parent_kit_item_id,
        kit_id=item.kit_id,
        kit_name=kit_name,
        show_in_receipt=item.show_in_receipt,
        show_in_order=show_in_order,
        unit=item.product.unit,
        scanned_quantity=item.scanned_quantity,
    )


def build_order_response(order: Order, db: Session) -> OrderResponse:
    items = [build_order_item_response(item, db) for item in order.items]
    return OrderResponse(
        id=order.id,
        table_num=order.table_num,
        status=order.status,
        subtotal=order.subtotal,
        discount=order.discount,
        total=order.total,
        total_cost=order.total_cost,
        cash_session_id=order.cash_session_id,
        all_scanned=order.all_scanned,
        created_at=order.created_at,
        paid_at=order.paid_at,
        items=items,
    )


def process_order_item(
    db: Session,
    order: Order,
    product: Product,
    quantity: float,
) -> tuple[float, float]:
    """Process a single order line. Returns (subtotal, total_cost)."""
    subtotal = 0.0
    total_cost = 0.0

    if product.is_kit:
        kit_price = calculate_kit_price(db, product)
        line_total = kit_price * quantity
        subtotal += line_total

        main_item = OrderItem(
            order_id=order.id,
            product_id=product.id,
            quantity=quantity,
            price=kit_price,
            total=line_total,
            cost_price=0.0,
            is_kit_component=False,
            show_in_receipt=True,
        )
        db.add(main_item)
        db.flush()

        expanded = expand_kit_components(db, product, quantity)
        item_cost = 0.0

        for exp in expanded:
            comp = exp["component"]
            kc = exp["kit_component"]
            comp_qty = exp["quantity"]

            comp_item = OrderItem(
                order_id=order.id,
                product_id=comp.id,
                quantity=comp_qty,
                price=0.0,
                total=0.0,
                cost_price=0.0,
                is_kit_component=True,
                parent_kit_item_id=main_item.id,
                kit_id=product.id,
                show_in_receipt=kc.show_in_receipt,
            )
            db.add(comp_item)
            db.flush()

            comp_cost = deduct_from_batches(db, comp.id, comp_qty, comp_item)
            comp_item.cost_price = comp_cost
            item_cost += comp_cost

        main_item.cost_price = item_cost
        total_cost += item_cost
    else:
        line_total = product.retail_price * quantity
        subtotal += line_total

        item = OrderItem(
            order_id=order.id,
            product_id=product.id,
            quantity=quantity,
            price=product.retail_price,
            total=line_total,
            cost_price=0.0,
            is_kit_component=False,
            show_in_receipt=True,
        )
        db.add(item)
        db.flush()

        item_cost = deduct_from_batches(db, product.id, quantity, item)
        item.cost_price = item_cost
        total_cost += item_cost

    return subtotal, total_cost


def get_scannable_items(order: Order, db: Session) -> list[OrderItem]:
    """Items that need scanning: simple products and kit components."""
    result = []
    for item in order.items:
        product = item.product
        if item.is_kit_component:
            result.append(item)
        elif not product.is_kit:
            result.append(item)
    return result


def check_order_all_scanned(order: Order, db: Session) -> bool:
    scannable = get_scannable_items(order, db)
    if not scannable:
        return False
    return all(item.scanned_quantity >= item.quantity for item in scannable)


@router.post("/scan", response_model=OrderScanResponse)
def scan_order_item(
    data: OrderScanRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    order = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id == data.order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    if order.status != "open":
        raise HTTPException(status_code=400, detail="Сканирование доступно только для открытых заказов")

    barcode = normalize_barcode(data.barcode)
    product = db.query(Product).filter(Product.barcode == barcode).first()

    if not product:
        return OrderScanResponse(
            product_name="Неизвестный товар",
            in_order=False,
            scanned=0,
            need=0,
            order_complete=order.all_scanned,
        )

    matching_items = [
        item for item in get_scannable_items(order, db)
        if item.product_id == product.id
    ]

    if not matching_items:
        return OrderScanResponse(
            product_name=product.name,
            in_order=False,
            scanned=0,
            need=0,
            order_complete=order.all_scanned,
        )

    target = min(matching_items, key=lambda i: i.scanned_quantity / i.quantity if i.quantity else 0)
    target.scanned_quantity += 1
    order.all_scanned = check_order_all_scanned(order, db)
    db.commit()

    need = max(0, target.quantity - target.scanned_quantity)
    return OrderScanResponse(
        product_name=product.name,
        in_order=True,
        scanned=target.scanned_quantity,
        need=need,
        order_complete=order.all_scanned,
    )


@router.get("/{order_id}/scan-status", response_model=OrderScanStatusResponse)
def get_scan_status(
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
    for item in get_scannable_items(order, db):
        items.append(
            OrderScanStatusItem(
                product_name=item.product.name,
                quantity=item.quantity,
                scanned_quantity=item.scanned_quantity,
                complete=item.scanned_quantity >= item.quantity,
            )
        )

    return OrderScanStatusResponse(
        order_id=order.id,
        all_scanned=order.all_scanned,
        items=items,
    )


@router.post("", response_model=OrderResponse, status_code=201)
def create_order(
    data: OrderCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    cash_session = get_open_cash_session(db)

    for item_data in data.items:
        product = db.query(Product).filter(Product.id == item_data.product_id).first()
        if not product or not product.is_active:
            raise HTTPException(status_code=400, detail=f"Товар {item_data.product_id} не найден")
        try:
            check_simple_product_stock(db, product, item_data.quantity)
        except InsufficientStockError as e:
            raise HTTPException(status_code=400, detail=str(e))

    order = Order(
        table_num=data.table_num,
        status="open",
        cash_session_id=cash_session.id,
    )
    db.add(order)
    db.flush()

    subtotal = 0.0
    total_cost = 0.0

    try:
        for item_data in data.items:
            product = db.query(Product).filter(Product.id == item_data.product_id).first()
            s, c = process_order_item(db, order, product, item_data.quantity)
            subtotal += s
            total_cost += c
    except InsufficientStockError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

    order.subtotal = subtotal
    order.discount = 0.0
    order.total = subtotal - order.discount
    order.total_cost = total_cost
    db.commit()

    order = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id == order.id)
        .first()
    )
    return build_order_response(order, db)


@router.get("", response_model=list[OrderListResponse])
def list_orders(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    status: str | None = Query(None),
):
    query = db.query(Order).options(joinedload(Order.items))
    if status:
        query = query.filter(Order.status == status)
    orders = query.order_by(Order.created_at.desc()).all()

    result = []
    for order in orders:
        main_items = [i for i in order.items if not i.is_kit_component]
        result.append(
            OrderListResponse(
                id=order.id,
                table_num=order.table_num,
                status=order.status,
                subtotal=order.subtotal,
                discount=order.discount,
                total=order.total,
                total_cost=order.total_cost,
                items_count=len(main_items),
                all_scanned=order.all_scanned,
                created_at=order.created_at,
                paid_at=order.paid_at,
            )
        )
    return result


@router.get("/{order_id}", response_model=OrderResponse)
def get_order(
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
    return build_order_response(order, db)


@router.post("/{order_id}/pay", response_model=OrderResponse)
def pay_order(
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
    if order.status != "open":
        raise HTTPException(status_code=400, detail="Заказ уже оплачен или отменён")

    order.status = "paid"
    order.paid_at = datetime.utcnow()

    if order.cash_session_id:
        session = db.query(CashSession).filter(CashSession.id == order.cash_session_id).first()
        if session:
            session.total_revenue += order.total
            session.cash_total += order.total

    db.commit()
    return build_order_response(order, db)


@router.post("/{order_id}/cancel", response_model=OrderResponse)
def cancel_order(
    order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    from app.models.order import OrderItemBatch

    order = (
        db.query(Order)
        .options(
            joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Order.items)
            .joinedload(OrderItem.batch_allocations)
            .joinedload(OrderItemBatch.batch),
        )
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    if order.status == "cancelled":
        raise HTTPException(status_code=400, detail="Заказ уже отменён")

    for item in order.items:
        if item.batch_allocations:
            return_to_batches(db, item)

    if order.status == "paid" and order.cash_session_id:
        session = db.query(CashSession).filter(CashSession.id == order.cash_session_id).first()
        if session:
            session.total_revenue -= order.total
            session.cash_total -= order.total

    order.status = "cancelled"
    db.commit()

    order = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id == order.id)
        .first()
    )
    return build_order_response(order, db)
