from sqlalchemy.orm import Session, joinedload

from app.models.product import Product, KitComponent


def load_product_with_components(db: Session, product_id: int) -> Product | None:
    return (
        db.query(Product)
        .options(joinedload(Product.kit_components).joinedload(KitComponent.component))
        .filter(Product.id == product_id)
        .first()
    )


def get_component_unit_price(kc: KitComponent, component: Product) -> float:
    return kc.price_override if kc.price_override is not None else component.retail_price


def get_component_price_per_kit(kc: KitComponent, component: Product) -> float:
    return get_component_unit_price(kc, component) * kc.quantity


def sync_kit_component_pricing(
    item: "OrderItem", kc: KitComponent, component: Product
) -> None:
    """Set price/total on kit component order line (price per kit, total proportional)."""
    unit_price = get_component_unit_price(kc, component)
    item.price = unit_price * kc.quantity
    item.total = unit_price * item.quantity


def calculate_kit_price(db: Session, kit: Product) -> float:
    if kit.kit_price_type == "manual":
        return kit.retail_price

    total = 0.0
    for comp in kit.kit_components:
        total += get_component_price_per_kit(comp, comp.component)
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
            "unit_price": get_component_unit_price(comp, comp.component),
            "price_per_kit": get_component_price_per_kit(comp, comp.component),
            "line_total": get_component_unit_price(comp, comp.component) * needed,
        })
    return result
