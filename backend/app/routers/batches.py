from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.product import ProductBatch
from app.models.order import BatchMovement
from app.routers.auth import get_current_user, User
from app.schemas.product import ProductBatchResponse

router = APIRouter(prefix="/api/batches", tags=["batches"])


@router.get("", response_model=list[ProductBatchResponse])
def list_batches(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    product_id: int | None = Query(None),
):
    query = db.query(ProductBatch)
    if product_id:
        query = query.filter(ProductBatch.product_id == product_id)
    batches = query.order_by(ProductBatch.created_at.desc()).all()
    return batches


@router.get("/{batch_id}/movements")
def batch_movements(
    batch_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    batch = db.query(ProductBatch).filter(ProductBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Партия не найдена")

    movements = (
        db.query(BatchMovement)
        .filter(BatchMovement.batch_id == batch_id)
        .order_by(BatchMovement.created_at.desc())
        .all()
    )

    return [
        {
            "id": m.id,
            "batch_id": m.batch_id,
            "order_item_id": m.order_item_id,
            "quantity": m.quantity,
            "movement_type": m.movement_type,
            "created_at": m.created_at.isoformat(),
        }
        for m in movements
    ]
