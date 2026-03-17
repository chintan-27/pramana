"""Configurable OpenAI-compatible LLM client."""

from openai import OpenAI

from pramana.config import Settings


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
    client = get_llm_client(settings)
    kwargs: dict = {
        "model": model or settings.llm_model,
        "messages": messages,
        "temperature": temperature if temperature is not None else settings.llm_temperature,
        "max_tokens": max_tokens or settings.llm_max_tokens,
    }
    if response_format:
        kwargs["response_format"] = response_format

    response = client.chat.completions.create(**kwargs)
    return response.choices[0].message.content or ""


def chat_json(
    messages: list[dict],
    settings: Settings,
    model: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> str:
    """Send a chat completion request with JSON response format."""
    return chat(
        messages=messages,
        settings=settings,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        response_format={"type": "json_object"},
    )
