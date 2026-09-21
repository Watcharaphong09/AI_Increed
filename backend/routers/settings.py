"""
Settings router — AI provider configuration management.

Endpoints:
  GET  /api/settings      — get current settings (API keys masked)
  PUT  /api/settings      — update settings (persists to .env)
  POST /api/settings/test — test AI provider connectivity

⚠️  API keys are ALWAYS masked in GET responses.
    Keys are only written to .env, never logged or returned in full.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from backend.config import settings
from backend.services.ai_provider import ProviderFactory

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/settings", tags=["settings"])

# Path to the .env file (in backend/ directory)
_ENV_PATH = Path(__file__).parent.parent / ".env"


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class SettingsOut(BaseModel):
    """Settings response with masked API keys."""
    # Global
    ai_provider: str
    ai_base_url: str
    ai_api_key_masked: str
    ai_model: str

    # Planner
    planner_provider: str
    planner_base_url: str
    planner_api_key_masked: str
    planner_model: str

    # Reviewer
    reviewer_provider: str
    reviewer_base_url: str
    reviewer_api_key_masked: str
    reviewer_model: str

    # Ollama
    ollama_base_url: str


class SettingsUpdate(BaseModel):
    """Partial settings update. Omit fields to keep existing values."""
    # Global
    ai_provider: Optional[str] = None
    ai_base_url: Optional[str] = None
    ai_api_key: Optional[str] = None
    ai_model: Optional[str] = None

    # Planner
    planner_provider: Optional[str] = None
    planner_base_url: Optional[str] = None
    planner_api_key: Optional[str] = None
    planner_model: Optional[str] = None

    # Reviewer
    reviewer_provider: Optional[str] = None
    reviewer_base_url: Optional[str] = None
    reviewer_api_key: Optional[str] = None
    reviewer_model: Optional[str] = None

    # Ollama
    ollama_base_url: Optional[str] = None


class TestConnectionRequest(BaseModel):
    role: str = Field(default="planner", description="'planner', 'reviewer', or 'default'")


class TestConnectionResult(BaseModel):
    success: bool
    provider: str
    model: str
    latency_ms: Optional[float] = None
    error: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _mask_key(key: str) -> str:
    """Return a masked version of an API key for display."""
    if not key:
        return ""
    if len(key) <= 8:
        return "***"
    return f"{key[:4]}...{key[-4:]}"


def _read_env() -> dict[str, str]:
    """Read the .env file into a key→value dict."""
    env: dict[str, str] = {}
    if _ENV_PATH.exists():
        for line in _ENV_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def _write_env(env: dict[str, str]) -> None:
    """Write key→value dict back to .env file."""
    lines = []
    for key, value in env.items():
        # Quote values containing spaces
        if " " in value:
            value = f'"{value}"'
        lines.append(f"{key}={value}")
    _ENV_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=SettingsOut)
async def get_settings():
    """
    Return current AI provider settings.

    API keys are always masked — only first/last 4 chars are shown.
    """
    return SettingsOut(
        ai_provider=settings.AI_PROVIDER,
        ai_base_url=settings.AI_BASE_URL,
        ai_api_key_masked=_mask_key(settings.AI_API_KEY),
        ai_model=settings.AI_MODEL,
        planner_provider=settings.PLANNER_PROVIDER,
        planner_base_url=settings.PLANNER_BASE_URL,
        planner_api_key_masked=_mask_key(settings.PLANNER_API_KEY),
        planner_model=settings.PLANNER_MODEL,
        reviewer_provider=settings.REVIEWER_PROVIDER,
        reviewer_base_url=settings.REVIEWER_BASE_URL,
        reviewer_api_key_masked=_mask_key(settings.REVIEWER_API_KEY),
        reviewer_model=settings.REVIEWER_MODEL,
        ollama_base_url=settings.OLLAMA_BASE_URL,
    )


@router.put("", response_model=SettingsOut)
async def update_settings(payload: SettingsUpdate):
    """
    Update AI provider settings and persist to .env file.

    The running process settings are also updated in-memory so changes
    take effect immediately without restart.
    """
    env = _read_env()

    # Map payload fields → env key names (uppercase)
    field_to_env: dict[str, str] = {
        "ai_provider": "AI_PROVIDER",
        "ai_base_url": "AI_BASE_URL",
        "ai_api_key": "AI_API_KEY",
        "ai_model": "AI_MODEL",
        "planner_provider": "PLANNER_PROVIDER",
        "planner_base_url": "PLANNER_BASE_URL",
        "planner_api_key": "PLANNER_API_KEY",
        "planner_model": "PLANNER_MODEL",
        "reviewer_provider": "REVIEWER_PROVIDER",
        "reviewer_base_url": "REVIEWER_BASE_URL",
        "reviewer_api_key": "REVIEWER_API_KEY",
        "reviewer_model": "REVIEWER_MODEL",
        "ollama_base_url": "OLLAMA_BASE_URL",
    }

    update_data = payload.model_dump(exclude_none=True)
    for field_name, value in update_data.items():
        env_key = field_to_env.get(field_name, field_name.upper())
        env[env_key] = value
        # Also update the running settings object
        settings_attr = env_key  # e.g. AI_PROVIDER
        if hasattr(settings, settings_attr):
            object.__setattr__(settings, settings_attr, value)

    try:
        _write_env(env)
        logger.info("Settings updated and saved to %s", _ENV_PATH)
    except Exception as exc:
        logger.error("Failed to write .env: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not save settings: {exc}",
        )

    return await get_settings()


@router.post("/test", response_model=TestConnectionResult)
async def test_connection(payload: TestConnectionRequest):
    """
    Test connectivity to the configured AI provider.

    Sends a minimal 'hello' message and measures latency.
    """
    import time

    role = payload.role
    provider_name = settings.get_role_provider(role)
    model = settings.get_role_model(role)

    try:
        provider = ProviderFactory.get_provider(role)
        start = time.monotonic()
        response = await provider.chat(
            messages=[{"role": "user", "content": "Hello, respond with OK."}],
            system_prompt="You are a connection test. Respond with exactly: OK",
        )
        elapsed_ms = (time.monotonic() - start) * 1000

        if not response:
            return TestConnectionResult(
                success=False,
                provider=provider_name,
                model=model,
                error="Empty response received",
            )

        return TestConnectionResult(
            success=True,
            provider=provider_name,
            model=model,
            latency_ms=round(elapsed_ms, 1),
        )

    except Exception as exc:
        logger.error("Connection test failed for role=%s: %s", role, exc)
        return TestConnectionResult(
            success=False,
            provider=provider_name,
            model=model,
            error=str(exc),
        )
