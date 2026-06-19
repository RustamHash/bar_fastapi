from sqlalchemy.orm import Session

from app.models.product import ProductBatch
from app.models.order import BatchMovement, OrderItem, OrderItemBatch


def get_last_purchase_price(db: Session, product_id: int) -> float:
    batch = (
        db.query(ProductBatch)
        .filter(ProductBatch.product_id == product_id)
        .order_by(ProductBatch.created_at.desc())
        .first()
    )
    return batch.purchase_price if batch else 0.0


def close_batch_if_empty(batch: ProductBatch) -> None:
    if batch.remaining_quantity == 0:
        batch.is_active = False


def get_product_stock(db: Session, product_id: int) -> float:
    batches = (
        db.query(ProductBatch)
        .filter(
            ProductBatch.product_id == product_id,
            ProductBatch.is_active == True,  # noqa: E712
        )
        .all()
    )
    return sum(b.remaining_quantity for b in batches)


def get_or_create_debt_batch(
    db: Session, product_id: int, purchase_price: float
) -> ProductBatch:
    debt = (
        db.query(ProductBatch)
        .filter(
            ProductBatch.product_id == product_id,
            ProductBatch.is_active == True,  # noqa: E712
            ProductBatch.remaining_quantity < 0,
        )
        .first()
    )
    if debt:
        return debt

    batch = ProductBatch(
        product_id=product_id,
        invoice_id=None,
        quantity=0,
        remaining_quantity=0,
        purchase_price=purchase_price,
        is_active=True,
    )
    db.add(batch)
    db.flush()
    return batch


def _record_deduction(
    db: Session,
    batch: ProductBatch,
    order_item: OrderItem,
    deduct: float,
) -> None:
    allocation = OrderItemBatch(
        order_item_id=order_item.id,
        batch_id=batch.id,
        quantity=deduct,
    )
    db.add(allocation)

    movement = BatchMovement(
        batch_id=batch.id,
        order_item_id=order_item.id,
        quantity=-deduct,
        movement_type="sale",
    )
    db.add(movement)


def deduct_from_batches(
    db: Session, product_id: int, quantity: float, order_item: OrderItem
) -> float:
    """Deduct quantity from batches using FIFO. Allows negative stock (debt batch)."""
    batches = (
        db.query(ProductBatch)
        .filter(
            ProductBatch.product_id == product_id,
            ProductBatch.is_active == True,  # noqa: E712
            ProductBatch.remaining_quantity > 0,
        )
        .order_by(ProductBatch.created_at.asc())
        .all()
    )

    remaining = quantity
    total_cost = 0.0

    for batch in batches:
        if remaining <= 0:
            break
        deduct = min(batch.remaining_quantity, remaining)
        batch.remaining_quantity -= deduct
        close_batch_if_empty(batch)
        remaining -= deduct
        total_cost += deduct * batch.purchase_price
        _record_deduction(db, batch, order_item, deduct)

    if remaining > 0:
        last_price = get_last_purchase_price(db, product_id)
        debt_batch = get_or_create_debt_batch(db, product_id, last_price)
        debt_batch.remaining_quantity -= remaining
        close_batch_if_empty(debt_batch)
        total_cost += remaining * last_price
        _record_deduction(db, debt_batch, order_item, remaining)

    return total_cost


def offset_debt_with_batch(db: Session, batch: ProductBatch) -> None:
    """Apply incoming stock to cover product debt (negative batches)."""
    if batch.remaining_quantity <= 0:
        return

    debt = (
        db.query(ProductBatch)
        .filter(
            ProductBatch.product_id == batch.product_id,
            ProductBatch.is_active == True,  # noqa: E712
            ProductBatch.remaining_quantity < 0,
            ProductBatch.id != batch.id,
        )
        .first()
    )
    if not debt:
        return

    deficit = abs(debt.remaining_quantity)
    offset = min(batch.remaining_quantity, deficit)
    debt.remaining_quantity += offset
    close_batch_if_empty(debt)
    batch.remaining_quantity -= offset
    close_batch_if_empty(batch)


def return_to_batches(db: Session, order_item: OrderItem) -> None:
    """Return stock from order item allocations back to batches."""
    for allocation in order_item.batch_allocations:
        batch = allocation.batch
        batch.remaining_quantity += allocation.quantity
        if batch.remaining_quantity == 0:
            batch.is_active = False
        else:
            batch.is_active = True

        movement = BatchMovement(
            batch_id=batch.id,
            order_item_id=order_item.id,
            quantity=allocation.quantity,
            movement_type="return",
        )
        db.add(movement)
