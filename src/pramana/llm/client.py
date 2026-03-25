"""Configurable OpenAI-compatible LLM client."""

import logging
import re
import time

from openai import OpenAI, RateLimitError

from pramana.config import Settings

logger = logging.getLogger(__name__)

# Minimum seconds between LLM calls (rate limit guard)
_MIN_INTERVAL = 0.5
_last_call_time: float = 0.0


def get_llm_client(settings: Settings) -> OpenAI:
    """Create an OpenAI-compatible client from settings."""
    return OpenAI(
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key or "not-set",
    )


def _throttle() -> None:
    """Enforce minimum interval between LLM calls."""
    global _last_call_time
    elapsed = time.monotonic() - _last_call_time
    if elapsed < _MIN_INTERVAL:
        time.sleep(_MIN_INTERVAL - elapsed)
    _last_call_time = time.monotonic()


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

    # Retry up to 3 times on rate limit with exponential backoff
    for attempt in range(3):
        _throttle()
        try:
            response = client.chat.completions.create(**kwargs)
            break
        except RateLimitError as e:
            wait = 2 ** (attempt + 1)   # 2s, 4s, 8s
            logger.warning("Rate limited (attempt %d/3), retrying in %ds: %s", attempt + 1, wait, e)
            if attempt == 2:
                raise
            time.sleep(wait)

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
