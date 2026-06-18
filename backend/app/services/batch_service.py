from sqlalchemy.orm import Session

from app.models.product import ProductBatch
from app.models.order import BatchMovement, OrderItem, OrderItemBatch


class InsufficientStockError(Exception):
    def __init__(self, product_name: str, required: float, available: float):
        self.product_name = product_name
        self.required = required
        self.available = available
        super().__init__(
            f"Недостаточно товара '{product_name}': нужно {required}, доступно {available}"
        )


def get_product_stock(db: Session, product_id: int) -> float:
    batches = (
        db.query(ProductBatch)
        .filter(
            ProductBatch.product_id == product_id,
            ProductBatch.is_active == True,  # noqa: E712
            ProductBatch.remaining_quantity > 0,
        )
        .all()
    )
    return sum(b.remaining_quantity for b in batches)


def deduct_from_batches(
    db: Session, product_id: int, quantity: float, order_item: OrderItem
) -> float:
    """Deduct quantity from batches using FIFO. Returns total cost."""
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

    available = sum(b.remaining_quantity for b in batches)
    if available < quantity:
        from app.models.product import Product

        product = db.query(Product).filter(Product.id == product_id).first()
        name = product.name if product else str(product_id)
        raise InsufficientStockError(name, quantity, available)

    remaining = quantity
    total_cost = 0.0

    for batch in batches:
        if remaining <= 0:
            break
        deduct = min(batch.remaining_quantity, remaining)
        batch.remaining_quantity -= deduct
        if batch.remaining_quantity <= 0:
            batch.is_active = False
        remaining -= deduct
        total_cost += deduct * batch.purchase_price

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

    return total_cost


def return_to_batches(db: Session, order_item: OrderItem) -> None:
    """Return stock from order item allocations back to batches."""
    for allocation in order_item.batch_allocations:
        batch = allocation.batch
        batch.remaining_quantity += allocation.quantity
        if batch.remaining_quantity > 0:
            batch.is_active = True

        movement = BatchMovement(
            batch_id=batch.id,
            order_item_id=order_item.id,
            quantity=allocation.quantity,
            movement_type="return",
        )
        db.add(movement)
