import json
import os
import re
import socket
import time
import urllib.request
import urllib.error
from typing import Any

from app.core.schemas import NotesDeltaPayload
from app.services.notes.prompt_templates import SCHEMA, build_final_prompt, build_live_prompt, build_prompt


def _extract_fenced_json(text: str) -> str | None:
    fence_start = text.find("```")
    while fence_start != -1:
        fence_end = text.find("```", fence_start + 3)
        if fence_end == -1:
            break
        block = text[fence_start + 3 : fence_end].strip()
        if block.lower().startswith("json"):
            block = block[4:].strip()
        if block.startswith("{") and block.endswith("}"):
            return block
        fence_start = text.find("```", fence_end + 3)
    return None


def _extract_balanced_json(text: str) -> str | None:
    start = text.find("{")
    if start == -1:
        return None
    depth = 0
    for i in range(start, len(text)):
        char = text[i]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None


def _extract_json_payload(text: str, required_keys: set[str]) -> dict[str, Any]:
    payload = _extract_fenced_json(text) or _extract_balanced_json(text) or text
    payload = payload.strip()

    try:
        data = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise ValueError("No JSON object found in LLM response") from exc

    if isinstance(data, dict) and required_keys.issubset(data.keys()):
        return data

    if isinstance(data, dict):
        for key in ("content", "text", "response"):
            if key in data and isinstance(data[key], str):
                return _extract_json_payload(data[key], required_keys)

        if "choices" in data and isinstance(data["choices"], list):
            for choice in data["choices"]:
                message = choice.get("message") if isinstance(choice, dict) else None
                if isinstance(message, dict) and isinstance(message.get("content"), str):
                    return _extract_json_payload(message["content"], required_keys)

    raise ValueError("Unsupported LLM response format")


def _extract_json(text: str) -> dict[str, Any]:
    return _extract_json_payload(
        text, {"topics", "keyTerms", "questions", "definitions", "steps"}
    )


def _extract_openai_text(data: dict[str, Any]) -> str:
    if isinstance(data.get("output_text"), str):
        return data["output_text"]

    output = data.get("output")
    if isinstance(output, list):
        chunks: list[str] = []
        for item in output:
            if not isinstance(item, dict):
                continue
            content = item.get("content")
            if isinstance(content, list):
                for part in content:
                    if not isinstance(part, dict):
                        continue
                    if part.get("type") in ("output_text", "text") and isinstance(
                        part.get("text"), str
                    ):
                        chunks.append(part["text"])
        if chunks:
            return "\n".join(chunks)

    raise ValueError("OpenAI response missing output text")


def _normalize_sentence_key(text: str) -> str:
    normalized = re.sub(r"[^a-z0-9\s]", "", text.lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def _looks_like_noise(text: str) -> bool:
    lowered = text.strip().lower()
    normalized = re.sub(r"[^a-z0-9\s]", "", lowered).strip()
    if not lowered:
        return True
    if len(lowered) < 4:
        return True
    filler = {
        "thank you",
        "thanks",
        "okay",
        "ok",
        "yeah",
        "right",
        "all right",
        "so",
        "um",
        "uh",
    }
    if lowered in filler or normalized in filler:
        return True
    words = normalized.split()
    if len(words) <= 2 and normalized in filler:
        return True
    alpha_count = sum(char.isalpha() for char in lowered)
    if alpha_count < 3:
        return True
    return False


def _prepare_final_transcript(transcript: str, max_chars: int = 9000) -> str:
    raw = transcript.replace("\r", "\n")
    chunks = [part.strip() for part in re.split(r"[\n]+|(?<=[.!?])\s+", raw) if part.strip()]

    filtered: list[str] = []
    seen: set[str] = set()
    for chunk in chunks:
        cleaned = re.sub(r"\s+", " ", chunk).strip(" -")
        if _looks_like_noise(cleaned):
            continue
        key = _normalize_sentence_key(cleaned)
        if not key or key in seen:
            continue
        seen.add(key)
        filtered.append(cleaned)

    prepared = "\n".join(filtered)
    if len(prepared) <= max_chars:
        return prepared

    head_target = int(max_chars * 0.55)
    tail_target = max_chars - head_target
    head = prepared[:head_target].rstrip()
    tail = prepared[-tail_target:].lstrip()
    return f"{head}\n...\n{tail}"


SECTION_HEADING_HINTS = {
    "overview",
    "core concept",
    "core concepts",
    "key ideas",
    "key idea",
    "key definitions",
    "definitions",
    "examples",
    "historical context",
    "intuitive correction",
    "historical context / conceptual correction",
    "mass and the source of inertia",
    "mass and inertia",
    "net force and motion",
    "net vector force",
    "key equations",
    "exam takeaways",
}


def _strip_bullet_prefix(text: str) -> str:
    return re.sub(r"^[-*+]\s+|^\d+[.)]\s+", "", text).strip()


def _looks_like_math_fragment(text: str) -> bool:
    if not text:
        return False
    if "$" in text:
        return True
    math_tokens = ("=", "=>", "->", "<-", "∑", "Σ", "Δ", "≠", "≤", "≥", "√", "^")
    if any(token in text for token in math_tokens):
        return True
    normalized = text.strip().lower()
    return normalized in {"sigma", "delta", "alpha", "beta", "gamma", "lambda"}


def _should_wrap_as_math_line(text: str) -> bool:
    stripped = text.strip()
    if not stripped or stripped.startswith("$"):
        return False
    if ":" in stripped:
        return False
    if not _looks_like_math_fragment(stripped):
        return False

    words = re.findall(r"[A-Za-z]+", stripped)
    operator_count = len(re.findall(r"[=+\-/*^<>|(){}\[\]]|=>|->|<-", stripped))
    total_alpha = sum(1 for char in stripped if char.isalpha())

    if len(words) >= 8 and total_alpha >= 24:
        return False
    if len(words) >= 6 and operator_count <= 2:
        return False
    if len(words) <= 4:
        return True
    return operator_count >= 3 and total_alpha <= 28


def _looks_like_section_heading(text: str) -> bool:
    stripped = text.strip().strip(":").strip()
    lowered = stripped.lower()
    if not stripped:
        return False
    if _looks_like_math_fragment(stripped):
        return False
    if lowered in SECTION_HEADING_HINTS:
        return True
    if ":" in stripped:
        prefix = stripped.split(":", 1)[0].strip().lower()
        if prefix in SECTION_HEADING_HINTS:
            return True
    if len(stripped) > 80:
        return False
    if any(symbol in stripped for symbol in ".!?$="):
        return False
    words = stripped.split()
    if len(words) < 2:
        return False
    if len(words) > 9:
        return False
    if text.strip().endswith(":") and len(words) <= 7:
        return True
    capitalized = sum(1 for word in words if word[:1].isupper() or word.isupper())
    return capitalized >= max(1, len(words) - 1)


def _merge_line_broken_equations(lines: list[str]) -> list[str]:
    merged: list[str] = []
    index = 0
    while index < len(lines):
        current = lines[index].rstrip()
        stripped = current.strip()
        if stripped and stripped.endswith(":"):
            cursor = index + 1
            fragments: list[str] = []
            while cursor < len(lines):
                candidate = lines[cursor].strip()
                if not candidate:
                    break
                if candidate.startswith(("#", "-", "*", "```")):
                    break
                if _looks_like_section_heading(candidate):
                    break
                if len(candidate) <= 28 or _looks_like_math_fragment(candidate):
                    fragments.append(candidate)
                    cursor += 1
                    continue
                break
            if fragments:
                merged.append(f"{stripped} {' '.join(fragments)}")
                index = cursor
                continue
        merged.append(current)
        index += 1
    return merged


def _cleanup_final_notes_text(text: str) -> str:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:markdown|md)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    lines = _merge_line_broken_equations([line.rstrip() for line in cleaned.splitlines()])

    result: list[str] = []
    previous_key = ""
    section_bullets = 0
    in_fence = False
    title_seen = False
    subtitle_seen = False

    for raw_line in lines:
        stripped = raw_line.strip()
        if stripped.startswith("```"):
            in_fence = not in_fence
            result.append(stripped)
            previous_key = ""
            continue

        if in_fence:
            result.append(raw_line.rstrip())
            continue

        if not stripped:
            if result and result[-1] != "":
                result.append("")
            continue

        if stripped.lower() in {"lecture notes", "# lecture notes"}:
            if not title_seen:
                result.append("# Lecture Notes")
                title_seen = True
            continue

        if stripped.startswith("# "):
            if not title_seen:
                result.append("# Lecture Notes")
                title_seen = True
            continue

        if stripped.lower().startswith("subtitle:"):
            subtitle = stripped.split(":", 1)[1].strip()
            if subtitle and not subtitle_seen:
                if result and result[-1] != "":
                    result.append("")
                result.append(f"> {subtitle}")
                subtitle_seen = True
            continue

        if stripped.startswith("## "):
            section_bullets = 0
            if result and result[-1] != "":
                result.append("")
            result.append(stripped)
            previous_key = _normalize_sentence_key(stripped)
            continue

        if not title_seen:
            result.append("# Lecture Notes")
            title_seen = True

        if not subtitle_seen and not stripped.startswith(("##", "-", "*", "```")):
            subtitle = stripped.strip(" -")
            if subtitle and len(subtitle) <= 120 and not _looks_like_section_heading(subtitle):
                if result and result[-1] != "":
                    result.append("")
                result.append(f"> {subtitle}")
                subtitle_seen = True
                previous_key = _normalize_sentence_key(subtitle)
                continue

        if _looks_like_section_heading(stripped):
            heading = stripped.strip().strip(":")
            heading = re.sub(r"\s+", " ", heading)
            section_bullets = 0
            if result and result[-1] != "":
                result.append("")
            result.append(f"## {heading}")
            previous_key = _normalize_sentence_key(heading)
            continue

        if stripped.startswith("### "):
            section_bullets = 0
            if result and result[-1] != "":
                result.append("")
            result.append(f"## {stripped[4:].strip()}")
            previous_key = _normalize_sentence_key(stripped)
            continue

        bullet_text = _strip_bullet_prefix(stripped)
        if not bullet_text:
            continue

        if _looks_like_math_fragment(bullet_text) and bullet_text.startswith("$$") and bullet_text.endswith("$$"):
            result.append(bullet_text)
            previous_key = _normalize_sentence_key(bullet_text)
            continue

        if _should_wrap_as_math_line(bullet_text):
            bullet_text = f"${bullet_text}$"

        key = _normalize_sentence_key(bullet_text)
        if key and key == previous_key:
            continue

        if section_bullets >= 4:
            continue

        if len(bullet_text) > 220:
            bullet_text = f"{bullet_text[:217].rstrip()}..."

        result.append(f"- {bullet_text}")
        section_bullets += 1
        previous_key = key

    if not result or result[0] != "# Lecture Notes":
        result.insert(0, "# Lecture Notes")

    compact: list[str] = []
    fence_open = False
    for line in result:
        if line.startswith("```"):
            fence_open = not fence_open
        if line == "" and compact and compact[-1] == "" and not fence_open:
            continue
        compact.append(line)

    return "\n".join(compact).strip()


def _is_retryable_http_error(status_code: int) -> bool:
    return status_code in {408, 409, 429, 500, 502, 503, 504}


def _is_retryable_exception(exc: Exception) -> bool:
    if isinstance(exc, urllib.error.HTTPError):
        return _is_retryable_http_error(exc.code)
    if isinstance(exc, urllib.error.URLError):
        return True
    if isinstance(exc, TimeoutError | socket.timeout):
        return True
    return False


def _request_llm_text(
    prompt: str,
    *,
    response_format: dict[str, Any] | None = None,
    timeout_seconds: int = 30,
    max_retries: int = 0,
) -> str:
    provider = os.getenv("LLM_PROVIDER", "openai").lower()

    if provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY not configured")
        model = os.getenv("LLM_MODEL", "gpt-5-mini")
        url = "https://api.openai.com/v1/responses"
        payload: dict[str, Any] = {"model": model, "input": prompt}
        if response_format is not None:
            payload["text"] = {"format": response_format}
        openai_temp = os.getenv("OPENAI_TEMPERATURE")
        if openai_temp:
            payload["temperature"] = float(openai_temp)
        data = json.dumps(payload).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }
        request = urllib.request.Request(url, data=data, headers=headers, method="POST")
        for attempt in range(max_retries + 1):
            try:
                with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                    raw_json = response.read().decode("utf-8")
                parsed = json.loads(raw_json)
                text_response = _extract_openai_text(parsed).strip()
                if os.getenv("DEBUG_LLM", "0") == "1":
                    preview = text_response[:120].replace("\n", " ")
                    print(f"[LLM] provider=openai model={model} response='{preview}'")
                return text_response
            except Exception as exc:
                if isinstance(exc, urllib.error.HTTPError):
                    body = exc.read().decode("utf-8", "ignore")
                    if os.getenv("DEBUG_LLM", "0") == "1":
                        preview = body[:200].replace("\n", " ")
                        print(f"[LLM] provider=openai http_error={exc.code} body='{preview}'")
                if attempt >= max_retries or not _is_retryable_exception(exc):
                    raise
                time.sleep(min(4.0, 1.0 + attempt))

    if provider == "ollama":
        base = os.getenv("LLM_HTTP_URL", "http://localhost:11434")
        url = f"{base.rstrip('/')}/api/generate"
        model = os.getenv("LLM_MODEL", "llama3.1:8b")
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": float(os.getenv("LLM_TEMPERATURE", "0.1"))},
            "stop": ["```"],
        }
        data = json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json"}

        request = urllib.request.Request(url, data=data, headers=headers, method="POST")
        for attempt in range(max_retries + 1):
            try:
                with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                    raw_json = response.read().decode("utf-8")
                parsed = json.loads(raw_json)
                if "response" not in parsed or not isinstance(parsed["response"], str):
                    raise ValueError("Ollama response missing 'response' string")

                text_response = parsed["response"].strip()
                if os.getenv("DEBUG_LLM", "0") == "1":
                    preview = text_response[:120].replace("\n", " ")
                    print(f"[LLM] provider=ollama model={model} response='{preview}'")
                return text_response
            except Exception as exc:
                if attempt >= max_retries or not _is_retryable_exception(exc):
                    raise
                time.sleep(min(4.0, 1.0 + attempt))

    url = os.getenv("LLM_HTTP_URL")
    if not url:
        raise RuntimeError("LLM_HTTP_URL not configured")
    payload = {
        "prompt": prompt,
        "temperature": float(os.getenv("LLM_TEMPERATURE", "0.2")),
        "max_tokens": int(os.getenv("LLM_MAX_TOKENS", "600")),
        "model": os.getenv("LLM_MODEL", ""),
    }
    data = json.dumps(payload).encode("utf-8")

    headers = {"Content-Type": "application/json"}
    auth = os.getenv("LLM_HTTP_AUTH")
    if auth:
        headers["Authorization"] = auth

    request = urllib.request.Request(url, data=data, headers=headers, method="POST")
    for attempt in range(max_retries + 1):
        try:
            with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                raw = response.read().decode("utf-8")
            if os.getenv("DEBUG_LLM", "0") == "1":
                preview = raw[:120].replace("\n", " ")
                print(f"[LLM] provider=generic response='{preview}'")
            return raw
        except Exception as exc:
            if attempt >= max_retries or not _is_retryable_exception(exc):
                raise
            time.sleep(min(4.0, 1.0 + attempt))

    raise RuntimeError("LLM request failed unexpectedly")


def generate_notes_delta(
    text: str,
    prev_state: dict[str, Any],
    *,
    mode: str = "update",
    rules_draft: dict[str, Any] | None = None,
    memory: str = "",
) -> NotesDeltaPayload:
    prompt = build_prompt(text, prev_state, rules_draft=rules_draft, mode=mode, memory=memory)
    response_format = os.getenv("OPENAI_RESPONSE_FORMAT", "json_object")
    if response_format == "json_schema":
        text_format: dict[str, Any] = {
            "type": "json_schema",
            "name": "notes_delta",
            "description": "Lecture notes delta JSON.",
            "schema": SCHEMA,
            "strict": True,
        }
    else:
        text_format = {"type": "json_object"}

    text_response = _request_llm_text(prompt, response_format=text_format)
    notes_data = _extract_json(text_response)
    required = {"topics", "keyTerms", "questions", "definitions", "steps"}
    if not required.issubset(notes_data.keys()):
        raise ValueError("LLM response missing required keys")

    return NotesDeltaPayload.model_validate(notes_data, strict=True)


def generate_live_notes_json(
    text: str, prev_state: dict[str, Any] | None = None
) -> dict[str, Any]:
    prompt = build_live_prompt(text, prev_state)
    text_response = _request_llm_text(prompt, response_format={"type": "json_object"})
    data = _extract_json_payload(text_response, {"nowTopic", "keyPoints", "defs", "missedCue"})
    if not isinstance(data.get("nowTopic"), str):
        raise ValueError("Live notes missing nowTopic")
    if not isinstance(data.get("keyPoints"), list) or not all(
        isinstance(item, str) for item in data["keyPoints"]
    ):
        raise ValueError("Live notes keyPoints invalid")
    if not isinstance(data.get("defs"), list):
        raise ValueError("Live notes defs invalid")
    for item in data["defs"]:
        if not isinstance(item, dict):
            raise ValueError("Live notes defs invalid")
        if not isinstance(item.get("term"), str) or not isinstance(item.get("def"), str):
            raise ValueError("Live notes defs invalid")
    if not isinstance(data.get("missedCue"), str):
        raise ValueError("Live notes missing missedCue")
    return data


def generate_final_notes_text(full_transcript: str, student_notes: str = "") -> str:
    prepared_transcript = _prepare_final_transcript(full_transcript)
    prompt = build_final_prompt(prepared_transcript, student_notes)
    timeout_seconds = int(os.getenv("FINAL_NOTES_TIMEOUT_SECONDS", "90"))
    max_retries = int(os.getenv("FINAL_NOTES_RETRIES", "2"))
    text_response = _request_llm_text(
        prompt,
        timeout_seconds=timeout_seconds,
        max_retries=max_retries,
    )
    return _cleanup_final_notes_text(text_response)
