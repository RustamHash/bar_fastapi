from datetime import datetime, date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, cast, Date
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.routers.auth import get_current_user, User

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/sales")
def sales_report(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    cash_session_id: int | None = Query(None),
):
    if not start_date:
        start_date = date.today() - timedelta(days=30)
    if not end_date:
        end_date = date.today()

    start_dt = datetime.combine(start_date, datetime.min.time())
    end_dt = datetime.combine(end_date, datetime.max.time())

    items = (
        db.query(OrderItem)
        .join(Order)
        .options(joinedload(OrderItem.product))
        .filter(
            Order.status == "paid",
            Order.paid_at.isnot(None),
            Order.paid_at >= start_dt,
            Order.paid_at <= end_dt,
            OrderItem.is_kit_component == False,  # noqa: E712
        )
    )
    if cash_session_id is not None:
        items = items.filter(Order.cash_session_id == cash_session_id)
    items = items.all()

    product_stats: dict[int, dict] = {}
    for item in items:
        pid = item.product_id
        if pid not in product_stats:
            product_stats[pid] = {
                "product_id": pid,
                "product_name": item.product.name,
                "quantity_sold": 0.0,
                "revenue": 0.0,
                "cost": 0.0,
            }
        product_stats[pid]["quantity_sold"] += item.quantity
        product_stats[pid]["revenue"] += item.total
        product_stats[pid]["cost"] += item.cost_price

    result = []
    for stats in product_stats.values():
        margin = stats["revenue"] - stats["cost"]
        margin_pct = (margin / stats["revenue"] * 100) if stats["revenue"] > 0 else 0
        result.append({
            **stats,
            "margin": round(margin, 2),
            "margin_percent": round(margin_pct, 2),
        })

    result.sort(key=lambda x: x["revenue"], reverse=True)
    return result


@router.get("/top-products")
def top_products(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    limit: int = Query(10),
    days: int = Query(30),
):
    start_dt = datetime.utcnow() - timedelta(days=days)

    query = (
        db.query(
            Product.id,
            Product.name,
            func.sum(OrderItem.quantity).label("quantity_sold"),
            func.sum(OrderItem.total).label("revenue"),
        )
        .join(OrderItem, OrderItem.product_id == Product.id)
        .join(Order, Order.id == OrderItem.order_id)
        .filter(
            Order.status == "paid",
            Order.paid_at.isnot(None),
            Order.paid_at >= start_dt,
            OrderItem.is_kit_component == False,  # noqa: E712
        )
    )
    rows = (
        query
        .group_by(Product.id, Product.name)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(limit)
        .all()
    )

    return [
        {
            "product_id": r.id,
            "product_name": r.name,
            "quantity_sold": float(r.quantity_sold or 0),
            "revenue": float(r.revenue or 0),
        }
        for r in rows
    ]


@router.get("/revenue-by-day")
def revenue_by_day(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    days: int = Query(30),
):
    start_dt = datetime.utcnow() - timedelta(days=days)

    rows = (
        db.query(
            cast(Order.paid_at, Date).label("day"),
            func.sum(Order.total).label("revenue"),
            func.count(Order.id).label("orders_count"),
        )
        .filter(
            Order.status == "paid",
            Order.paid_at.isnot(None),
            Order.paid_at >= start_dt,
        )
        .group_by(cast(Order.paid_at, Date))
        .order_by(cast(Order.paid_at, Date))
        .all()
    )

    return [
        {
            "date": str(r.day),
            "revenue": float(r.revenue or 0),
            "orders_count": r.orders_count,
        }
        for r in rows
    ]


@router.get("/dashboard")
def dashboard_stats(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    today_start = datetime.combine(date.today(), datetime.min.time())

    today_revenue = (
        db.query(func.coalesce(func.sum(Order.total), 0))
        .filter(Order.status == "paid", Order.paid_at.isnot(None), Order.paid_at >= today_start)
        .scalar()
    )

    open_orders = (
        db.query(func.count(Order.id))
        .filter(Order.status == "open")
        .scalar()
    )

    from app.models.cash import CashSession

    cash_session = (
        db.query(CashSession)
        .filter(CashSession.status == "open")
        .first()
    )

    from app.models.product import ProductBatch, Product

    products = db.query(Product).filter(Product.is_active == True, Product.is_kit == False).all()  # noqa: E712
    low_stock = []
    for p in products:
        stock = sum(
            b.remaining_quantity
            for b in p.batches
            if b.is_active and b.remaining_quantity > 0
        )
        if stock <= p.min_stock:
            low_stock.append({
                "id": p.id,
                "name": p.name,
                "category": p.category,
                "stock": stock,
                "min_stock": p.min_stock,
                "unit": p.unit,
            })

    return {
        "today_revenue": float(today_revenue or 0),
        "open_orders": open_orders,
        "cash_open": cash_session is not None,
        "cash_opened_at": cash_session.opened_at.isoformat() if cash_session else None,
        "low_stock": low_stock,
    }
