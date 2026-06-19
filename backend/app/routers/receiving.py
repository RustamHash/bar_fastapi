from datetime import datetime, date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.invoice import Invoice, InvoiceItem
from app.models.product import Product, ProductBatch
from app.models.receiving import ReceivingSession, ReceivingSessionItem
from app.routers.auth import get_current_user, User
from app.schemas.receiving import (
    ReceivingSessionCreate,
    ReceivingSessionCreateResponse,
    ReceivingSessionListItem,
    ReceivingSessionDetail,
    ReceivingSessionItemResponse,
    ReceivingScanRequest,
    ReceivingScanResponse,
    ReceivingAddItemRequest,
    ReceivingUpdateItemRequest,
    ReceivingLinkItemRequest,
    ReceivingConfirmResponse,
)
from app.services.barcode_service import (
    normalize_barcode,
    find_product_by_barcode,
    get_primary_barcode,
)
from app.services.batch_service import get_product_stock

router = APIRouter(prefix="/api/receiving", tags=["receiving"])


def update_item_status(item: ReceivingSessionItem) -> None:
    if item.status == "unknown":
        if item.scanned_quantity > 0:
            return
    if item.expected_quantity <= 0:
        if item.scanned_quantity > 0:
            item.status = "unknown" if not item.product_id else "complete"
        return
    if item.scanned_quantity > item.expected_quantity:
        item.status = "over"
    elif item.scanned_quantity == item.expected_quantity:
        item.status = "complete"
    elif item.scanned_quantity > 0:
        item.status = "partial"
    else:
        item.status = "pending"


def calc_session_progress(session: ReceivingSession) -> float:
    if not session.items:
        return 0.0
    complete = sum(1 for i in session.items if i.status == "complete")
    return round(complete / len(session.items) * 100, 1)


def update_session_counts(session: ReceivingSession) -> None:
    session.expected_items_count = len(session.items)
    session.scanned_items_count = sum(
        1 for i in session.items if i.scanned_quantity > 0
    )


def build_session_detail(session: ReceivingSession) -> ReceivingSessionDetail:
    return ReceivingSessionDetail(
        id=session.id,
        supplier=session.supplier,
        invoice_number=session.invoice_number,
        status=session.status,
        expected_items_count=session.expected_items_count,
        scanned_items_count=session.scanned_items_count,
        created_at=session.created_at,
        confirmed_at=session.confirmed_at,
        items=[
            ReceivingSessionItemResponse.model_validate(i) for i in session.items
        ],
    )


@router.post("/sessions", response_model=ReceivingSessionCreateResponse, status_code=201)
def create_session(
    data: ReceivingSessionCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    session = ReceivingSession(
        supplier=data.supplier,
        invoice_number=data.invoice_number.strip() if data.invoice_number else None,
        status="scanning" if data.items else "draft",
    )
    db.add(session)
    db.flush()

    for item_data in data.items:
        product = None
        product_name = "Неизвестный товар"
        barcode = normalize_barcode(item_data.barcode) if item_data.barcode else ""

        if item_data.product_id:
            product = db.query(Product).filter(Product.id == item_data.product_id).first()
        if not product and barcode:
            product = find_product_by_barcode(db, barcode)

        if product:
            product_name = product.name
            if not barcode:
                barcode = ""

        status = "pending"
        if not product:
            status = "unknown"
            product_name = "Неизвестный товар"

        db.add(
            ReceivingSessionItem(
                session_id=session.id,
                product_id=product.id if product else None,
                barcode=barcode or "",
                product_name=product_name,
                expected_quantity=item_data.quantity,
                scanned_quantity=0,
                purchase_price=item_data.purchase_price,
                status=status,
            )
        )

    db.flush()
    session = (
        db.query(ReceivingSession)
        .options(joinedload(ReceivingSession.items))
        .filter(ReceivingSession.id == session.id)
        .first()
    )
    update_session_counts(session)
    db.commit()

    return ReceivingSessionCreateResponse(session_id=session.id, status=session.status)


@router.get("/sessions", response_model=list[ReceivingSessionListItem])
def list_sessions(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    sessions = (
        db.query(ReceivingSession)
        .order_by(ReceivingSession.created_at.desc())
        .all()
    )
    return sessions


@router.get("/sessions/{session_id}", response_model=ReceivingSessionDetail)
def get_session(
    session_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    session = (
        db.query(ReceivingSession)
        .options(joinedload(ReceivingSession.items))
        .filter(ReceivingSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    return build_session_detail(session)


@router.post("/scan", response_model=ReceivingScanResponse)
def scan_item(
    data: ReceivingScanRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    session = (
        db.query(ReceivingSession)
        .options(joinedload(ReceivingSession.items))
        .filter(ReceivingSession.id == data.session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    if session.status not in ("draft", "scanning"):
        raise HTTPException(status_code=400, detail="Сессия уже завершена или отменена")

    if session.status == "draft":
        session.status = "scanning"

    barcode = normalize_barcode(data.barcode)
    product = find_product_by_barcode(db, barcode)

    session_item = None
    for item in session.items:
        if item.barcode == barcode:
            session_item = item
            break
        if product and item.product_id == product.id:
            session_item = item
            break

    if session_item:
        session_item.scanned_quantity += 1
        if product and not session_item.product_id:
            session_item.product_id = product.id
            session_item.product_name = product.name
            session_item.status = "pending"
        update_item_status(session_item)
    elif product:
        session_item = ReceivingSessionItem(
            session_id=session.id,
            product_id=product.id,
            barcode=barcode,
            product_name=product.name,
            expected_quantity=0,
            scanned_quantity=1,
            purchase_price=None,
            status="over",
        )
        db.add(session_item)
        db.flush()
    else:
        session_item = ReceivingSessionItem(
            session_id=session.id,
            product_id=None,
            barcode=barcode,
            product_name="Неизвестный товар",
            expected_quantity=0,
            scanned_quantity=1,
            purchase_price=None,
            status="unknown",
        )
        db.add(session_item)
        db.flush()

    update_session_counts(session)
    db.commit()
    db.refresh(session_item)

    session = (
        db.query(ReceivingSession)
        .options(joinedload(ReceivingSession.items))
        .filter(ReceivingSession.id == session.id)
        .first()
    )

    return ReceivingScanResponse(
        barcode=barcode,
        product_name=session_item.product_name,
        product_id=session_item.product_id,
        expected_quantity=session_item.expected_quantity,
        scanned_quantity=session_item.scanned_quantity,
        status=session_item.status,
        session_progress=calc_session_progress(session),
    )


@router.post("/sessions/{session_id}/add-item", response_model=ReceivingSessionItemResponse)
def add_session_item(
    session_id: int,
    data: ReceivingAddItemRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    session = (
        db.query(ReceivingSession)
        .options(joinedload(ReceivingSession.items))
        .filter(ReceivingSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    if session.status not in ("draft", "scanning"):
        raise HTTPException(status_code=400, detail="Сессия уже завершена или отменена")

    product = db.query(Product).filter(Product.id == data.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")

    for item in session.items:
        if item.product_id == product.id:
            item.expected_quantity += data.quantity
            item.scanned_quantity += data.quantity
            if data.purchase_price is not None:
                item.purchase_price = data.purchase_price
            update_item_status(item)
            update_session_counts(session)
            db.commit()
            db.refresh(item)
            return ReceivingSessionItemResponse.model_validate(item)

    item = ReceivingSessionItem(
        session_id=session.id,
        product_id=product.id,
        barcode="",
        product_name=product.name,
        expected_quantity=data.quantity,
        scanned_quantity=data.quantity,
        purchase_price=data.purchase_price,
        status="pending",
    )
    db.add(item)
    db.flush()
    update_item_status(item)
    update_session_counts(session)
    db.commit()
    db.refresh(item)
    return ReceivingSessionItemResponse.model_validate(item)


@router.patch("/sessions/{session_id}/items/{item_id}", response_model=ReceivingSessionItemResponse)
def update_session_item(
    session_id: int,
    item_id: int,
    data: ReceivingUpdateItemRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    session = (
        db.query(ReceivingSession)
        .options(joinedload(ReceivingSession.items))
        .filter(ReceivingSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    if session.status not in ("draft", "scanning"):
        raise HTTPException(status_code=400, detail="Сессия уже завершена или отменена")

    item = next((i for i in session.items if i.id == item_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Позиция не найдена")

    if data.expected_quantity is not None:
        item.expected_quantity = data.expected_quantity
    if data.scanned_quantity is not None:
        item.scanned_quantity = data.scanned_quantity
    if data.purchase_price is not None:
        item.purchase_price = data.purchase_price

    update_item_status(item)
    update_session_counts(session)
    db.commit()
    db.refresh(item)
    return ReceivingSessionItemResponse.model_validate(item)


@router.delete("/sessions/{session_id}/items/{item_id}")
def delete_session_item(
    session_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    session = (
        db.query(ReceivingSession)
        .options(joinedload(ReceivingSession.items))
        .filter(ReceivingSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    if session.status not in ("draft", "scanning"):
        raise HTTPException(status_code=400, detail="Сессия уже завершена или отменена")

    item = next((i for i in session.items if i.id == item_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Позиция не найдена")

    db.delete(item)
    update_session_counts(session)
    db.commit()
    return {"message": "Позиция удалена"}


@router.post("/sessions/{session_id}/link-item", response_model=ReceivingSessionItemResponse)
def link_session_item(
    session_id: int,
    data: ReceivingLinkItemRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    session = (
        db.query(ReceivingSession)
        .filter(ReceivingSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")

    item = (
        db.query(ReceivingSessionItem)
        .filter(
            ReceivingSessionItem.id == data.item_id,
            ReceivingSessionItem.session_id == session_id,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Позиция не найдена")

    product = db.query(Product).filter(Product.id == data.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")

    item.product_id = product.id
    item.product_name = product.name
    if not item.barcode:
        item.barcode = get_primary_barcode(db, product.id) or ""
    update_item_status(item)
    db.commit()
    db.refresh(item)
    return ReceivingSessionItemResponse.model_validate(item)


@router.post("/sessions/{session_id}/confirm", response_model=ReceivingConfirmResponse)
def confirm_session(
    session_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    session = (
        db.query(ReceivingSession)
        .options(joinedload(ReceivingSession.items))
        .filter(ReceivingSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    if session.status == "confirmed":
        raise HTTPException(status_code=400, detail="Сессия уже подтверждена")
    if session.status == "cancelled":
        raise HTTPException(status_code=400, detail="Сессия отменена")

    scanned_items = [i for i in session.items if i.scanned_quantity > 0 and i.product_id]
    if not scanned_items:
        raise HTTPException(status_code=400, detail="Нет отсканированных товаров для приёмки")

    over_items = []
    under_items = []
    unknown_items = []

    for item in session.items:
        if item.status == "unknown":
            unknown_items.append(f"{item.barcode} ({item.scanned_quantity} шт)")
        elif item.product_id and item.scanned_quantity > item.expected_quantity:
            over_items.append(f"{item.product_name}: +{item.scanned_quantity - item.expected_quantity}")
        elif item.product_id and item.scanned_quantity < item.expected_quantity and item.expected_quantity > 0:
            under_items.append(f"{item.product_name}: -{item.expected_quantity - item.scanned_quantity}")

    comments = []
    if over_items:
        comments.append("Излишек: " + ", ".join(over_items))
    if under_items:
        comments.append("Недостача: " + ", ".join(under_items))
    if unknown_items:
        comments.append("Неопознанные товары: " + ", ".join(unknown_items))

    invoice = Invoice(
        supplier=session.supplier,
        date=date.today(),
        invoice_number=session.invoice_number,
        comment="\n".join(comments) if comments else None,
        total_amount=0.0,
    )
    db.add(invoice)
    db.flush()

    total_amount = 0.0
    created_batches = []

    for item in scanned_items:
        purchase_price = item.purchase_price or 0.0
        item_total = item.scanned_quantity * purchase_price
        total_amount += item_total

        db.add(
            InvoiceItem(
                invoice_id=invoice.id,
                product_id=item.product_id,
                quantity=item.scanned_quantity,
                purchase_price=purchase_price,
                total=item_total,
            )
        )
        batch = ProductBatch(
            product_id=item.product_id,
            invoice_id=invoice.id,
            quantity=item.scanned_quantity,
            remaining_quantity=item.scanned_quantity,
            purchase_price=purchase_price,
            is_active=True,
        )
        db.add(batch)
        db.flush()
        created_batches.append({
            "batch_id": batch.id,
            "product_id": item.product_id,
            "product_name": item.product_name,
            "quantity": item.scanned_quantity,
        })

    invoice.total_amount = total_amount
    session.status = "confirmed"
    session.confirmed_at = datetime.utcnow()
    db.commit()

    return ReceivingConfirmResponse(invoice_id=invoice.id, created_batches=created_batches)
