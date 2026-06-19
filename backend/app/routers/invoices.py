from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.invoice import Invoice, InvoiceItem
from app.models.product import Product, ProductBatch
from app.routers.auth import get_current_user, User
from app.schemas.invoice import (
    InvoiceCreate,
    InvoiceResponse,
    InvoiceItemResponse,
    InvoiceUpdate,
)
from app.services.batch_service import close_batch_if_empty, offset_debt_with_batch

router = APIRouter(prefix="/api/invoices", tags=["invoices"])


def build_invoice_response(invoice: Invoice) -> InvoiceResponse:
    items = [
        InvoiceItemResponse(
            id=item.id,
            product_id=item.product_id,
            product_name=item.product.name,
            quantity=item.quantity,
            purchase_price=item.purchase_price,
            total=item.total,
        )
        for item in invoice.items
    ]
    return InvoiceResponse(
        id=invoice.id,
        supplier=invoice.supplier,
        date=invoice.date,
        invoice_number=invoice.invoice_number,
        total_amount=invoice.total_amount,
        comment=invoice.comment,
        created_at=invoice.created_at,
        items=items,
    )


def get_batch_for_item(
    db: Session, invoice_id: int, item: InvoiceItem
) -> ProductBatch | None:
    batch = (
        db.query(ProductBatch)
        .filter(ProductBatch.invoice_item_id == item.id)
        .first()
    )
    if batch:
        return batch

    batches = (
        db.query(ProductBatch)
        .filter(
            ProductBatch.invoice_id == invoice_id,
            ProductBatch.product_id == item.product_id,
            ProductBatch.invoice_item_id.is_(None),
        )
        .all()
    )
    if len(batches) == 1:
        batches[0].invoice_item_id = item.id
        return batches[0]
    return None


def sold_from_batch(batch: ProductBatch) -> float:
    return batch.quantity - batch.remaining_quantity


@router.get("", response_model=list[InvoiceResponse])
def list_invoices(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    invoices = (
        db.query(Invoice)
        .options(joinedload(Invoice.items).joinedload(InvoiceItem.product))
        .order_by(Invoice.date.desc(), Invoice.id.desc())
        .all()
    )
    return [build_invoice_response(inv) for inv in invoices]


@router.post("", response_model=InvoiceResponse, status_code=201)
def create_invoice(
    data: InvoiceCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    total_amount = 0.0
    invoice = Invoice(
        supplier=data.supplier,
        date=data.date,
        invoice_number=data.invoice_number,
        comment=data.comment,
        total_amount=0.0,
    )
    db.add(invoice)
    db.flush()

    for item_data in data.items:
        product = db.query(Product).filter(Product.id == item_data.product_id).first()
        if not product:
            raise HTTPException(status_code=400, detail=f"Товар {item_data.product_id} не найден")
        if product.is_kit:
            raise HTTPException(
                status_code=400,
                detail=f"Нельзя приходовать комплект '{product.name}'",
            )

        item_total = item_data.quantity * item_data.purchase_price
        total_amount += item_total

        invoice_item = InvoiceItem(
            invoice_id=invoice.id,
            product_id=item_data.product_id,
            quantity=item_data.quantity,
            purchase_price=item_data.purchase_price,
            total=item_total,
        )
        db.add(invoice_item)
        db.flush()

        batch = ProductBatch(
            product_id=item_data.product_id,
            invoice_id=invoice.id,
            invoice_item_id=invoice_item.id,
            quantity=item_data.quantity,
            remaining_quantity=item_data.quantity,
            purchase_price=item_data.purchase_price,
            is_active=True,
        )
        db.add(batch)
        db.flush()
        offset_debt_with_batch(db, batch)

    invoice.total_amount = total_amount
    db.commit()

    invoice = (
        db.query(Invoice)
        .options(joinedload(Invoice.items).joinedload(InvoiceItem.product))
        .filter(Invoice.id == invoice.id)
        .first()
    )
    return build_invoice_response(invoice)


@router.get("/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    invoice = (
        db.query(Invoice)
        .options(joinedload(Invoice.items).joinedload(InvoiceItem.product))
        .filter(Invoice.id == invoice_id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Накладная не найдена")
    return build_invoice_response(invoice)


@router.put("/{invoice_id}", response_model=InvoiceResponse)
def update_invoice(
    invoice_id: int,
    data: InvoiceUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    invoice = (
        db.query(Invoice)
        .options(joinedload(Invoice.items).joinedload(InvoiceItem.product))
        .filter(Invoice.id == invoice_id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Накладная не найдена")

    if not data.items:
        raise HTTPException(status_code=400, detail="Добавьте позиции")

    existing_items = {item.id: item for item in invoice.items}
    incoming_ids = {item.id for item in data.items if item.id is not None}

    for item_id in set(existing_items) - incoming_ids:
        item = existing_items[item_id]
        batch = get_batch_for_item(db, invoice.id, item)
        if batch and sold_from_batch(batch) > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Нельзя удалить позицию «{item.product.name}»: товар уже списан",
            )
        if batch:
            db.delete(batch)
        db.delete(item)

    total_amount = 0.0

    for item_data in data.items:
        product = db.query(Product).filter(Product.id == item_data.product_id).first()
        if not product:
            raise HTTPException(status_code=400, detail=f"Товар {item_data.product_id} не найден")
        if product.is_kit:
            raise HTTPException(
                status_code=400,
                detail=f"Нельзя приходовать комплект '{product.name}'",
            )

        item_total = item_data.quantity * item_data.purchase_price
        total_amount += item_total

        if item_data.id and item_data.id in existing_items:
            item = existing_items[item_data.id]
            batch = get_batch_for_item(db, invoice.id, item)

            if batch:
                sold = sold_from_batch(batch)
                if item_data.product_id != item.product_id and sold > 0:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Нельзя сменить товар в позиции «{item.product.name}»: остаток уже списан",
                    )
                if item_data.quantity < sold:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Количество «{product.name}» не может быть меньше "
                            f"уже списанного ({sold})"
                        ),
                    )
                batch.product_id = item_data.product_id
                batch.quantity = item_data.quantity
                batch.remaining_quantity = item_data.quantity - sold
                batch.purchase_price = item_data.purchase_price
                close_batch_if_empty(batch)

            item.product_id = item_data.product_id
            item.quantity = item_data.quantity
            item.purchase_price = item_data.purchase_price
            item.total = item_total
        else:
            invoice_item = InvoiceItem(
                invoice_id=invoice.id,
                product_id=item_data.product_id,
                quantity=item_data.quantity,
                purchase_price=item_data.purchase_price,
                total=item_total,
            )
            db.add(invoice_item)
            db.flush()

            batch = ProductBatch(
                product_id=item_data.product_id,
                invoice_id=invoice.id,
                invoice_item_id=invoice_item.id,
                quantity=item_data.quantity,
                remaining_quantity=item_data.quantity,
                purchase_price=item_data.purchase_price,
                is_active=True,
            )
            db.add(batch)
            db.flush()
            offset_debt_with_batch(db, batch)

    invoice.supplier = data.supplier
    invoice.date = data.date
    invoice.invoice_number = data.invoice_number
    invoice.comment = data.comment
    invoice.total_amount = total_amount
    db.commit()

    invoice = (
        db.query(Invoice)
        .options(joinedload(Invoice.items).joinedload(InvoiceItem.product))
        .filter(Invoice.id == invoice.id)
        .first()
    )
    return build_invoice_response(invoice)
