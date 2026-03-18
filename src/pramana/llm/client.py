"""Configurable OpenAI-compatible LLM client."""

import logging
import re

from openai import OpenAI

from pramana.config import Settings

logger = logging.getLogger(__name__)


def get_llm_client(settings: Settings) -> OpenAI:
    """Create an OpenAI-compatible client from settings."""
    return OpenAI(
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key or "not-set",
    )


def chat(
    messages: list[dict],
    settings: Settings,
    model: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
    response_format: dict | None = None,
) -> str:
    """Send a chat completion request and return the response text."""
    resolved_model = model or settings.llm_model
    client = get_llm_client(settings)
    kwargs: dict = {
        "model": resolved_model,
        "messages": messages,
        "temperature": temperature if temperature is not None else settings.llm_temperature,
        "max_tokens": max_tokens or settings.llm_max_tokens,
    }
    if response_format:
        kwargs["response_format"] = response_format

    logger.debug("LLM request: model=%s messages=%d", resolved_model, len(messages))
    response = client.chat.completions.create(**kwargs)

    content = response.choices[0].message.content if response.choices else None
    if content is None:
        logger.warning("LLM returned None content (model=%s, finish_reason=%s)",
                       resolved_model,
                       response.choices[0].finish_reason if response.choices else "no_choices")
        return ""

    logger.debug("LLM response: %d chars, finish_reason=%s",
                 len(content), response.choices[0].finish_reason)
    return content


def chat_json(
    messages: list[dict],
    settings: Settings,
    model: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> str:
    """Send a chat completion request with JSON response format."""
    raw = chat(
        messages=messages,
        settings=settings,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        response_format={"type": "json_object"},
    )
    cleaned = _strip_code_fences(raw)
    if not cleaned:
        logger.warning("LLM JSON response was empty after stripping code fences")
    return cleaned


def _strip_code_fences(text: str) -> str:
    """Strip markdown code fences that some APIs wrap around JSON responses."""
    if not text:
        return ""
    stripped = text.strip()
    match = re.match(r"^```(?:json)?\s*\n?(.*?)```$", stripped, re.DOTALL)
    if match:
        return match.group(1).strip()
    return stripped
