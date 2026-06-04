from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.funds import router as funds_router
from app.core.config import settings

app = FastAPI(title="Fund Real Time Valuation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(funds_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
