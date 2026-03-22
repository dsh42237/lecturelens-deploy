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
        "- If a formula or symbolic relationship matters, write it using inline LaTeX delimiters like $...$.\n"
        "- Keep math inline and compact; do not emit code fences or display-math blocks.\n\n"
        f"SCHEMA:\n{schema_json}\n\n"
        f"PREVIOUS_LIVE_NOTES:\n{prev_json}\n\n"
        f"TRANSCRIPT:\n{transcript}\n"
    )


def build_final_prompt(
    transcript: str, student_notes: str = "", whiteboard_context: str = ""
) -> str:
    student_notes_block = student_notes.strip() or "(none)"
    whiteboard_block = whiteboard_context.strip() or "(none)"
    return (
        "You are a lecture notes editor. Produce a compact, high-signal study sheet in markdown.\n"
        "Do NOT copy sentences verbatim; paraphrase and correct transcript errors.\n"
        "Do NOT invent facts. If uncertain, phrase cautiously.\n"
        "Ignore filler/anchors (greetings, names, thanks, sign-offs, housekeeping).\n\n"
        "If STUDENT_NOTES are provided, treat them as the student's own priorities, confusions, and reminders.\n"
        "Use them to improve emphasis and examples, but do not elevate claims that contradict the transcript.\n"
        "If WHITEBOARD_CONTEXT is provided, use it to recover equations, solve steps, board structure, and diagrams that may be weak in the transcript.\n"
        "Prefer consistent mathematical notation when the board context clearly supports it.\n"
        "Prefer a concise study summary over a long comprehensive rewrite.\n\n"
        "Output MUST be markdown only.\n"
        "Structure:\n"
        "- First line: # Lecture Notes\n"
        "- Add one short subtitle line after the title summarizing the lecture focus\n"
        "- Use 4-6 sections with markdown headings (## Heading)\n"
        "- Each section: 2-4 bullets max\n"
        "- Bullet lines should usually be one sentence or fragment, not paragraphs\n"
        "- Every non-heading content line should be a bullet, quote, code fence, or a single-line equation block\n"
        "- Include Definitions only for truly important terms\n"
        "- Include Examples only if the transcript clearly contains them\n"
        "- Include a Key Equations section only if the lecture clearly includes formulas; keep each equation on a single line using $...$ or $$...$$\n"
        "- Include one mermaid fenced block when a process, relationship, comparison, or solve workflow would genuinely help a student understand the lecture\n"
        "- For math/problem-solving lectures, a simple flowchart or decision tree is acceptable when the transcript clearly describes the steps\n"
        "- Mermaid must use simple ASCII-safe labels only; no LaTeX, unicode arrows, escaped newlines, or special symbols inside node labels or edge labels\n"
        "- Prefer word labels like \"a not equal 1\" instead of symbolic labels like \"a!=1\"\n"
        "- If a correct Mermaid block is uncertain, omit the diagram entirely\n"
        "- End with a short ## Exam Takeaways section of 2-4 bullets\n\n"
        "Compression rules:\n"
        "- Keep only the central ideas, mechanisms, definitions, and examples\n"
        "- Drop repeated points, weak asides, housekeeping, and noisy transcript fragments\n"
        "- If the transcript is noisy, favor concepts that appear clearly or more than once\n"
        "- Aim for roughly 280-520 words total unless the lecture is unusually dense\n"
        "- Student notes should influence emphasis, not add a long separate dump\n\n"
        f"STUDENT_NOTES:\n{student_notes_block}\n\n"
        f"WHITEBOARD_CONTEXT:\n{whiteboard_block}\n\n"
        f"TRANSCRIPT:\n{transcript}\n"
    )
