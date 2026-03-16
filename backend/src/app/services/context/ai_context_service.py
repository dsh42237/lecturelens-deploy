import json
import os
import urllib.request
import urllib.error
from typing import Iterable


def _request_openai_text(prompt: str) -> str:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not configured")
    model = os.getenv("LLM_MODEL", "gpt-5-mini")
    url = "https://api.openai.com/v1/responses"
    payload = {
        "model": model,
        "input": prompt,
    }
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
            print(f"[LLM] context http_error={exc.code} body='{preview}'")
        raise
    parsed = json.loads(raw_json)
    text = parsed.get("output_text")
    if isinstance(text, str) and text.strip():
        return text.strip()
    output = parsed.get("output")
    if isinstance(output, list):
        parts = []
        for item in output:
            if not isinstance(item, dict):
                continue
            content = item.get("content")
            if isinstance(content, list):
                for part in content:
                    if isinstance(part, dict) and part.get("type") in ("output_text", "text"):
                        if isinstance(part.get("text"), str):
                            parts.append(part["text"])
        if parts:
            return "\n".join(parts).strip()
    raise ValueError("OpenAI response missing output text")


def _normalize_list(items: Iterable[str] | None) -> str:
    if not items:
        return "None"
    return "\n".join(f"- {item}" for item in items)


def generate_profile_context(
    full_name: str | None,
    program_name: str | None,
    institution: str | None,
    courses: list[str],
) -> str:
    prompt = (
        "You are helping create a student profile context. Use general knowledge only. "
        "If unsure about specifics, say 'unknown' or 'not sure'.\n\n"
        f"Student name: {full_name or 'N/A'}\n"
        f"Program: {program_name or 'N/A'}\n"
        f"Institution: {institution or 'N/A'}\n"
        f"Courses:\n{_normalize_list(courses)}\n\n"
        "Return a short profile context with: \n"
        "1) A 3-4 sentence summary of the student's academic focus.\n"
        "2) 5-7 bullet points of likely topics or skills.\n"
        "Keep it concise."
    )
    return _request_openai_text(prompt)


def generate_course_context(course_code: str, course_name: str, institution: str | None) -> str:
    prompt = (
        "You are providing a short course context for a student. Use general knowledge only. "
        "If unsure, say 'unknown' rather than inventing.\n\n"
        f"Institution: {institution or 'N/A'}\n"
        f"Course: {course_code} - {course_name}\n\n"
        "Return:\n"
        "- A 2-3 sentence summary of typical course coverage.\n"
        "- 5-8 bullet points of likely topics or units.\n"
        "- 3-5 suggested study resources (generic)."
    )
    return _request_openai_text(prompt)
