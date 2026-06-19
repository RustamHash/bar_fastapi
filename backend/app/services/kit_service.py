from sqlalchemy.orm import Session, joinedload

from app.models.product import Product, KitComponent


def load_product_with_components(db: Session, product_id: int) -> Product | None:
    return (
        db.query(Product)
        .options(joinedload(Product.kit_components).joinedload(KitComponent.component))
        .filter(Product.id == product_id)
        .first()
    )


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
        .options(joinedload(KitComponent.component))
        .filter(KitComponent.kit_id == kit.id)
        .all()
    )
    result = []
    for comp in components:
        needed = comp.quantity * quantity
        result.append({
            "component": comp.component,
            "kit_component": comp,
            "quantity": needed,
        })
    return result
