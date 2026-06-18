from sqlalchemy.orm import Session

from app.models.product import Product, KitComponent
from app.services.batch_service import get_product_stock, InsufficientStockError


def calculate_kit_price(db: Session, kit: Product) -> float:
    if kit.kit_price_type == "manual":
        return kit.retail_price

    total = 0.0
    for comp in kit.kit_components:
        component = comp.component
        price = comp.price_override if comp.price_override is not None else component.retail_price
        total += price * comp.quantity
    return total


def expand_kit_components(
    db: Session, kit: Product, quantity: float
) -> list[dict]:
    """Expand kit into component requirements."""
    components = (
        db.query(KitComponent)
        .filter(KitComponent.kit_id == kit.id)
        .all()
    )
    result = []
    for comp in components:
        needed = comp.quantity * quantity
        available = get_product_stock(db, comp.component_id)
        if available < needed:
            raise InsufficientStockError(
                comp.component.name, needed, available
            )
        result.append({
            "component": comp.component,
            "kit_component": comp,
            "quantity": needed,
        })
    return result


def check_simple_product_stock(db: Session, product: Product, quantity: float) -> None:
    if product.is_kit:
        expand_kit_components(db, product, quantity)
    else:
        available = get_product_stock(db, product.id)
        if available < quantity:
            raise InsufficientStockError(product.name, quantity, available)
