"""
AI_Increed — FastAPI application entry point.

Binds to 127.0.0.1:8000 (localhost only — local-first, single-user).
CORS allowed for localhost:3000 and localhost:5173.

Startup: initialises the SQLite database.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.config import settings
from backend.database import init_db
from backend.routers import projects, planner, tasks, settings as settings_router, handoff

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: initialise DB on startup."""
    logger.info("Starting %s v%s", settings.APP_NAME, settings.VERSION)
    await init_db()
    logger.info("Database initialised ✓")
    yield
    logger.info("Shutting down %s", settings.APP_NAME)


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description=(
        "Local-first AI Development Orchestrator backend. "
        "Manages projects, requirements, tasks, and AI provider configuration."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(projects.router)
app.include_router(planner.router)
app.include_router(tasks.router)
app.include_router(settings_router.router)
app.include_router(handoff.router)


# ── Root ──────────────────────────────────────────────────────────────────────
@app.get("/", tags=["health"])
async def root():
    """Health check / welcome endpoint."""
    return JSONResponse(
        content={
            "app": settings.APP_NAME,
            "version": settings.VERSION,
            "status": "running",
            "docs": "/docs",
        }
    )


@app.get("/health", tags=["health"])
async def health():
    """Health check endpoint."""
    return {"status": "ok", "version": settings.VERSION}


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run(
        "backend.main:app",
        host="127.0.0.1",     # localhost only — never 0.0.0.0
        port=8000,
        reload=settings.DEBUG,
        log_level="debug" if settings.DEBUG else "info",
    )
