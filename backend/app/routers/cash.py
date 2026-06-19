from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.cash import CashSession
from app.models.order import Order
from app.routers.auth import get_current_user, User
from app.schemas.cash import CashOpen, CashClose, CashStatusResponse

router = APIRouter(prefix="/api/cash", tags=["cash"])


@router.get("/status", response_model=CashStatusResponse)
def cash_status(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    session = (
        db.query(CashSession)
        .filter(CashSession.status == "open")
        .first()
    )
    if not session:
        return CashStatusResponse(
            is_open=False,
            session_id=None,
            opened_at=None,
            opening_balance=0,
            cash_total=0,
            card_total=0,
            total_revenue=0,
            orders_count=0,
        )

    orders_count = (
        db.query(Order)
        .filter(Order.cash_session_id == session.id, Order.status == "paid")
        .count()
    )

    return CashStatusResponse(
        is_open=True,
        session_id=session.id,
        opened_at=session.opened_at,
        opening_balance=session.opening_balance,
        cash_total=session.cash_total,
        card_total=session.card_total,
        total_revenue=session.total_revenue,
        orders_count=orders_count,
    )


@router.post("/open", response_model=CashStatusResponse)
def open_cash(
    data: CashOpen,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    existing = (
        db.query(CashSession)
        .filter(CashSession.status == "open")
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Касса уже открыта")

    session = CashSession(
        opening_balance=data.balance,
        status="open",
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return CashStatusResponse(
        is_open=True,
        session_id=session.id,
        opened_at=session.opened_at,
        opening_balance=session.opening_balance,
        cash_total=0,
        card_total=0,
        total_revenue=0,
        orders_count=0,
    )


@router.post("/close", response_model=CashStatusResponse)
def close_cash(
    data: CashClose,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    session = (
        db.query(CashSession)
        .filter(CashSession.status == "open")
        .first()
    )
    if not session:
        raise HTTPException(status_code=400, detail="Касса не открыта")

    open_orders = (
        db.query(Order)
        .filter(Order.status == "open")
        .count()
    )
    if open_orders > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Нельзя закрыть кассу: {open_orders} открытых заказов",
        )

    session.status = "closed"
    session.closed_at = datetime.utcnow()
    session.closing_balance = data.cash_amount + data.card_amount
    session.cash_total = data.cash_amount
    session.card_total = data.card_amount
    db.commit()

    return CashStatusResponse(
        is_open=False,
        session_id=session.id,
        opened_at=session.opened_at,
        opening_balance=session.opening_balance,
        cash_total=session.cash_total,
        card_total=session.card_total,
        total_revenue=session.total_revenue,
        orders_count=0,
    )
