"""Input sanitization for prompt injection defense."""

import logging
import re

logger = logging.getLogger(__name__)

# Patterns that attempt to override system prompts or inject instructions
_INJECTION_PATTERNS = [
    re.compile(r"\[SYSTEM\]", re.IGNORECASE),
    re.compile(r"<\|system\|>", re.IGNORECASE),
    re.compile(r"<\|im_start\|>", re.IGNORECASE),
    re.compile(r"<\|im_end\|>", re.IGNORECASE),
    re.compile(r"<<SYS>>", re.IGNORECASE),
    re.compile(r"<</SYS>>", re.IGNORECASE),
    re.compile(r"\bsystem\s*:\s*\n", re.IGNORECASE),
    re.compile(r"ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts)", re.IGNORECASE),
    re.compile(
        r"disregard\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts)",
        re.IGNORECASE,
    ),
    re.compile(r"forget\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts)", re.IGNORECASE),
    re.compile(r"you\s+are\s+now\s+(a|an)\b", re.IGNORECASE),
    re.compile(r"new\s+instructions?\s*:", re.IGNORECASE),
    re.compile(r"override\s+(instructions?|prompt)", re.IGNORECASE),
]


def sanitize_user_input(text: str, max_length: int = 2000) -> str:
    """Sanitize user-provided text before it goes into LLM prompts.

    Defense-in-depth: strips known injection patterns, control characters,
    and enforces length limits. The LLM system prompt already constrains
    behavior, but sanitizing adds a layer.
    """
    if not text:
        return ""

    # Strip null bytes and control characters (keep newlines/tabs)
    result = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)

    # Check for suspicious patterns and log warnings
    for pattern in _INJECTION_PATTERNS:
        if pattern.search(result):
            logger.warning("Suspicious input pattern detected: %s", pattern.pattern)
            result = pattern.sub("", result)

    # Truncate
    if len(result) > max_length:
        logger.warning("Input truncated from %d to %d chars", len(result), max_length)
        result = result[:max_length]

    return result.strip()
