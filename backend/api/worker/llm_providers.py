"""Multi-provider LLM backends (Anthropic, OpenAI-compatible, Gemini, Ollama).

OpenAI-compatible covers OpenAI, OpenRouter, and **Ollama** (local ``/v1`` API).

Consumer ChatGPT web login / OAuth is **not** supported for headless servers;
use an API key (OpenAI platform) or a router key (OpenRouter).
"""
from __future__ import annotations

import os
from typing import Any

import httpx

_DEFAULT_MODEL = {
    "anthropic": "claude-3-5-haiku-20241022",
    "openai": "gpt-4o-mini",
    "openrouter": "openrouter/free",
    "gemini": "gemini-2.0-flash",
    "ollama": "llama3.2",
}

_DEFAULT_BASE_OPENAI = "https://api.openai.com/v1"
_DEFAULT_BASE_OPENROUTER = "https://openrouter.ai/api/v1"
_DEFAULT_BASE_OLLAMA = "http://127.0.0.1:11434/v1"


def normalize_provider(raw: str | None) -> str:
    p = (raw or "anthropic").strip().lower()
    if p in ("open-ai", "chatgpt", "gpt"):
        return "openai"
    if p in ("router",):
        return "openrouter"
    if p in ("google", "google-ai", "generative-ai"):
        return "gemini"
    if p in ("local-llm", "ollama"):
        return "ollama"
    if p not in ("anthropic", "openai", "openrouter", "gemini", "ollama"):
        return "anthropic"
    return p


def resolve_api_key(provider: str, override: str | None) -> str | None:
    """Resolve API key: request override, then ``LLM_API_KEY``, then provider-specific env."""
    if override and str(override).strip():
        return str(override).strip()

    generic = os.getenv("LLM_API_KEY", "").strip()
    if generic:
        return generic

    if provider == "anthropic":
        return os.getenv("ANTHROPIC_API_KEY", "").strip() or None
    if provider == "openai":
        return os.getenv("OPENAI_API_KEY", "").strip() or None
    if provider == "openrouter":
        return (
            os.getenv("OPENROUTER_API_KEY", "").strip()
            or os.getenv("OPENAI_API_KEY", "").strip()
            or None
        )
    if provider == "gemini":
        return os.getenv("GEMINI_API_KEY", "").strip() or None
    if provider == "ollama":
        return os.getenv("OLLAMA_API_KEY", "").strip() or None
    return None


def default_model(provider: str) -> str:
    return os.getenv("LLM_MODEL", "").strip() or _DEFAULT_MODEL.get(
        provider, _DEFAULT_MODEL["anthropic"]
    )


def openai_compatible_base_url(provider: str) -> str:
    if provider == "ollama":
        for env in ("OLLAMA_BASE_URL", "LLM_BASE_URL"):
            v = os.getenv(env, "").strip()
            if v:
                return v.rstrip("/")
        return _DEFAULT_BASE_OLLAMA
    custom = os.getenv("LLM_BASE_URL", "").strip()
    if custom:
        return custom.rstrip("/")
    if provider == "openrouter":
        return _DEFAULT_BASE_OPENROUTER
    return _DEFAULT_BASE_OPENAI


async def complete_user_text(
    *,
    provider: str,
    api_key: str | None,
    user_text: str,
    max_tokens: int,
) -> str:
    """Run one user-message completion; return trimmed assistant text."""
    model = default_model(provider)
    timeout = float(os.getenv("LLM_HTTP_TIMEOUT_SEC", "90"))

    if provider == "anthropic":
        if not api_key or not str(api_key).strip():
            raise ValueError("Anthropic requires a non-empty API key")
        return await _anthropic_messages(
            str(api_key).strip(), model, user_text, max_tokens, timeout
        )
    if provider in ("openai", "openrouter"):
        if not api_key or not str(api_key).strip():
            raise ValueError(f"{provider} requires a non-empty API key")
        return await _openai_chat_completions(
            bearer_token=str(api_key).strip(),
            base_url=openai_compatible_base_url(provider),
            model=model,
            user_text=user_text,
            max_tokens=max_tokens,
            timeout=timeout,
            extra_headers=_openrouter_meta_headers() if provider == "openrouter" else None,
        )
    if provider == "ollama":
        tok = (str(api_key).strip() if api_key else "") or None
        if tok is None and os.getenv("LLM_API_KEY", "").strip():
            tok = os.getenv("LLM_API_KEY", "").strip()
        if tok is None and os.getenv("OLLAMA_API_KEY", "").strip():
            tok = os.getenv("OLLAMA_API_KEY", "").strip()
        return await _openai_chat_completions(
            bearer_token=tok,
            base_url=openai_compatible_base_url("ollama"),
            model=model,
            user_text=user_text,
            max_tokens=max_tokens,
            timeout=timeout,
            extra_headers=None,
        )
    if provider == "gemini":
        if not api_key or not str(api_key).strip():
            raise ValueError("Gemini requires a non-empty API key")
        return await _gemini_generate(str(api_key).strip(), model, user_text, max_tokens, timeout)

    raise ValueError(f"Unknown LLM provider: {provider}")


def _openrouter_meta_headers() -> dict[str, str]:
    """Optional OpenRouter attribution (rankings / debugging)."""
    h: dict[str, str] = {}
    ref = os.getenv("OPENROUTER_HTTP_REFERER", "").strip()
    title = os.getenv("OPENROUTER_X_TITLE", "BoardSight").strip()
    if ref:
        h["HTTP-Referer"] = ref
    if title:
        h["X-Title"] = title
    return h


async def _openai_chat_completions(
    *,
    bearer_token: str | None,
    base_url: str,
    model: str,
    user_text: str,
    max_tokens: int,
    timeout: float,
    extra_headers: dict[str, str] | None,
) -> str:
    url = f"{base_url.rstrip('/')}/chat/completions"
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if bearer_token:
        headers["Authorization"] = f"Bearer {bearer_token}"
    if extra_headers:
        headers.update(extra_headers)
    body: dict[str, Any] = {
        "model": model,
        "messages": [{"role": "user", "content": user_text}],
        "max_tokens": max_tokens,
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(url, json=body, headers=headers)
        r.raise_for_status()
        data = r.json()
    choice = data["choices"][0]
    msg = choice.get("message") or {}
    content = msg.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
        return "".join(parts).strip()
    return str(content or "").strip()


async def _anthropic_messages(
    api_key: str,
    model: str,
    user_text: str,
    max_tokens: int,
    timeout: float,
) -> str:
    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "x-api-key": api_key,
        "anthropic-version": os.getenv("ANTHROPIC_API_VERSION", "2023-06-01"),
        "Content-Type": "application/json",
    }
    body = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": user_text}],
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(url, json=body, headers=headers)
        r.raise_for_status()
        data = r.json()
    parts_out: list[str] = []
    for block in data.get("content", []):
        if isinstance(block, dict) and block.get("type") == "text":
            parts_out.append(block.get("text", ""))
    return "".join(parts_out).strip()


async def _gemini_generate(
    api_key: str,
    model: str,
    user_text: str,
    max_tokens: int,
    timeout: float,
) -> str:
    # Model id should not include "models/" prefix in path segment
    mid = model.removeprefix("models/")
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{mid}:generateContent?key={api_key}"
    )
    body = {
        "contents": [{"parts": [{"text": user_text}]}],
        "generationConfig": {"maxOutputTokens": max_tokens},
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(url, json=body, headers={"Content-Type": "application/json"})
        r.raise_for_status()
        data = r.json()
    text = ""
    for cand in data.get("candidates", []) or []:
        for part in cand.get("content", {}).get("parts", []) or []:
            if "text" in part:
                text += part["text"]
    return text.strip()
