"""
Configuration management for AI_Increed backend.

Loads settings from environment variables and .env file using pydantic-settings.
All AI provider settings are configurable per-role (planner, reviewer).
"""

from pathlib import Path
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment / .env file."""

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ──────────────────────────────────────────────────────────
    APP_NAME: str = "AI_Increed"
    VERSION: str = "0.1.0"
    DEBUG: bool = False

    # ── Database ─────────────────────────────────────────────────────────────
    DATABASE_URL: str = "sqlite+aiosqlite:///./ai_increed.db"

    # ── Workspace ─────────────────────────────────────────────────────────────
    WORKSPACE_DIR: str = "../workspace"

    # ── CORS ──────────────────────────────────────────────────────────────────
    CORS_ORIGINS: List[str] = Field(
        default=[
            "http://localhost:3000",
            "http://localhost:5173",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173",
        ]
    )

    # ── Global / Fallback AI Provider ─────────────────────────────────────────
    AI_PROVIDER: str = "openai"
    AI_BASE_URL: str = "https://api.openai.com/v1"
    AI_API_KEY: str = ""
    AI_MODEL: str = "gpt-4o-mini"

    # ── Planner Role ──────────────────────────────────────────────────────────
    PLANNER_PROVIDER: str = Field(default="")   # falls back to AI_PROVIDER if empty
    PLANNER_BASE_URL: str = Field(default="")   # falls back to AI_BASE_URL
    PLANNER_API_KEY: str = Field(default="")    # falls back to AI_API_KEY
    PLANNER_MODEL: str = Field(default="")      # falls back to AI_MODEL

    # ── Reviewer Role ─────────────────────────────────────────────────────────
    REVIEWER_PROVIDER: str = Field(default="")
    REVIEWER_BASE_URL: str = Field(default="")
    REVIEWER_API_KEY: str = Field(default="")
    REVIEWER_MODEL: str = Field(default="")

    # ── Ollama (local) ────────────────────────────────────────────────────────
    OLLAMA_BASE_URL: str = "http://localhost:11434/v1"

    # ── Helpers ───────────────────────────────────────────────────────────────
    def get_workspace_path(self) -> Path:
        """Return absolute path to the workspace directory."""
        return Path(self.WORKSPACE_DIR).resolve()

    def get_role_provider(self, role: str) -> str:
        """Return provider name for a role, falling back to global setting."""
        role_val = getattr(self, f"{role.upper()}_PROVIDER", "")
        return role_val if role_val else self.AI_PROVIDER

    def get_role_base_url(self, role: str) -> str:
        """Return base URL for a role, falling back to global setting."""
        role_val = getattr(self, f"{role.upper()}_BASE_URL", "")
        return role_val if role_val else self.AI_BASE_URL

    def get_role_api_key(self, role: str) -> str:
        """Return API key for a role, falling back to global setting."""
        role_val = getattr(self, f"{role.upper()}_API_KEY", "")
        return role_val if role_val else self.AI_API_KEY

    def get_role_model(self, role: str) -> str:
        """Return model name for a role, falling back to global setting."""
        role_val = getattr(self, f"{role.upper()}_MODEL", "")
        return role_val if role_val else self.AI_MODEL


# Singleton – import `settings` everywhere
settings = Settings()
