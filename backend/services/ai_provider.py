"""
AI Provider Abstraction Layer for AI_Increed.

Hierarchy:
  AIProvider (ABC)
  ├── OpenAICompatibleProvider  — OpenAI, Groq, Azure, any OpenAI-compatible endpoint
  │   └── OllamaProvider        — local Ollama (no API key needed)
  └── (future providers here)

ProviderFactory.get_provider(role) returns the correct configured provider.

API keys are NEVER logged or included in any .md files.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import AsyncGenerator

from openai import AsyncOpenAI

from backend.config import settings

logger = logging.getLogger(__name__)


# ── Abstract base ─────────────────────────────────────────────────────────────

class AIProvider(ABC):
    """Abstract base class for all AI providers."""

    @abstractmethod
    async def chat(
        self,
        messages: list[dict],
        system_prompt: str = "",
    ) -> str:
        """
        Send a list of chat messages and return the full text response.

        Args:
            messages:      List of {"role": ..., "content": ...} dicts.
            system_prompt: Optional system-level instruction prepended to messages.

        Returns:
            The model's complete text response.
        """

    @abstractmethod
    async def chat_stream(
        self,
        messages: list[dict],
        system_prompt: str = "",
    ) -> AsyncGenerator[str, None]:
        """
        Stream a chat completion, yielding text chunks as they arrive.

        Args:
            messages:      List of {"role": ..., "content": ...} dicts.
            system_prompt: Optional system-level instruction.

        Yields:
            Incremental text chunks from the model.
        """


# ── OpenAI-compatible provider ────────────────────────────────────────────────

class OpenAICompatibleProvider(AIProvider):
    """
    Provider for any OpenAI-compatible API endpoint.

    Works with: OpenAI, Groq, Azure OpenAI, Together.ai, LM Studio, etc.
    """

    def __init__(
        self,
        api_key: str,
        base_url: str,
        model: str,
    ) -> None:
        self.model = model
        # api_key may be a placeholder ("ollama") for keyless providers
        self._client = AsyncOpenAI(
            api_key=api_key or "placeholder",
            base_url=base_url,
        )

    async def chat(
        self,
        messages: list[dict],
        system_prompt: str = "",
    ) -> str:
        """Return a complete chat response."""
        full_messages = self._build_messages(messages, system_prompt)
        try:
            response = await self._client.chat.completions.create(
                model=self.model,
                messages=full_messages,
            )
            return response.choices[0].message.content or ""
        except Exception as exc:
            logger.error("OpenAI-compatible chat error: %s", exc)
            raise

    async def chat_stream(
        self,
        messages: list[dict],
        system_prompt: str = "",
    ) -> AsyncGenerator[str, None]:
        """Stream chat response chunks."""
        full_messages = self._build_messages(messages, system_prompt)
        try:
            stream = await self._client.chat.completions.create(
                model=self.model,
                messages=full_messages,
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta
        except Exception as exc:
            logger.error("OpenAI-compatible stream error: %s", exc)
            raise

    # ── Private helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _build_messages(
        messages: list[dict],
        system_prompt: str,
    ) -> list[dict]:
        """Prepend system message if provided."""
        if system_prompt:
            return [{"role": "system", "content": system_prompt}] + list(messages)
        return list(messages)


# ── Ollama provider ───────────────────────────────────────────────────────────

class OllamaProvider(OpenAICompatibleProvider):
    """
    Provider for local Ollama inference server.

    Uses the OpenAI-compatible endpoint exposed by Ollama at
    http://localhost:11434/v1 (configurable via OLLAMA_BASE_URL).
    No API key is required.
    """

    def __init__(self, model: str) -> None:
        super().__init__(
            api_key="ollama",           # Ollama ignores the key
            base_url=settings.OLLAMA_BASE_URL,
            model=model,
        )


# ── Factory ───────────────────────────────────────────────────────────────────

class ProviderFactory:
    """
    Creates the correct AIProvider for a given role.

    Reads from settings using the per-role config with global fallback.
    Supported provider names: "openai", "groq", "azure", "ollama".
    Any unrecognised name is treated as OpenAI-compatible.
    """

    @staticmethod
    def get_provider(role: str = "default") -> AIProvider:
        """
        Return a fully configured AIProvider for *role*.

        Args:
            role: "planner", "reviewer", or "default" (global settings).

        Returns:
            An instantiated AIProvider.
        """
        provider_name = settings.get_role_provider(role).lower()
        model = settings.get_role_model(role)

        if provider_name == "ollama":
            return OllamaProvider(model=model)

        # All other cases: OpenAI-compatible
        api_key = settings.get_role_api_key(role)
        base_url = settings.get_role_base_url(role)
        return OpenAICompatibleProvider(
            api_key=api_key,
            base_url=base_url,
            model=model,
        )

    @staticmethod
    def get_planner() -> AIProvider:
        """Shorthand for get_provider('planner')."""
        return ProviderFactory.get_provider("planner")

    @staticmethod
    def get_reviewer() -> AIProvider:
        """Shorthand for get_provider('reviewer')."""
        return ProviderFactory.get_provider("reviewer")
