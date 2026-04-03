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
    key = settings.llm_api_key or "not-set"
    logger.debug("LLM client: base_url=%s key_prefix=%s", settings.llm_base_url, key[:8])
    return OpenAI(
        base_url=settings.llm_base_url,
        api_key=key,
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


def chat_with_tools(
    messages: list[dict],
    tools: list[dict],
    tool_dispatch: dict,
    settings: Settings,
    model: str | None = None,
    max_rounds: int = 10,
) -> str:
    """Run a multi-turn tool_use loop and return the final text response.

    Args:
        messages: Initial messages (system + user).
        tools: OpenAI-format tool definitions.
        tool_dispatch: Map of function name → callable(kwargs) → result_str.
        settings: LLM settings.
        max_rounds: Safety cap on tool-call rounds.

    Returns:
        The final assistant text after all tool calls are resolved.
    """
    resolved_model = model or settings.llm_model
    client = get_llm_client(settings)
    msgs = list(messages)

    for _ in range(max_rounds):
        _throttle()
        kwargs: dict = {
            "model": resolved_model,
            "messages": msgs,
            "tools": tools,
            "temperature": settings.llm_temperature,
            "max_tokens": settings.llm_max_tokens,
        }

        for attempt in range(3):
            try:
                response = client.chat.completions.create(**kwargs)
                break
            except RateLimitError as e:
                wait = 2 ** (attempt + 1)
                logger.warning("Rate limited (attempt %d/3): %s", attempt + 1, e)
                if attempt == 2:
                    raise
                time.sleep(wait)

        choice = response.choices[0]
        msg = choice.message

        # If no tool calls, return the text content
        if not msg.tool_calls:
            return msg.content or ""

        # Append assistant message with tool_calls
        msgs.append(msg.model_dump())

        # Execute each tool call and append results
        for tc in msg.tool_calls:
            fn_name = tc.function.name
            try:
                import json as _json
                fn_args = _json.loads(tc.function.arguments)
            except Exception:
                fn_args = {}

            handler = tool_dispatch.get(fn_name)
            if handler:
                try:
                    result = handler(**fn_args)
                    result_str = (
                        result if isinstance(result, str)
                        else _json.dumps(result, default=str)
                    )
                except Exception as exc:
                    result_str = f"Error: {exc}"
            else:
                result_str = f"Unknown tool: {fn_name}"

            msgs.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": result_str,
            })

    # Exhausted rounds — ask for final answer without tools
    msgs.append({"role": "user", "content": "Please provide your final answer now."})
    _throttle()
    response = client.chat.completions.create(
        model=resolved_model,
        messages=msgs,
        temperature=settings.llm_temperature,
        max_tokens=settings.llm_max_tokens,
    )
    return response.choices[0].message.content or ""


def _strip_code_fences(text: str) -> str:
    """Strip markdown code fences that some APIs wrap around JSON responses."""
    if not text:
        return ""
    stripped = text.strip()
    match = re.match(r"^```(?:json)?\s*\n?(.*?)```$", stripped, re.DOTALL)
    if match:
        return match.group(1).strip()
    return stripped
