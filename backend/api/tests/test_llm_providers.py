"""Tests for multi-provider LLM resolution and HTTP wrappers."""
from __future__ import annotations

import pytest

from api.worker.llm_providers import (
    complete_user_text,
    normalize_provider,
    openai_compatible_base_url,
    resolve_api_key,
)


def test_normalize_provider_aliases():
    assert normalize_provider(None) == "anthropic"
    assert normalize_provider("OpenAI") == "openai"
    assert normalize_provider("chatgpt") == "openai"
    assert normalize_provider("OPENROUTER") == "openrouter"
    assert normalize_provider("gemini") == "gemini"
    assert normalize_provider("ollama") == "ollama"
    assert normalize_provider("unknown") == "anthropic"


def test_resolve_key_override_wins(monkeypatch):
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert resolve_api_key("anthropic", "sk-override") == "sk-override"


def test_resolve_key_llm_api_key_generic(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "generic")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert resolve_api_key("anthropic", None) == "generic"


def test_resolve_key_openrouter_prefers_openrouter_env(monkeypatch):
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.setenv("OPENROUTER_API_KEY", "or-key")
    monkeypatch.setenv("OPENAI_API_KEY", "oai-key")
    assert resolve_api_key("openrouter", None) == "or-key"


def test_openai_compatible_base_url_openrouter_default(monkeypatch):
    monkeypatch.delenv("LLM_BASE_URL", raising=False)
    assert "openrouter.ai" in openai_compatible_base_url("openrouter")


def test_openai_compatible_base_url_ollama_default(monkeypatch):
    monkeypatch.delenv("OLLAMA_BASE_URL", raising=False)
    monkeypatch.delenv("LLM_BASE_URL", raising=False)
    assert openai_compatible_base_url("ollama") == "http://127.0.0.1:11434/v1"


def test_openai_compatible_base_url_ollama_prefers_env(monkeypatch):
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434/v1")
    assert openai_compatible_base_url("ollama") == "http://host.docker.internal:11434/v1"


def test_resolve_key_ollama(monkeypatch):
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.setenv("OLLAMA_API_KEY", "secret")
    assert resolve_api_key("ollama", None) == "secret"


@pytest.mark.asyncio
async def test_complete_openai_chat_parses_message(monkeypatch):
    class Resp:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "  hi  "}}]}

    class Client:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return None

        async def post(self, *a, **k):
            return Resp()

    monkeypatch.setattr("api.worker.llm_providers.httpx.AsyncClient", Client)
    out = await complete_user_text(
        provider="openai",
        api_key="k",
        user_text="ping",
        max_tokens=10,
    )
    assert out == "hi"


@pytest.mark.asyncio
async def test_complete_ollama_omits_bearer_without_token(monkeypatch):
    class Resp:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "yo"}}]}

    captured: dict = {}

    class Client:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return None

        async def post(self, *a, **kwargs):
            captured["headers"] = kwargs.get("headers", {})
            return Resp()

    monkeypatch.setenv("LLM_MODEL", "mistral")
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("OLLAMA_API_KEY", raising=False)
    monkeypatch.setattr("api.worker.llm_providers.httpx.AsyncClient", Client)
    out = await complete_user_text(
        provider="ollama",
        api_key=None,
        user_text="ping",
        max_tokens=10,
    )
    assert out == "yo"
    assert "Authorization" not in captured["headers"]


@pytest.mark.asyncio
async def test_complete_anthropic_parses_text_blocks(monkeypatch):
    class Resp:
        def raise_for_status(self):
            return None

        def json(self):
            return {"content": [{"type": "text", "text": "  move  "}]}

    class Client:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return None

        async def post(self, *a, **k):
            return Resp()

    monkeypatch.setattr("api.worker.llm_providers.httpx.AsyncClient", Client)
    monkeypatch.setenv("LLM_MODEL", "claude-fake")
    out = await complete_user_text(
        provider="anthropic",
        api_key="k",
        user_text="ping",
        max_tokens=10,
    )
    assert out == "move"
