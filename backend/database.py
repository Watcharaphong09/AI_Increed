"""
Database setup for AI_Increed backend.

Uses async SQLAlchemy with aiosqlite driver.
Provides:
  - async engine
  - async session factory
  - get_db  — FastAPI dependency
  - init_db — called at startup to create all tables
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from backend.config import settings

# ── Engine ────────────────────────────────────────────────────────────────────
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    connect_args={"check_same_thread": False},
)

# ── Session factory ───────────────────────────────────────────────────────────
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


# ── Declarative base ──────────────────────────────────────────────────────────
class Base(DeclarativeBase):
    """Base class for all SQLAlchemy ORM models."""
    pass


# ── FastAPI dependency ────────────────────────────────────────────────────────
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Provide a database session per request.

    Usage in route:
        async def endpoint(db: AsyncSession = Depends(get_db)): ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ── Startup helper ────────────────────────────────────────────────────────────
async def init_db() -> None:
    """
    Create all database tables on first startup.

    Import models here to ensure they are registered with Base metadata
    before `create_all` is called.
    """
    # Import models so SQLAlchemy registers them on Base.metadata
    from backend.models import project as _  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
