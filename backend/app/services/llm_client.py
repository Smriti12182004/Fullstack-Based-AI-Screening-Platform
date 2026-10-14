import re
import time
from typing import Literal

import requests

from app.core.config import settings


GEMINI_QUESTION_TIMEOUT_SECONDS = 120
QUESTION_BATCH_HARD_LIMIT = 2
# Compatibility aliases retained for existing imports/tests during the refactor.
GROQ_QUESTION_TIMEOUT_SECONDS = GEMINI_QUESTION_TIMEOUT_SECONDS
GROQ_MAX_RATE_LIMIT_RETRIES = 2
GROQ_MAX_RATE_LIMIT_SLEEP_SECONDS = 60.0
OLLAMA_QUESTION_TIMEOUT_SECONDS = GEMINI_QUESTION_TIMEOUT_SECONDS
OLLAMA_QUESTION_BATCH_HARD_LIMIT = QUESTION_BATCH_HARD_LIMIT


class LLMServiceError(Exception):
    """Base exception for LLM service failures."""


class LLMQuotaError(LLMServiceError):
    """Raised when the LLM quota or rate limit is exceeded."""


class LLMConnectionError(LLMServiceError):
    """Raised when the LLM API cannot be reached."""


class LLMResponseError(LLMServiceError):
    """Raised when the LLM returns an invalid response."""


def _response_schema_from_openai_format(
    response_format: dict[str, object] | None,
) -> dict[str, object] | None:
    """Convert the existing internal JSON-schema format to Gemini's schema."""
    if not response_format or response_format.get("type") != "json_schema":
        return None

    json_schema = response_format.get("json_schema")
    if not isinstance(json_schema, dict):
        return None

    schema = json_schema.get("schema")
    if not isinstance(schema, dict):
        return None

    return schema


def _call_gemini_chat(
    prompt: str,
    *,
    response_format: dict[str, object] | None = None,
    temperature: float = 0.4,
    timeout: float = GEMINI_QUESTION_TIMEOUT_SECONDS,
    reasoning_effort: Literal["none", "default", "low", "medium", "high"] = "medium",
    max_completion_tokens: int | None = None,
) -> str:
    """Send one request through Gemini's Interactions REST API and return text.

    REST is used deliberately here instead of the SDK because the project
    successfully completes the same Interactions payload through HTTP while
    the installed SDK path has been retrying 429 responses for minutes.
    Keeping this adapter synchronous also preserves the existing service API.
    """
    api_key = str(getattr(settings, "gemini_api_key", "") or "").strip()
    model = str(getattr(settings, "gemini_model", "") or "").strip()

    if not api_key:
        raise LLMResponseError(
            "Gemini API key is not configured. Set GEMINI_API_KEY in backend/.env."
        )
    if not model:
        raise LLMResponseError(
            "Gemini model is not configured. Set GEMINI_MODEL in backend/.env."
        )

    thinking_level = reasoning_effort
    if thinking_level in {"none", "default"}:
        thinking_level = "low"

    generation_config: dict[str, object] = {
        "thinking_level": thinking_level,
        "temperature": temperature,
    }
    if max_completion_tokens is not None:
        generation_config["max_output_tokens"] = max_completion_tokens

    payload: dict[str, object] = {
        "model": model,
        "input": prompt,
        "generation_config": generation_config,
    }

    response_schema = _response_schema_from_openai_format(response_format)
    if response_schema is not None:
        payload["response_format"] = {
            "type": "text",
            "mime_type": "application/json",
            "schema": response_schema,
        }

    url = "https://generativelanguage.googleapis.com/v1beta/interactions"
    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(
            url,
            headers=headers,
            json=payload,
            timeout=max(float(timeout), 1.0),
        )
    except requests.exceptions.Timeout as exc:
        raise LLMConnectionError(
            f"Gemini generation timed out after {float(timeout):g} seconds."
        ) from exc
    except requests.exceptions.ConnectionError as exc:
        raise LLMConnectionError(
            "Unable to connect to the Gemini API."
        ) from exc
    except requests.exceptions.RequestException as exc:
        raise LLMResponseError(
            f"Gemini API request failed: {exc}"
        ) from exc

    if response.status_code == 429:
        detail = response.text.strip() or "rate limit exceeded"
        raise LLMQuotaError(
            f"Gemini API rate limit or quota was exceeded: {detail}"
        )

    if response.status_code in {401, 403}:
        detail = response.text.strip() or "authentication/access rejected"
        raise LLMResponseError(
            f"Gemini API authentication/access was rejected: {detail}"
        )

    if response.status_code >= 500:
        detail = response.text.strip() or f"HTTP {response.status_code}"
        raise LLMConnectionError(
            f"Gemini API temporarily failed with HTTP {response.status_code}: {detail}"
        )

    if response.status_code >= 400:
        detail = response.text.strip() or f"HTTP {response.status_code}"
        raise LLMResponseError(
            f"Gemini API returned HTTP {response.status_code}: {detail}"
        )

    try:
        response_json = response.json()
    except ValueError as exc:
        raise LLMResponseError(
            "Gemini returned a non-JSON response envelope."
        ) from exc

    content = response_json.get("output_text")
    if not isinstance(content, str) or not content.strip():
        steps = response_json.get("steps")
        if isinstance(steps, list):
            for step in reversed(steps):
                if not isinstance(step, dict) or step.get("type") != "model_output":
                    continue
                step_content = step.get("content")
                if not isinstance(step_content, list):
                    continue
                for item in step_content:
                    if isinstance(item, dict) and isinstance(item.get("text"), str):
                        content = item["text"]
                        break
                if isinstance(content, str) and content.strip():
                    break

    if not isinstance(content, str) or not content.strip():
        raise LLMResponseError("Gemini returned an empty generation response.")

    return content.strip()



def _groq_retry_delay_seconds(
    response: requests.Response,
    retry_number: int,
) -> float | None:
    """Return a bounded delay for a transient Groq rate limit.

    Prefer Groq's explicit retry/reset hint. Return ``None`` when the response
    looks like a longer-lived quota condition so the caller does not blindly
    retry a daily/account quota failure.
    """
    retry_after = response.headers.get("Retry-After")
    if retry_after:
        try:
            delay = float(retry_after.strip())
            if delay >= 0:
                return min(max(delay, 0.05), GROQ_MAX_RATE_LIMIT_SLEEP_SECONDS)
        except ValueError:
            pass

    reset_tokens = response.headers.get("x-ratelimit-reset-tokens")
    if reset_tokens:
        match = re.fullmatch(r"\s*([0-9]+(?:\.[0-9]+)?)\s*(ms|s|sec|secs|second|seconds)?\s*", reset_tokens, flags=re.IGNORECASE)
        if match:
            value = float(match.group(1))
            unit = (match.group(2) or "s").lower()
            delay = value / 1000.0 if unit == "ms" else value
            if delay >= 0:
                return min(max(delay, 0.05), GROQ_MAX_RATE_LIMIT_SLEEP_SECONDS)

    detail = response.text.strip()
    match = re.search(
        r"(?:try\s+again|retry(?:ing)?)\s+(?:in|after)\s+([0-9]+(?:\.[0-9]+)?)\s*(ms|s|sec|secs|second|seconds)\b",
        detail,
        flags=re.IGNORECASE,
    )
    if match:
        value = float(match.group(1))
        unit = match.group(2).lower()
        delay = value / 1000.0 if unit == "ms" else value
        if delay >= 0:
            return min(max(delay, 0.05), GROQ_MAX_RATE_LIMIT_SLEEP_SECONDS)

    # No explicit reset hint. Do not retry indefinitely or guess through a
    # potentially long-lived quota error.
    return None


def _call_groq_chat(
    prompt: str,
    *,
    response_format: dict[str, object] | None = None,
    temperature: float = 0.4,
    timeout: float = GROQ_QUESTION_TIMEOUT_SECONDS,
    reasoning_effort: Literal["none", "default", "low", "medium", "high"] = "medium",
    max_completion_tokens: int | None = None,
) -> str:
    """Send one request through Groq's OpenAI-compatible chat API and return text."""
    api_key = str(getattr(settings, "groq_api_key", "") or "").strip()
    model = str(getattr(settings, "groq_model", "") or "").strip()

    if not api_key:
        raise LLMResponseError(
            "Groq API key is not configured. Set GROQ_API_KEY in backend/.env."
        )
    if not model:
        raise LLMResponseError(
            "Groq model is not configured. Set GROQ_MODEL in backend/.env."
        )

    payload: dict[str, object] = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": prompt,
            }
        ],
        "temperature": temperature,
        "reasoning_effort": reasoning_effort,
        "stream": False,
    }

    if max_completion_tokens is not None:
        payload["max_completion_tokens"] = max_completion_tokens

    if response_format is not None:
        payload["response_format"] = response_format

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    for retry_number in range(GROQ_MAX_RATE_LIMIT_RETRIES + 1):
        try:
            response = requests.post(
                url,
                headers=headers,
                json=payload,
                timeout=max(float(timeout), 1.0),
            )
        except requests.exceptions.Timeout as exc:
            raise LLMConnectionError(
                f"Groq generation timed out after {float(timeout):g} seconds."
            ) from exc
        except requests.exceptions.ConnectionError as exc:
            raise LLMConnectionError(
                "Unable to connect to the Groq API."
            ) from exc
        except requests.exceptions.RequestException as exc:
            raise LLMResponseError(
                f"Groq API request failed: {exc}"
            ) from exc

        if response.status_code == 429:
            detail = response.text.strip() or "rate limit exceeded"

            if retry_number < GROQ_MAX_RATE_LIMIT_RETRIES:
                delay = _groq_retry_delay_seconds(response, retry_number + 1)
                if delay is not None:
                    time.sleep(delay)
                    continue

            raise LLMQuotaError(
                f"Groq API rate limit or quota was exceeded after bounded retries: {detail}"
            )

        break

    if response.status_code in {401, 403}:
        detail = response.text.strip() or "authentication/access rejected"
        raise LLMResponseError(
            f"Groq API authentication/access was rejected: {detail}"
        )

    if response.status_code >= 500:
        detail = response.text.strip() or f"HTTP {response.status_code}"
        raise LLMConnectionError(
            f"Groq API temporarily failed with HTTP {response.status_code}: {detail}"
        )

    if response.status_code >= 400:
        detail = response.text.strip() or f"HTTP {response.status_code}"
        raise LLMResponseError(
            f"Groq API returned HTTP {response.status_code}: {detail}"
        )

    try:
        response_json = response.json()
    except ValueError as exc:
        raise LLMResponseError(
            "Groq returned a non-JSON response envelope."
        ) from exc

    choices = response_json.get("choices")
    if not isinstance(choices, list) or not choices:
        raise LLMResponseError("Groq returned no choices in the generation response.")

    first_choice = choices[0]
    if not isinstance(first_choice, dict):
        raise LLMResponseError("Groq returned an invalid choice in the generation response.")

    message = first_choice.get("message")
    if not isinstance(message, dict):
        raise LLMResponseError("Groq returned an invalid message in the generation response.")

    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise LLMResponseError("Groq returned an empty generation response.")

    return content.strip()
