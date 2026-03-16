import json
import os
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


def _request_llm_text(prompt: str, *, response_format: dict[str, Any] | None = None) -> str:
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
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                raw_json = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", "ignore")
            if os.getenv("DEBUG_LLM", "0") == "1":
                preview = body[:200].replace("\n", " ")
                print(f"[LLM] provider=openai http_error={exc.code} body='{preview}'")
            raise
        parsed = json.loads(raw_json)
        text_response = _extract_openai_text(parsed).strip()
        if os.getenv("DEBUG_LLM", "0") == "1":
            preview = text_response[:120].replace("\n", " ")
            print(f"[LLM] provider=openai model={model} response='{preview}'")
        return text_response

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
        with urllib.request.urlopen(request, timeout=30) as response:
            raw_json = response.read().decode("utf-8")
        parsed = json.loads(raw_json)
        if "response" not in parsed or not isinstance(parsed["response"], str):
            raise ValueError("Ollama response missing 'response' string")

        text_response = parsed["response"].strip()
        if os.getenv("DEBUG_LLM", "0") == "1":
            preview = text_response[:120].replace("\n", " ")
            print(f"[LLM] provider=ollama model={model} response='{preview}'")
        return text_response

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
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read().decode("utf-8")

    if os.getenv("DEBUG_LLM", "0") == "1":
        preview = raw[:120].replace("\n", " ")
        print(f"[LLM] provider=generic response='{preview}'")

    return raw


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


def generate_final_notes_text(full_transcript: str) -> str:
    prompt = build_final_prompt(full_transcript)
    text_response = _request_llm_text(prompt)
    return text_response.strip()
