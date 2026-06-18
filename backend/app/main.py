from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base, SessionLocal
from app.seed import seed_database
from app.routers import auth, products, invoices, orders, cash, receipt, reports, batches


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()
    yield


app = FastAPI(title="BeerPub API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(products.router)
app.include_router(invoices.router)
app.include_router(orders.router)
app.include_router(cash.router)
app.include_router(receipt.router)
app.include_router(reports.router)
app.include_router(batches.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
