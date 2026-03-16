import json
from typing import Any

SYSTEM_PROMPT = (
    "You are a lecture notes assistant. Return ONLY valid JSON that matches the schema. "
    "Do not include any extra text, markdown, or commentary. "
    "Do NOT copy sentences. Paraphrase."
)

LIVE_NOTES_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "nowTopic": {"type": "string"},
        "keyPoints": {"type": "array", "items": {"type": "string"}},
        "defs": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"term": {"type": "string"}, "def": {"type": "string"}},
                "required": ["term", "def"],
            },
        },
        "missedCue": {"type": "string"},
    },
    "required": ["nowTopic", "keyPoints", "defs", "missedCue"],
}

SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "topics": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "bullets": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["title", "bullets"],
            },
        },
        "keyTerms": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "term": {"type": "string"},
                    "weight": {"type": "number"},
                },
                "required": ["term", "weight"],
            },
        },
        "questions": {"type": "array", "items": {"type": "string"}},
        "definitions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "term": {"type": "string"},
                    "definition": {"type": "string"},
                },
                "required": ["term", "definition"],
            },
        },
        "steps": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["topics", "keyTerms", "questions", "definitions", "steps"],
}


def build_prompt(
    transcript: str,
    prev_state: dict[str, Any],
    *,
    rules_draft: dict[str, Any] | None = None,
    mode: str = "update",
    memory: str = "",
) -> str:
    schema_json = json.dumps(SCHEMA, indent=2)
    prev_json = json.dumps(prev_state, ensure_ascii=False)
    rules_json = json.dumps(rules_draft or {}, ensure_ascii=False)
    memory_block = memory.strip()
    if not memory_block:
        memory_block = "N/A"
    if mode == "warmup":
        mode_instruction = (
            "Mode: WARMUP. Build an initial structure from the new transcript. "
            "Create a coherent baseline without copying sentences.\n"
        )
    elif mode == "final":
        mode_instruction = (
            "Mode: FINAL. Produce a coherent final structured set within constraints.\n"
        )
    else:
        mode_instruction = (
            "Mode: UPDATE. Preserve existing topics; only add/merge when new information appears. "
            "Do not rewrite everything.\n"
        )
    return (
        f"{SYSTEM_PROMPT}\n\n"
        f"{mode_instruction}"
        "Return notes_delta for the NEW transcript segment only. "
        "Use the previous state to avoid duplicates. "
        "Keep bullets concise and factual.\n\n"
        "Constraints:\n"
        "- Output STRICT JSON only (no markdown, no code fences).\n"
        "- Topics: 4-8 total.\n"
        "- Bullets per topic: 2-4, each <= 14 words.\n"
        "- keyTerms: 8-16 concise items.\n"
        "- questions: 3-6 conceptual questions (no quotes or filler).\n"
        "- definitions: 3-8 short.\n"
        "- steps: 3-8 actionable.\n"
        "- Ignore filler/anchors (greetings, names, thanks, sign-offs).\n\n"
        f"SCHEMA:\n{schema_json}\n\n"
        f"PREVIOUS_STATE:\n{prev_json}\n\n"
        f"MEMORY:\n{memory_block}\n\n"
        f"RULES_DRAFT:\n{rules_json}\n\n"
        f"TRANSCRIPT:\n{transcript}\n"
    )


def build_live_prompt(transcript: str, prev_state: dict[str, Any] | None = None) -> str:
    schema_json = json.dumps(LIVE_NOTES_SCHEMA, indent=2)
    prev_json = json.dumps(prev_state or {}, ensure_ascii=False)
    return (
        "You are a live lecture companion. Return ONLY valid JSON that matches the schema. "
        "Do not include any extra text, markdown, or commentary. "
        "Do NOT copy sentences. Paraphrase.\n\n"
        "Mode: LIVE. Keep the output brief, in-the-moment, and helpful.\n"
        "Ignore filler/anchors (greetings, names, thanks, sign-offs, housekeeping).\n"
        "Constraints:\n"
        "- nowTopic: short (2-6 words).\n"
        "- keyPoints: 1-6 bullets, each <= 12 words.\n"
        "- defs: up to 4 concise term/definition pairs.\n"
        "- missedCue: one short line beginning with \"If you missed it:\".\n\n"
        f"SCHEMA:\n{schema_json}\n\n"
        f"PREVIOUS_LIVE_NOTES:\n{prev_json}\n\n"
        f"TRANSCRIPT:\n{transcript}\n"
    )


def build_final_prompt(transcript: str) -> str:
    return (
        "You are a lecture notes editor. Produce a polished study document.\n"
        "Do NOT copy sentences verbatim; paraphrase and correct transcript errors.\n"
        "Do NOT invent facts. If uncertain, phrase cautiously.\n"
        "Ignore filler/anchors (greetings, names, thanks, sign-offs, housekeeping).\n\n"
        "Output MUST be plain text (no JSON, no markdown fences).\n"
        "Structure:\n"
        "- First line: Lecture Notes\n"
        "- 4-8 sections with headings\n"
        "- Include a Definitions section\n"
        "- Include an Examples section if possible\n"
        "- End with a short Exam takeaways section\n\n"
        f"TRANSCRIPT:\n{transcript}\n"
    )
