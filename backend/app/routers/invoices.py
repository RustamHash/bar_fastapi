from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.invoice import Invoice, InvoiceItem
from app.models.product import Product, ProductBatch
from app.routers.auth import get_current_user, User
from app.schemas.invoice import InvoiceCreate, InvoiceResponse, InvoiceItemResponse

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
        total_amount=invoice.total_amount,
        comment=invoice.comment,
        created_at=invoice.created_at,
        items=items,
    )


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

        batch = ProductBatch(
            product_id=item_data.product_id,
            invoice_id=invoice.id,
            quantity=item_data.quantity,
            remaining_quantity=item_data.quantity,
            purchase_price=item_data.purchase_price,
            is_active=True,
        )
        db.add(batch)

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
