from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.cash import CashSession
from app.models.order import Order, OrderItem, BatchMovement
from app.models.product import Product, KitComponent
from app.routers.auth import get_current_user, User
from app.schemas.order import (
    OrderCreate, OrderResponse, OrderItemResponse, OrderListResponse,
    OrderScanRequest, OrderScanResponse, OrderScanStatusResponse, OrderScanStatusItem,
    OrderItemAdd, OrderItemQuantityUpdate, OrderCancelRequest,
)
from app.services.batch_service import deduct_from_batches, return_to_batches
from app.services.kit_service import (
    calculate_kit_price,
    expand_kit_components,
    load_product_with_components,
    get_component_unit_price,
    sync_kit_component_pricing,
)
from app.services.barcode_service import normalize_barcode, find_product_by_barcode

router = APIRouter(prefix="/api/orders", tags=["orders"])


def get_open_cash_session(db: Session, *, for_payment: bool = False) -> CashSession:
    session = (
        db.query(CashSession)
        .filter(CashSession.status == "open")
        .first()
    )
    if not session:
        detail = (
            "Откройте кассовую смену для оплаты"
            if for_payment
            else "Касса не открыта. Откройте смену."
        )
        raise HTTPException(status_code=400, detail=detail)
    return session


def build_order_item_response(item: OrderItem, db: Session) -> OrderItemResponse:
    kit_name = None
    show_in_order = True
    kit_component_qty = None
    kit_order_quantity = None
    unit_price = None
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
                kit_component_qty = kc.quantity
                unit_price = get_component_unit_price(kc, item.product)
            if item.parent_kit_item_id:
                parent = db.query(OrderItem).filter(OrderItem.id == item.parent_kit_item_id).first()
                if parent:
                    kit_order_quantity = parent.quantity

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
        kit_component_qty=kit_component_qty,
        kit_order_quantity=kit_order_quantity,
        unit_price=unit_price,
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
        comment=order.comment,
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
                price=exp["price_per_kit"],
                total=exp["line_total"],
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


def get_kit_child_item(order: Order, parent_item_id: int, component_id: int) -> OrderItem | None:
    return next(
        (
            i for i in order.items
            if i.parent_kit_item_id == parent_item_id and i.product_id == component_id
        ),
        None,
    )


def delete_kit_order_item(db: Session, order: Order, main_item: OrderItem) -> None:
    for child in [i for i in order.items if i.parent_kit_item_id == main_item.id]:
        return_to_batches(db, child)
        db.delete(child)
    db.delete(main_item)


def adjust_kit_order_item_quantity(
    db: Session,
    order: Order,
    main_item: OrderItem,
    new_quantity: float,
) -> None:
    kit = load_product_with_components(db, main_item.product_id)
    if not kit:
        raise HTTPException(status_code=400, detail="Комплект не найден")

    if new_quantity <= 0:
        delete_kit_order_item(db, order, main_item)
        return

    old_qty = main_item.quantity
    if new_quantity == old_qty:
        return

    kit_price = calculate_kit_price(db, kit)

    if new_quantity > old_qty:
        diff = new_quantity - old_qty
        expanded = expand_kit_components(db, kit, diff)
        for exp in expanded:
            comp = exp["component"]
            kc = exp["kit_component"]
            comp_qty = exp["quantity"]
            child = get_kit_child_item(order, main_item.id, comp.id)
            if child:
                comp_cost = deduct_from_batches(db, comp.id, comp_qty, child)
                child.quantity += comp_qty
                child.cost_price += comp_cost
                sync_kit_component_pricing(child, kc, comp)
            else:
                child = OrderItem(
                    order_id=order.id,
                    product_id=comp.id,
                    quantity=comp_qty,
                    price=exp["price_per_kit"],
                    total=exp["line_total"],
                    cost_price=0.0,
                    is_kit_component=True,
                    parent_kit_item_id=main_item.id,
                    kit_id=kit.id,
                    show_in_receipt=kc.show_in_receipt,
                )
                db.add(child)
                db.flush()
                comp_cost = deduct_from_batches(db, comp.id, comp_qty, child)
                child.cost_price = comp_cost
            main_item.cost_price += comp_cost
    else:
        diff = old_qty - new_quantity
        expanded = expand_kit_components(db, kit, diff)
        for exp in expanded:
            comp_qty = exp["quantity"]
            kc = exp["kit_component"]
            comp = exp["component"]
            child = get_kit_child_item(order, main_item.id, comp.id)
            if not child:
                continue
            cost_returned = return_quantity_from_item(db, child, comp_qty)
            child.quantity -= comp_qty
            child.cost_price = max(0, child.cost_price - cost_returned)
            if child.quantity <= 0:
                db.delete(child)
            else:
                sync_kit_component_pricing(child, kc, comp)
            main_item.cost_price = max(0, main_item.cost_price - cost_returned)

    main_item.quantity = new_quantity
    main_item.price = kit_price
    main_item.total = kit_price * new_quantity


def recalculate_order_totals(order: Order) -> None:
    main_items = [i for i in order.items if not i.is_kit_component]
    order.subtotal = sum(i.total for i in main_items)
    order.total = order.subtotal - order.discount
    order.total_cost = sum(i.cost_price for i in order.items)


def return_quantity_from_item(db: Session, item: OrderItem, return_qty: float) -> float:
    """Return stock LIFO from order item allocations. Returns cost returned."""
    from app.models.order import OrderItemBatch

    if return_qty <= 0:
        return 0.0

    allocations = sorted(item.batch_allocations, key=lambda a: a.id, reverse=True)
    remaining = return_qty
    cost_returned = 0.0

    for alloc in list(allocations):
        if remaining <= 0:
            break
        ret = min(alloc.quantity, remaining)
        batch = alloc.batch
        batch.remaining_quantity += ret
        if batch.remaining_quantity == 0:
            batch.is_active = False
        else:
            batch.is_active = True
        cost_returned += ret * batch.purchase_price

        movement = BatchMovement(
            batch_id=batch.id,
            order_item_id=item.id,
            quantity=ret,
            movement_type="return",
        )
        db.add(movement)

        alloc.quantity -= ret
        if alloc.quantity <= 0:
            db.delete(alloc)
        remaining -= ret

    return cost_returned


def add_product_to_order(
    db: Session,
    order: Order,
    product: Product,
    quantity: float,
) -> None:
    existing = (
        db.query(OrderItem)
        .filter(
            OrderItem.order_id == order.id,
            OrderItem.product_id == product.id,
            OrderItem.is_kit_component == False,  # noqa: E712
        )
        .first()
    )

    if existing and product.is_kit:
        adjust_kit_order_item_quantity(db, order, existing, existing.quantity + quantity)
    elif existing and not product.is_kit:
        additional_cost = deduct_from_batches(db, product.id, quantity, existing)
        existing.quantity += quantity
        existing.total = existing.price * existing.quantity
        existing.cost_price += additional_cost
    else:
        subtotal, total_cost = process_order_item(db, order, product, quantity)
        order.subtotal += subtotal
        order.total_cost += total_cost

    recalculate_order_totals(order)


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
    product = find_product_by_barcode(db, barcode)

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
    if data.items:
        for item_data in data.items:
            product = load_product_with_components(db, item_data.product_id)
            if not product or not product.is_active:
                raise HTTPException(status_code=400, detail=f"Товар {item_data.product_id} не найден")
            if not product.sellable:
                raise HTTPException(
                    status_code=400,
                    detail=f"Товар «{product.name}» недоступен для продажи",
                )

    order = Order(
        table_num=data.table_num.strip(),
        status="open",
        comment=data.comment,
    )
    db.add(order)
    db.flush()

    subtotal = 0.0
    total_cost = 0.0

    for item_data in data.items:
        product = load_product_with_components(db, item_data.product_id)
        s, c = process_order_item(db, order, product, item_data.quantity)
        subtotal += s
        total_cost += c

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


@router.post("/{order_id}/items", response_model=OrderResponse)
def add_order_item(
    order_id: int,
    data: OrderItemAdd,
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
        raise HTTPException(status_code=400, detail="Заказ уже закрыт")

    product = load_product_with_components(db, data.product_id)
    if not product or not product.is_active:
        raise HTTPException(status_code=400, detail="Товар не найден")
    if not product.sellable:
        raise HTTPException(status_code=400, detail="Товар недоступен для продажи")

    add_product_to_order(db, order, product, data.quantity)
    db.commit()

    order = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id == order.id)
        .first()
    )
    return build_order_response(order, db)


@router.patch("/{order_id}/items/{item_id}", response_model=OrderResponse)
def update_order_item_quantity(
    order_id: int,
    item_id: int,
    data: OrderItemQuantityUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    from app.models.order import OrderItemBatch

    order = (
        db.query(Order)
        .options(
            joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Order.items).joinedload(OrderItem.batch_allocations).joinedload(OrderItemBatch.batch),
        )
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    if order.status != "open":
        raise HTTPException(status_code=400, detail="Заказ уже закрыт")

    item = next((i for i in order.items if i.id == item_id and not i.is_kit_component), None)
    if not item:
        raise HTTPException(status_code=404, detail="Позиция не найдена")
    if item.product.is_kit:
        adjust_kit_order_item_quantity(db, order, item, data.quantity)
        recalculate_order_totals(order)
        db.commit()
        order = (
            db.query(Order)
            .options(joinedload(Order.items).joinedload(OrderItem.product))
            .filter(Order.id == order.id)
            .first()
        )
        return build_order_response(order, db)

    if data.quantity <= 0:
        return_to_batches(db, item)
        db.delete(item)
    elif data.quantity > item.quantity:
        diff = data.quantity - item.quantity
        additional_cost = deduct_from_batches(db, item.product_id, diff, item)
        item.quantity = data.quantity
        item.total = item.price * item.quantity
        item.cost_price += additional_cost
    elif data.quantity < item.quantity:
        diff = item.quantity - data.quantity
        cost_returned = return_quantity_from_item(db, item, diff)
        item.quantity = data.quantity
        item.total = item.price * item.quantity
        item.cost_price = max(0, item.cost_price - cost_returned)

    recalculate_order_totals(order)
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
                comment=order.comment,
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

    cash_session = get_open_cash_session(db, for_payment=True)

    order.status = "paid"
    order.paid_at = datetime.utcnow()
    order.cash_session_id = cash_session.id
    cash_session.total_revenue += order.total
    cash_session.cash_total += order.total

    db.commit()
    return build_order_response(order, db)


@router.post("/{order_id}/cancel", response_model=OrderResponse)
def cancel_order(
    order_id: int,
    data: OrderCancelRequest,
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
    if order.status != "open":
        raise HTTPException(status_code=400, detail="Отменить можно только открытый заказ")

    comment = data.comment.strip()
    if not comment:
        raise HTTPException(status_code=400, detail="Укажите причину отмены")

    for item in order.items:
        if item.batch_allocations:
            return_to_batches(db, item)

    if order.status == "paid" and order.cash_session_id:
        session = db.query(CashSession).filter(CashSession.id == order.cash_session_id).first()
        if session:
            session.total_revenue -= order.total
            session.cash_total -= order.total

    order.status = "cancelled"
    if order.comment:
        order.comment = f"{order.comment} | Отмена: {comment}"
    else:
        order.comment = f"Отмена: {comment}"
    db.commit()

    order = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id == order.id)
        .first()
    )
    return build_order_response(order, db)
