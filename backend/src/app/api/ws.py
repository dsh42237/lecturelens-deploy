import asyncio
import base64
import json
import os
import re
import time
from collections import Counter, deque
from difflib import SequenceMatcher
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Optional

import cv2
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketDisconnect as StarletteWebSocketDisconnect

from app.core.events import build_event
from datetime import datetime

from app.core.schemas import (
    DefinitionItem,
    KeyTerm,
    NotesDeltaPayload,
    NotesTopicDelta,
    StatusPayload,
    WhiteboardInsightPayload,
)
from app.core.db import get_db
from app.core.security import decode_token
from app.services.stt.whisper_service import transcribe
from app.services.vad.silero_vad_service import create_vad_iterator
from app.services.notes.notes_llm_service import generate_final_notes_text, generate_live_notes_json
from app.services.notes.normalize import normalize_notes_state
from app.services.vision.whiteboard_service import analyze_whiteboard_image_bytes, build_whiteboard_context

router = APIRouter()
SESSION_CLIENTS: dict[str, set[WebSocket]] = {}
SESSION_RUNNING: dict[str, bool] = {}
SESSION_FINALIZE_TASKS: dict[str, asyncio.Task] = {}
SESSION_TRANSCRIPT_BUFFER: dict[str, str] = {}
SESSION_LIVE_PENDING: dict[str, str] = {}
SESSION_LIVE_STATE: dict[str, dict[str, Any]] = {}
SESSION_LIVE_HISTORY: dict[str, list[dict[str, Any]]] = {}
SESSION_WHITEBOARD_INSIGHTS: dict[str, list[dict[str, Any]]] = {}
SESSION_WHITEBOARD_SIGNATURES: dict[str, np.ndarray] = {}
SESSION_WHITEBOARD_LAST_ANALYSIS: dict[str, float] = {}
SESSION_WHITEBOARD_TASKS: dict[str, asyncio.Task] = {}
MOBILE_LINK_SCOPE = "mobile_link"

SESSION_COOKIE_NAME = "session"

TARGET_SAMPLE_RATE = 16000
RING_MAX_MS = 500
MAX_SPEECH_MS = 30000
VAD_FRAME_SAMPLES = 512
NOTES_INTERVAL_SEC = int(os.getenv("NOTES_TICK_SECONDS", "15"))
LIVE_NOTES_INTERVAL_SECONDS = int(os.getenv("LIVE_NOTES_INTERVAL_SECONDS", "10"))
MIN_NOTES_CHARS = 30
MAX_TOPICS = 8
MAX_BULLETS = 4
MAX_KEY_TERMS = 18
KEYTERM_DECAY = 0.85
WARMUP_MIN_CHARS = int(os.getenv("WARMUP_MIN_CHARS", os.getenv("FIRST_LLM_MIN_CHARS", "1200")))
UPDATE_MIN_CHARS = int(os.getenv("UPDATE_MIN_CHARS", os.getenv("MIN_NEW_CHARS_FOR_LLM", "400")))
MAX_INPUT_NEW_CHARS = int(os.getenv("MAX_INPUT_NEW_CHARS", os.getenv("MAX_LLM_CHARS", "1800")))
MAX_WAIT_SECONDS = int(os.getenv("MAX_WAIT_SECONDS", "45"))
MIN_TIME_FALLBACK_CHARS = int(os.getenv("MIN_TIME_FALLBACK_CHARS", "250"))
MEMORY_MAX_CHARS = int(os.getenv("MEMORY_MAX_CHARS", "1200"))
MAX_LIVE_NOTES_CHARS = int(os.getenv("MAX_LIVE_NOTES_CHARS", "1200"))
MAX_FINAL_TRANSCRIPT_CHARS = int(os.getenv("MAX_FINAL_TRANSCRIPT_CHARS", "12000"))
MAX_STUDENT_NOTES_CHARS = int(os.getenv("MAX_STUDENT_NOTES_CHARS", "4000"))
RECONNECT_GRACE_SECONDS = int(os.getenv("SESSION_RECONNECT_GRACE_SECONDS", "20"))
LLM_EVERY_N_BATCHES = int(os.getenv("LLM_EVERY_N_BATCHES", "2"))
DISABLE_RULES = os.getenv("DISABLE_RULES", "0") == "1"
WHITEBOARD_ANALYSIS_INTERVAL_SECONDS = int(os.getenv("WHITEBOARD_ANALYSIS_INTERVAL_SECONDS", "90"))
WHITEBOARD_MIN_CHANGE_RATIO = float(os.getenv("WHITEBOARD_MIN_CHANGE_RATIO", "0.025"))
WHITEBOARD_MAX_INSIGHTS = int(os.getenv("WHITEBOARD_MAX_INSIGHTS", "6"))


@dataclass
class SessionState:
    running: bool = False
    user_id: int | None = None
    course_id: int | None = None
    capture_source: str = "desktop"
    playback_speed: float = 1.0
    vad_iterator: Any = None
    ring: deque[np.ndarray] = field(default_factory=deque)
    ring_samples: int = 0
    in_speech: bool = False
    speech_chunks: list[np.ndarray] = field(default_factory=list)
    speech_samples: int = 0
    pending: np.ndarray = field(default_factory=lambda: np.zeros(0, dtype=np.float32))
    transcript: list[tuple[int, str]] = field(default_factory=list)
    last_notes_index: int = 0
    topic_order: list[str] = field(default_factory=list)
    topic_bullets: dict[str, list[str]] = field(default_factory=dict)
    keyterm_weights: dict[str, float] = field(default_factory=dict)
    questions: list[str] = field(default_factory=list)
    definitions: dict[str, str] = field(default_factory=dict)
    steps: list[str] = field(default_factory=list)
    notes_batch_index: int = 0
    llm_initialized: bool = False
    llm_warmup_buffer: str = ""
    pending_notes_text: str = ""
    last_llm_ts: float = 0.0
    notes_memory: str = ""
    live_notes_state: dict[str, Any] = field(default_factory=dict)
    live_notes_history: list[dict[str, Any]] = field(default_factory=list)
    final_notes_text: str = ""
    final_notes_ready: bool = False
    transcript_full_buffer: str = ""
    live_notes_pending_text: str = ""
    processed_audio_ms: int = 0
    last_live_notes_audio_ms: int = 0
    last_progress_event_audio_ms: int = 0
    live_notes_audio_interval_ms: int = LIVE_NOTES_INTERVAL_SECONDS * 1000
    max_speech_ms: int = MAX_SPEECH_MS
    last_not_started_notice_ts: float = 0.0
    mobile_attached: bool = False
    student_notes_text: str = ""


def reset_state(state: SessionState) -> None:
    state.ring.clear()
    state.ring_samples = 0
    state.in_speech = False
    state.speech_chunks = []
    state.speech_samples = 0
    state.pending = np.zeros(0, dtype=np.float32)
    state.transcript = []
    state.last_notes_index = 0
    state.topic_order = []
    state.topic_bullets = {}
    state.keyterm_weights = {}
    state.questions = []
    state.definitions = {}
    state.steps = []
    state.notes_batch_index = 0
    state.llm_initialized = False
    state.llm_warmup_buffer = ""
    state.pending_notes_text = ""
    state.last_llm_ts = time.time()
    state.notes_memory = ""
    state.live_notes_state = {}
    state.live_notes_history = []
    state.final_notes_text = ""
    state.final_notes_ready = False
    state.transcript_full_buffer = ""
    state.live_notes_pending_text = ""
    state.processed_audio_ms = 0
    state.last_live_notes_audio_ms = 0
    state.last_progress_event_audio_ms = 0
    state.live_notes_audio_interval_ms = LIVE_NOTES_INTERVAL_SECONDS * 1000
    state.max_speech_ms = MAX_SPEECH_MS
    state.course_id = None
    state.capture_source = "desktop"
    state.playback_speed = 1.0
    state.student_notes_text = ""
    if state.vad_iterator is not None and hasattr(state.vad_iterator, "reset_states"):
        state.vad_iterator.reset_states()


def get_user_id_from_cookie(websocket: WebSocket) -> int | None:
    token = websocket.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        return None
    try:
        payload = decode_token(token)
    except Exception:
        return None
    user_id = payload.get("sub")
    try:
        return int(user_id)
    except Exception:
        return None


def get_user_id_from_mobile_token(token: str, session_id: str) -> int | None:
    try:
        payload = decode_token(token)
    except Exception:
        return None

    if payload.get("scope") != MOBILE_LINK_SCOPE:
        return None
    if str(payload.get("sid")) != session_id:
        return None
    nonce = payload.get("nonce")
    user_id = payload.get("sub")
    try:
        user_id_int = int(user_id)
        nonce_int = int(nonce)
    except Exception:
        return None

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT mobile_link_nonce FROM users WHERE id = %s",
                (user_id_int,),
            )
            row = cur.fetchone()
    if not row:
        return None
    if int(row["mobile_link_nonce"] or 0) != nonce_int:
        return None
    return user_id_int


def append_ring(state: SessionState, chunk: np.ndarray) -> None:
    state.ring.append(chunk)
    state.ring_samples += int(chunk.size)
    max_samples = int((RING_MAX_MS / 1000) * TARGET_SAMPLE_RATE)
    while state.ring_samples > max_samples and state.ring:
        removed = state.ring.popleft()
        state.ring_samples -= int(removed.size)


def finalize_speech(state: SessionState) -> Optional[np.ndarray]:
    if state.speech_samples <= 0:
        state.in_speech = False
        state.speech_chunks = []
        state.speech_samples = 0
        return None
    segment = np.concatenate(state.speech_chunks).astype(np.float32, copy=False)
    state.in_speech = False
    state.speech_chunks = []
    state.speech_samples = 0
    return segment


def process_vad_chunk(state: SessionState, chunk: np.ndarray) -> Optional[np.ndarray]:
    append_ring(state, chunk)
    vad_event = None
    if state.vad_iterator is not None:
        try:
            vad_event = state.vad_iterator(chunk)
        except Exception:
            vad_event = None

    started_now = False
    if isinstance(vad_event, dict) and "start" in vad_event:
        state.in_speech = True
        started_now = True
        state.speech_chunks = list(state.ring)
        state.speech_samples = state.ring_samples

    if state.in_speech and not started_now:
        state.speech_chunks.append(chunk)
        state.speech_samples += int(chunk.size)

    if isinstance(vad_event, dict) and "end" in vad_event:
        return finalize_speech(state)

    max_speech_samples = int((state.max_speech_ms / 1000) * TARGET_SAMPLE_RATE)
    if state.in_speech and state.speech_samples >= max_speech_samples:
        return finalize_speech(state)

    return None


def resample_linear(audio: np.ndarray, original_rate: int, target_rate: int) -> np.ndarray:
    if original_rate == target_rate:
        return audio.astype(np.float32, copy=False)
    if audio.size == 0:
        return audio.astype(np.float32, copy=False)

    duration = audio.size / float(original_rate)
    target_length = max(1, int(round(duration * target_rate)))
    x_old = np.linspace(0.0, 1.0, num=audio.size, endpoint=False)
    x_new = np.linspace(0.0, 1.0, num=target_length, endpoint=False)
    return np.interp(x_new, x_old, audio).astype(np.float32)


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def dedupe_bullets(existing: list[str], new_bullets: list[str], threshold: float = 0.82) -> list[str]:
    result = list(existing)
    for bullet in new_bullets:
        if not bullet:
            continue
        if any(similarity(bullet, prev) >= threshold for prev in result):
            continue
        result.append(bullet)
    return result


def extract_keywords(text: str, limit: int = 5) -> list[str]:
    stopwords = {
        "the",
        "and",
        "that",
        "this",
        "with",
        "from",
        "they",
        "have",
        "will",
        "your",
        "you",
        "for",
        "are",
        "was",
        "were",
        "but",
        "not",
        "all",
        "any",
        "can",
        "has",
        "had",
        "its",
        "our",
        "out",
        "into",
        "over",
        "about",
        "also",
        "just",
        "use",
        "using",
        "used",
        "useful",
        "more",
        "most",
        "some",
        "such",
        "than",
        "then",
        "when",
        "what",
        "where",
        "which",
        "while",
        "who",
        "why",
        "how",
        "a",
        "an",
        "to",
        "of",
        "in",
        "on",
        "at",
        "is",
        "it",
        "as",
        "by",
        "be",
        "or",
        "if",
    }
    words = re.findall(r"[a-zA-Z][a-zA-Z']+", text.lower())
    filtered = [w for w in words if len(w) > 2 and w not in stopwords]
    counts = Counter(filtered)
    return [word for word, _count in counts.most_common(limit)]


def extract_keyword_counts(text: str) -> Counter:
    stopwords = {
        "the",
        "and",
        "that",
        "this",
        "with",
        "from",
        "they",
        "have",
        "will",
        "your",
        "you",
        "for",
        "are",
        "was",
        "were",
        "but",
        "not",
        "all",
        "any",
        "can",
        "has",
        "had",
        "its",
        "our",
        "out",
        "into",
        "over",
        "about",
        "also",
        "just",
        "use",
        "using",
        "used",
        "useful",
        "more",
        "most",
        "some",
        "such",
        "than",
        "then",
        "when",
        "what",
        "where",
        "which",
        "while",
        "who",
        "why",
        "how",
        "a",
        "an",
        "to",
        "of",
        "in",
        "on",
        "at",
        "is",
        "it",
        "as",
        "by",
        "be",
        "or",
        "if",
    }
    words = re.findall(r"[a-zA-Z][a-zA-Z']+", text.lower())
    filtered = [w for w in words if len(w) > 2 and w not in stopwords]
    return Counter(filtered)


def extract_definitions(text: str) -> list[DefinitionItem]:
    matches = re.findall(
        r"\b([A-Za-z][A-Za-z\s]{1,40})\s+(is|means|defined as)\s+([^.!?]+)",
        text,
        flags=re.IGNORECASE,
    )
    definitions = []
    for term, _verb, definition in matches:
        term_clean = term.strip().title()
        definition_clean = definition.strip()
        if term_clean and definition_clean:
            definitions.append(DefinitionItem(term=term_clean, definition=definition_clean))
    return definitions


def extract_steps(text: str) -> list[str]:
    step_tokens = {"first", "second", "third", "then", "next", "finally", "last"}
    sentences = [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]
    steps = []
    for sentence in sentences:
        lower = sentence.lower()
        if any(token in lower.split() for token in step_tokens):
            steps.append(sentence)
    return steps


def build_notes_summary(text: str) -> tuple[str, list[str], list[str], list[str], list[DefinitionItem], list[str]]:
    keywords = extract_keywords(text)
    topic_title = " / ".join(keywords[:2]) if keywords else "Lecture Notes"

    sentences = [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]
    bullets = sentences[:3] if sentences else [text.strip()]

    questions = [q.strip() for q in re.findall(r"[^?]+\?", text) if q.strip().endswith("?")]
    definitions = extract_definitions(text)
    steps = extract_steps(text)
    return topic_title, bullets, keywords, questions, definitions, steps


def apply_delta_to_state(state: SessionState, delta: NotesDeltaPayload) -> None:
    for term in list(state.keyterm_weights.keys()):
        state.keyterm_weights[term] *= KEYTERM_DECAY
        if state.keyterm_weights[term] < 0.1:
            state.keyterm_weights.pop(term, None)

    if delta.topics:
        for topic in delta.topics:
            title = topic.title.strip() or "Lecture Notes"
            if title not in state.topic_bullets:
                state.topic_bullets[title] = []
                state.topic_order.append(title)
            if topic.bullets:
                state.topic_bullets[title] = dedupe_bullets(
                    state.topic_bullets[title], topic.bullets
                )[:MAX_BULLETS]

    if len(state.topic_order) > MAX_TOPICS:
        overflow = state.topic_order[:-MAX_TOPICS]
        for title in overflow:
            state.topic_bullets.pop(title, None)
        state.topic_order = state.topic_order[-MAX_TOPICS:]

    if delta.keyTerms:
        for item in delta.keyTerms:
            state.keyterm_weights[item.term] = state.keyterm_weights.get(item.term, 0.0) + item.weight

    if delta.questions:
        for question in delta.questions:
            if question not in state.questions:
                state.questions.append(question)

    if delta.definitions:
        for definition in delta.definitions:
            state.definitions[definition.term] = definition.definition

    if delta.steps:
        for step in delta.steps:
            if step not in state.steps:
                state.steps.append(step)


def build_payload_from_state(state: SessionState) -> NotesDeltaPayload:
    top_terms = sorted(
        state.keyterm_weights.items(), key=lambda item: item[1], reverse=True
    )[:MAX_KEY_TERMS]
    key_term_items = [KeyTerm(term=term, weight=round(weight, 2)) for term, weight in top_terms]

    return NotesDeltaPayload(
        topics=[
            NotesTopicDelta(title=title, bullets=state.topic_bullets[title])
            for title in state.topic_order
        ],
        keyTerms=key_term_items,
        questions=state.questions,
        definitions=[
            DefinitionItem(term=term, definition=definition)
            for term, definition in state.definitions.items()
        ],
        steps=state.steps,
    )


def build_prev_state(state: SessionState) -> dict[str, Any]:
    top_terms = sorted(
        state.keyterm_weights.items(), key=lambda item: item[1], reverse=True
    )[:MAX_KEY_TERMS]
    return {
        "topics": [
            {"title": title, "bullets": state.topic_bullets.get(title, [])}
            for title in state.topic_order
        ],
        "keyTerms": [{"term": term, "weight": round(weight, 2)} for term, weight in top_terms],
        "questions": state.questions,
        "definitions": [
            {"term": term, "definition": definition}
            for term, definition in state.definitions.items()
        ],
        "steps": state.steps,
    }


def build_compact_prev_state(state: SessionState) -> dict[str, Any]:
    top_terms = sorted(
        state.keyterm_weights.items(), key=lambda item: item[1], reverse=True
    )[:12]
    return {
        "topics": [
            {"title": title, "bullets": state.topic_bullets.get(title, [])[:3]}
            for title in state.topic_order[-6:]
        ],
        "keyTerms": [{"term": term, "weight": round(weight, 2)} for term, weight in top_terms],
        "questions": state.questions[-5:],
        "definitions": [
            {"term": term, "definition": definition}
            for term, definition in list(state.definitions.items())[-5:]
        ],
        "steps": state.steps[-5:],
    }


def build_rules_draft_context(rules_delta: NotesDeltaPayload) -> dict[str, Any]:
    topic = rules_delta.topics[0] if rules_delta.topics else None
    return {
        "topic": {
            "title": topic.title if topic else "Lecture Notes",
            "bullets": (topic.bullets or [])[:4] if topic else [],
        },
        "keyTerms": [item.term for item in (rules_delta.keyTerms or [])][:10],
        "questions": (rules_delta.questions or [])[:5],
    }


def is_filler_line(text: str) -> bool:
    trimmed = text.strip().lower()
    if not trimmed:
        return True
    stop = {"ok", "okay", "thanks", "thank", "you", "um", "uh", "yeah"}
    words = [w for w in re.findall(r"[a-zA-Z']+", trimmed)]
    if len(words) <= 2 and all(word in stop for word in words):
        return True
    return False


def update_notes_memory(state: SessionState, delta: NotesDeltaPayload, mode: str) -> None:
    lines: list[str] = []
    topics = delta.topics or []
    if mode == "warmup" or mode == "final":
        for topic in topics[:4]:
            if topic.bullets:
                lines.append(f"Topic: {topic.title} — {topic.bullets[0]}")
            else:
                lines.append(f"Topic: {topic.title}")
    else:
        for topic in topics[:2]:
            if topic.bullets:
                lines.append(f"Update: {topic.title} — {topic.bullets[0]}")
    if not lines and delta.keyTerms:
        terms = ", ".join(item.term for item in delta.keyTerms[:6])
        lines.append(f"Key terms: {terms}")
    if not lines and delta.questions:
        lines.append(f"Question: {delta.questions[0]}")

    if lines:
        if state.notes_memory:
            state.notes_memory = f"{state.notes_memory}\n" + "\n".join(lines)
        else:
            state.notes_memory = "\n".join(lines)
        if len(state.notes_memory) > MEMORY_MAX_CHARS:
            state.notes_memory = state.notes_memory[-MEMORY_MAX_CHARS:]


def apply_normalized_state(state: SessionState, notes: NotesDeltaPayload) -> None:
    state.topic_order = []
    state.topic_bullets = {}
    for topic in notes.topics or []:
        state.topic_order.append(topic.title)
        state.topic_bullets[topic.title] = list(topic.bullets or [])
    state.keyterm_weights = {item.term: item.weight for item in notes.keyTerms or []}
    state.questions = list(notes.questions or [])
    state.definitions = {item.term: item.definition for item in notes.definitions or []}
    state.steps = list(notes.steps or [])


def register_client(session_id: str, websocket: WebSocket) -> None:
    pending = SESSION_FINALIZE_TASKS.pop(session_id, None)
    if pending and not pending.done():
        pending.cancel()
    clients = SESSION_CLIENTS.setdefault(session_id, set())
    clients.add(websocket)


def unregister_client(session_id: str, websocket: WebSocket) -> None:
    clients = SESSION_CLIENTS.get(session_id)
    if not clients:
        return
    clients.discard(websocket)
    if not clients:
        SESSION_CLIENTS.pop(session_id, None)


async def safe_send_json(websocket: WebSocket, payload: dict) -> bool:
    try:
        await websocket.send_json(payload)
        return True
    except WebSocketDisconnect:
        return False
    except Exception:
        return False


async def broadcast_session_event(session_id: str, payload: dict) -> bool:
    clients = list(SESSION_CLIENTS.get(session_id, set()))
    if not clients:
        return False
    ok_any = False
    stale: list[WebSocket] = []
    for client in clients:
        ok = await safe_send_json(client, payload)
        if ok:
            ok_any = True
        else:
            stale.append(client)
    for client in stale:
        unregister_client(session_id, client)
    return ok_any


def build_final_fallback_notes(
    transcript: str, student_notes: str = "", whiteboard_context: str = ""
) -> str:
    combined_source = transcript.strip() or whiteboard_context.strip() or student_notes.strip()
    sentences = [s.strip() for s in re.split(r"[.!?]+", combined_source) if s.strip()]
    topic_title, bullets, _terms, _questions, definitions, _steps = build_notes_summary(combined_source)
    lines = [
        "# Lecture Notes",
        "",
        f"Compact review of {topic_title.lower()}.",
        "",
        "## Overview",
        f"- Topic focus: {topic_title}",
    ]
    for bullet in bullets[:4]:
        lines.append(f"- {bullet}")
    if student_notes.strip():
        lines.append("")
        lines.append("## Student Focus")
        for note_line in [line.strip() for line in student_notes.splitlines() if line.strip()][:4]:
            lines.append(f"- {note_line}")
    if whiteboard_context.strip():
        whiteboard_lines = [line.strip(" -") for line in whiteboard_context.splitlines() if line.strip()]
        if whiteboard_lines:
            lines.append("")
            lines.append("## Whiteboard Clues")
            for line in whiteboard_lines[:5]:
                lines.append(f"- {line}")
    if definitions:
        lines.append("")
        lines.append("## Definitions")
        for item in definitions[:4]:
            lines.append(f"- {item.term}: {item.definition}")
    if len(sentences) > 6:
        lines.append("")
        lines.append("## Exam Takeaways")
        for sentence in sentences[-3:]:
            lines.append(f"- {sentence}")
    return "\n".join(lines)


def estimate_audio_ms_from_text(text: str) -> int:
    words = re.findall(r"\b[\w'-]+\b", text)
    if not words:
        return 0
    words_per_minute = 145
    estimated_ms = int((len(words) / words_per_minute) * 60_000)
    return max(4000, estimated_ms)


def chunk_transcript_text(
    text: str, target_words: int = 180, max_words: int = 240
) -> list[str]:
    normalized = re.sub(r"\r\n?", "\n", text).strip()
    if not normalized:
        return []

    units = [
        re.sub(r"\s+", " ", part).strip()
        for part in re.split(r"\n+|(?<=[.!?])\s+", normalized)
        if part.strip()
    ]
    chunks: list[str] = []
    current: list[str] = []
    current_words = 0

    def flush_current() -> None:
        nonlocal current, current_words
        if current:
            chunks.append(" ".join(current).strip())
            current = []
            current_words = 0

    for unit in units:
        words = unit.split()
        if len(words) > max_words:
            flush_current()
            start = 0
            while start < len(words):
                piece = words[start : start + target_words]
                chunks.append(" ".join(piece))
                start += target_words
            continue

        if current and current_words + len(words) > target_words:
            flush_current()

        current.append(unit)
        current_words += len(words)

    flush_current()

    return chunks


def append_live_notes_history(state: SessionState, notes: dict[str, Any]) -> dict[str, Any]:
    entry = {"timestamp": int(time.time() * 1000), "notes": notes}
    state.live_notes_history.append(entry)
    if len(state.live_notes_history) > 80:
        state.live_notes_history = state.live_notes_history[-80:]
    return entry


def persist_live_notes_history(state: SessionState, session_id: str) -> None:
    if state.user_id is None:
        return
    history = SESSION_LIVE_HISTORY.get(session_id, state.live_notes_history)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE sessions SET live_notes_history = %s WHERE id = %s AND user_id = %s",
                (json.dumps(history), session_id, state.user_id),
            )


def configure_session_mode(state: SessionState, capture_source: str, playback_speed: float) -> None:
    normalized_source = capture_source if capture_source in {"desktop", "phone", "simulator"} else "desktop"
    normalized_speed = playback_speed if playback_speed > 0 else 1.0
    state.capture_source = normalized_source
    state.playback_speed = normalized_speed
    if normalized_source == "simulator":
        state.max_speech_ms = 8000
        state.live_notes_audio_interval_ms = min(
            60000, max(10000, int(4000 * normalized_speed))
        )
    else:
        state.max_speech_ms = MAX_SPEECH_MS
        state.live_notes_audio_interval_ms = LIVE_NOTES_INTERVAL_SECONDS * 1000


def build_camera_signature(image_bytes: bytes) -> np.ndarray | None:
    np_bytes = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(np_bytes, cv2.IMREAD_GRAYSCALE)
    if image is None:
        return None
    resized = cv2.resize(image, (48, 48), interpolation=cv2.INTER_AREA)
    blurred = cv2.GaussianBlur(resized, (5, 5), 0)
    return blurred.astype(np.float32) / 255.0


def camera_frame_changed(previous: np.ndarray | None, current: np.ndarray | None) -> bool:
    if previous is None or current is None:
        return True
    delta = np.mean(np.abs(previous - current))
    return float(delta) >= WHITEBOARD_MIN_CHANGE_RATIO


async def await_pending_whiteboard_analysis(session_id: str) -> None:
    pending = SESSION_WHITEBOARD_TASKS.get(session_id)
    if not pending or pending.done() or pending is asyncio.current_task():
        return
    try:
        await asyncio.wait_for(asyncio.shield(pending), timeout=25)
    except (asyncio.TimeoutError, asyncio.CancelledError):
        return
    except Exception:
        return


async def maybe_schedule_whiteboard_analysis(
    *,
    session_id: str,
    state: SessionState,
    image_b64: str,
    mime_type: str,
    broadcast: Callable[[dict], Awaitable[bool]],
) -> None:
    if state.capture_source != "phone" or not state.running:
        return
    if os.getenv("OPENAI_API_KEY", "").strip() == "":
        return

    now = time.time()
    last_analysis = SESSION_WHITEBOARD_LAST_ANALYSIS.get(session_id, 0.0)
    if now - last_analysis < WHITEBOARD_ANALYSIS_INTERVAL_SECONDS:
        return

    existing_task = SESSION_WHITEBOARD_TASKS.get(session_id)
    if existing_task and not existing_task.done():
        return

    try:
        image_bytes = base64.b64decode(image_b64, validate=True)
    except Exception:
        return

    current_signature = build_camera_signature(image_bytes)
    previous_signature = SESSION_WHITEBOARD_SIGNATURES.get(session_id)
    if previous_signature is not None and not camera_frame_changed(previous_signature, current_signature):
        return

    SESSION_WHITEBOARD_SIGNATURES[session_id] = current_signature
    SESSION_WHITEBOARD_LAST_ANALYSIS[session_id] = now
    await broadcast(
        build_event(
            "whiteboard_insight",
            session_id,
            WhiteboardInsightPayload(status="analyzing", captureTimestamp=int(now * 1000)),
        ).model_dump()
    )

    async def run_analysis() -> None:
        try:
            insight = await asyncio.to_thread(analyze_whiteboard_image_bytes, image_bytes, mime_type)
            insight["captureTimestamp"] = int(time.time() * 1000)
            history = SESSION_WHITEBOARD_INSIGHTS.setdefault(session_id, [])
            summary_key = " ".join(
                [
                    str(insight.get("title") or "").strip().lower(),
                    str(insight.get("summary") or "").strip().lower(),
                ]
            ).strip()
            previous_key = ""
            if history:
                latest = history[-1]
                previous_key = " ".join(
                    [
                        str(latest.get("title") or "").strip().lower(),
                        str(latest.get("summary") or "").strip().lower(),
                    ]
                ).strip()
            if summary_key and summary_key != previous_key:
                history.append(insight)
                if len(history) > WHITEBOARD_MAX_INSIGHTS:
                    SESSION_WHITEBOARD_INSIGHTS[session_id] = history[-WHITEBOARD_MAX_INSIGHTS:]
            elif not history:
                history.append(insight)
            await broadcast(
                build_event(
                    "whiteboard_insight",
                    session_id,
                    WhiteboardInsightPayload(status="ready", **insight),
                ).model_dump()
            )
        except Exception as exc:
            await broadcast(
                build_event(
                    "whiteboard_insight",
                    session_id,
                    WhiteboardInsightPayload(
                        status="error",
                        error=str(exc),
                        captureTimestamp=int(time.time() * 1000),
                    ),
                ).model_dump()
            )
        finally:
            SESSION_WHITEBOARD_TASKS.pop(session_id, None)

    SESSION_WHITEBOARD_TASKS[session_id] = asyncio.create_task(run_analysis())


def record_transcript_text(state: SessionState, session_id: str, text: str) -> None:
    state.transcript.append((int(time.time() * 1000), text))
    state.transcript_full_buffer = f"{state.transcript_full_buffer} {text}".strip()
    if len(state.transcript_full_buffer) > MAX_FINAL_TRANSCRIPT_CHARS:
        state.transcript_full_buffer = state.transcript_full_buffer[-MAX_FINAL_TRANSCRIPT_CHARS:]
    shared_buffer = f"{SESSION_TRANSCRIPT_BUFFER.get(session_id, '')} {text}".strip()
    if len(shared_buffer) > MAX_FINAL_TRANSCRIPT_CHARS:
        shared_buffer = shared_buffer[-MAX_FINAL_TRANSCRIPT_CHARS:]
    SESSION_TRANSCRIPT_BUFFER[session_id] = shared_buffer
    if not is_filler_line(text):
        state.live_notes_pending_text = f"{state.live_notes_pending_text} {text}".strip()
        SESSION_LIVE_PENDING[session_id] = f"{SESSION_LIVE_PENDING.get(session_id, '')} {text}".strip()


async def transcribe_segment(
    segment: np.ndarray,
    session_id: str,
    safe_send: Callable[[dict], Awaitable[bool]],
    state: SessionState,
) -> None:
    if segment.size == 0:
        return
    segment_ms = int((segment.size / TARGET_SAMPLE_RATE) * 1000)
    text = transcribe(segment, TARGET_SAMPLE_RATE)
    transcript_payload = {"text": text, "source": "whisper", "segmentMs": segment_ms}
    await safe_send(build_event("transcript_final", session_id, transcript_payload).model_dump())

    if text:
        record_transcript_text(state, session_id, text)


async def flush_session_audio(
    state: SessionState,
    session_id: str,
    safe_send: Callable[[dict], Awaitable[bool]],
) -> None:
    if state.pending.size > 0 and state.in_speech:
        state.speech_chunks.append(state.pending.astype(np.float32, copy=False))
        state.speech_samples += int(state.pending.size)
        state.pending = np.zeros(0, dtype=np.float32)

    segment: Optional[np.ndarray] = None
    if state.in_speech and state.speech_samples > 0:
        segment = finalize_speech(state)
    elif state.pending.size >= TARGET_SAMPLE_RATE // 2:
        segment = state.pending.astype(np.float32, copy=False)
        state.pending = np.zeros(0, dtype=np.float32)
    else:
        state.pending = np.zeros(0, dtype=np.float32)

    if segment is not None and segment.size > 0:
        await transcribe_segment(segment, session_id, safe_send, state)


async def maybe_emit_simulator_progress(
    state: SessionState,
    session_id: str,
    safe_send: Callable[[dict], Awaitable[bool]],
    force: bool = False,
) -> None:
    if state.capture_source != "simulator":
        return
    if not force and state.processed_audio_ms - state.last_progress_event_audio_ms < 1000:
        return
    state.last_progress_event_audio_ms = state.processed_audio_ms
    await safe_send(
        build_event(
            "simulator_progress",
            session_id,
            {"processedMs": state.processed_audio_ms},
        ).model_dump()
    )


@router.websocket("/ws/session/{session_id}")
async def session_ws(websocket: WebSocket, session_id: str) -> None:
    await websocket.accept()
    register_client(session_id, websocket)
    status_event = build_event("status", session_id, StatusPayload(message="connected"))

    async def safe_send(payload: dict) -> bool:
        return await safe_send_json(websocket, payload)

    async def broadcast(payload: dict) -> bool:
        return await broadcast_session_event(session_id, payload)

    if not await safe_send(status_event.model_dump()):
        return
    if SESSION_RUNNING.get(session_id, False):
        await safe_send(build_event("status", session_id, {"message": "session started"}).model_dump())

    state = SessionState()
    state.user_id = get_user_id_from_cookie(websocket)
    live_notes_task: Optional[asyncio.Task] = None

    async def maybe_emit_live_notes(force: bool = False) -> bool:
        if os.getenv("NOTES_MODE", "llm").lower() != "llm":
            return True
        pending = SESSION_LIVE_PENDING.get(session_id, "").strip()
        if not pending:
            return True
        audio_delta = state.processed_audio_ms - state.last_live_notes_audio_ms
        if not force and audio_delta < state.live_notes_audio_interval_ms:
            return True

        llm_text = pending[-MAX_LIVE_NOTES_CHARS:]
        try:
            live_notes = await asyncio.to_thread(
                generate_live_notes_json, llm_text, SESSION_LIVE_STATE.get(session_id) or None
            )
            SESSION_LIVE_STATE[session_id] = live_notes
            SESSION_LIVE_PENDING[session_id] = ""
            state.live_notes_pending_text = ""
            state.last_live_notes_audio_ms = state.processed_audio_ms
            history = SESSION_LIVE_HISTORY.setdefault(session_id, [])
            history.append({"timestamp": int(time.time() * 1000), "notes": live_notes})
            if len(history) > 80:
                SESSION_LIVE_HISTORY[session_id] = history[-80:]
            persist_live_notes_history(state, session_id)
            return await broadcast(
                build_event("live_notes_delta", session_id, live_notes).model_dump()
            )
        except Exception as exc:
            if os.getenv("DEBUG_LLM", "0") == "1":
                print(f"[LLM] live_notes_failed={exc}")
            return True

    async def finalize_and_persist_session(send_final_event: bool) -> None:
        pending_finalize = SESSION_FINALIZE_TASKS.pop(session_id, None)
        if pending_finalize and pending_finalize is not asyncio.current_task():
            pending_finalize.cancel()
        await await_pending_whiteboard_analysis(session_id)
        final_text: str | None = None
        transcript_text = SESSION_TRANSCRIPT_BUFFER.get(session_id, "").strip()
        student_notes_text = state.student_notes_text.strip()
        whiteboard_context = build_whiteboard_context(SESSION_WHITEBOARD_INSIGHTS.get(session_id, []))
        if not transcript_text:
            transcript_text = state.transcript_full_buffer.strip()

        if transcript_text or student_notes_text or whiteboard_context:
            final_input = transcript_text[-MAX_FINAL_TRANSCRIPT_CHARS:]
            final_student_notes = student_notes_text[:MAX_STUDENT_NOTES_CHARS]
            if os.getenv("NOTES_MODE", "llm").lower() == "llm":
                try:
                    final_text = await asyncio.to_thread(
                        generate_final_notes_text, final_input, final_student_notes, whiteboard_context
                    )
                except Exception as exc:
                    if os.getenv("DEBUG_LLM", "0") == "1":
                        print(f"[LLM] final_notes_failed={exc}")
                    final_text = build_final_fallback_notes(
                        final_input, final_student_notes, whiteboard_context
                    )
            else:
                final_text = build_final_fallback_notes(
                    final_input, final_student_notes, whiteboard_context
                )

        if final_text:
            state.final_notes_text = final_text
            state.final_notes_ready = True
            if send_final_event:
                await broadcast(build_event("final_notes", session_id, {"text": final_text}).model_dump())

        if state.user_id is not None:
            ended_at = datetime.utcnow().isoformat()
            history = SESSION_LIVE_HISTORY.get(session_id, state.live_notes_history)
            transcript_full_text = " ".join(text for _, text in state.transcript).strip()
            with get_db() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE sessions SET ended_at = %s, final_notes_text = %s, student_notes_text = %s, live_notes_history = %s, transcript_text = %s "
                        "WHERE id = %s AND user_id = %s",
                        (
                            ended_at,
                            state.final_notes_text or None,
                            state.student_notes_text or None,
                            json.dumps(history),
                            transcript_full_text or None,
                            session_id,
                            state.user_id,
                        ),
                    )
        SESSION_TRANSCRIPT_BUFFER.pop(session_id, None)
        SESSION_LIVE_PENDING.pop(session_id, None)
        SESSION_LIVE_STATE.pop(session_id, None)
        SESSION_LIVE_HISTORY.pop(session_id, None)
        SESSION_WHITEBOARD_INSIGHTS.pop(session_id, None)
        SESSION_WHITEBOARD_SIGNATURES.pop(session_id, None)
        SESSION_WHITEBOARD_LAST_ANALYSIS.pop(session_id, None)
        task = SESSION_WHITEBOARD_TASKS.pop(session_id, None)
        if task and not task.done() and task is not asyncio.current_task():
            task.cancel()
        SESSION_RUNNING.pop(session_id, None)

    async def live_notes_loop() -> None:
        while state.running:
            await asyncio.sleep(0.5)
            ok = await maybe_emit_live_notes(force=False)
            if not ok:
                break

    try:
        while True:
            try:
                message = await websocket.receive_text()
            except StarletteWebSocketDisconnect as exc:
                if os.getenv("DEBUG_NOTES", "0") == "1":
                    print(f"[WS] disconnect code={exc.code}")
                break
            except RuntimeError:
                break

            try:
                data = json.loads(message)
            except json.JSONDecodeError:
                await safe_send(
                    build_event("error", session_id, {"message": "Invalid JSON message"}).model_dump()
                )
                continue

            message_type = data.get("type")
            if message_type == "mobile_attach":
                payload = data.get("payload") or {}
                mobile_token = payload.get("mobileToken")
                if isinstance(mobile_token, str) and mobile_token:
                    user_id = get_user_id_from_mobile_token(mobile_token, session_id)
                    if user_id is not None:
                        state.user_id = user_id
                        state.mobile_attached = True
                        await safe_send(
                            build_event("status", session_id, {"message": "mobile attached"}).model_dump()
                        )
                        continue
                await safe_send(
                    build_event("error", session_id, {"message": "Invalid mobile token"}).model_dump()
                )
                continue

            if message_type == "start_session":
                payload = data.get("payload") or {}
                if state.user_id is None:
                    mobile_token = payload.get("mobileToken")
                    if isinstance(mobile_token, str) and mobile_token:
                        state.user_id = get_user_id_from_mobile_token(mobile_token, session_id)
                if state.user_id is None:
                    await safe_send(
                        build_event("error", session_id, {"message": "Authentication required"}).model_dump()
                    )
                    continue

                if not SESSION_RUNNING.get(session_id, False):
                    state.running = True
                    state.vad_iterator = create_vad_iterator(sample_rate=TARGET_SAMPLE_RATE)
                    reset_state(state)
                    state.running = True
                    SESSION_RUNNING[session_id] = True
                    if session_id not in SESSION_TRANSCRIPT_BUFFER:
                        SESSION_TRANSCRIPT_BUFFER[session_id] = ""
                    SESSION_LIVE_PENDING[session_id] = ""
                    SESSION_LIVE_STATE[session_id] = {}
                    SESSION_LIVE_HISTORY[session_id] = []
                    SESSION_WHITEBOARD_INSIGHTS.setdefault(session_id, [])
                state.live_notes_history = SESSION_LIVE_HISTORY.setdefault(session_id, [])

                capture_source = payload.get("captureSource")
                playback_speed_raw = payload.get("simulationSpeed", 1.0)
                try:
                    playback_speed = float(playback_speed_raw)
                except Exception:
                    playback_speed = 1.0
                configure_session_mode(
                    state,
                    capture_source if isinstance(capture_source, str) else "desktop",
                    playback_speed,
                )

                course_id = payload.get("courseId")
                if isinstance(course_id, int):
                    state.course_id = course_id
                    with get_db() as conn:
                        with conn.cursor() as cur:
                            cur.execute(
                                "UPDATE sessions SET course_id = %s WHERE id = %s AND user_id = %s",
                                (state.course_id, session_id, state.user_id),
                            )

                state.running = True

                row_exists = False
                with get_db() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            "SELECT id FROM sessions WHERE id = %s",
                            (session_id,),
                        )
                        row = cur.fetchone()
                        row_exists = row is not None
                        if not row_exists:
                            started_at = datetime.utcnow().isoformat()
                            cur.execute(
                                "INSERT INTO sessions "
                                "(id, user_id, course_id, started_at, ended_at, final_notes_text, student_notes_text, live_notes_history, transcript_text, final_notes_versions) "
                                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
                                "ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id",
                                (
                                    session_id,
                                    state.user_id,
                                    state.course_id,
                                    started_at,
                                    None,
                                    None,
                                    None,
                                    "[]",
                                    None,
                                    "[]",
                                ),
                            )

                if live_notes_task is None or live_notes_task.done():
                    live_notes_task = asyncio.create_task(live_notes_loop())
                await broadcast(
                    build_event("status", session_id, {"message": "session started"}).model_dump()
                )
                latest_whiteboard = SESSION_WHITEBOARD_INSIGHTS.get(session_id, [])
                if latest_whiteboard:
                    await safe_send(
                        build_event(
                            "whiteboard_insight",
                            session_id,
                            WhiteboardInsightPayload(status="ready", **latest_whiteboard[-1]),
                        ).model_dump()
                    )
                continue

            if message_type == "stop_session":
                payload = data.get("payload") or {}
                student_notes = payload.get("studentNotes")
                if isinstance(student_notes, str):
                    state.student_notes_text = student_notes.strip()
                await safe_send(
                    build_event("status", session_id, {"message": "finalizing session"}).model_dump()
                )
                await flush_session_audio(state, session_id, broadcast)
                await maybe_emit_simulator_progress(state, session_id, broadcast, force=True)
                await maybe_emit_live_notes(force=True)
                state.running = False
                SESSION_RUNNING[session_id] = False
                await finalize_and_persist_session(send_final_event=True)
                reset_state(state)
                await broadcast(
                    build_event("status", session_id, {"message": "session stopped"}).model_dump()
                )
                if live_notes_task:
                    live_notes_task.cancel()
                    try:
                        await live_notes_task
                    except asyncio.CancelledError:
                        pass
                break

            if message_type == "transcript_batch":
                payload = data.get("payload") or {}
                transcript_text = payload.get("text")
                if not isinstance(transcript_text, str) or not transcript_text.strip():
                    await safe_send(
                        build_event("error", session_id, {"message": "Transcript text is required"}).model_dump()
                    )
                    continue

                await safe_send(
                    build_event(
                        "status",
                        session_id,
                        {"message": "processing uploaded transcript"},
                    ).model_dump()
                )
                student_notes = payload.get("studentNotes")
                if isinstance(student_notes, str):
                    state.student_notes_text = student_notes.strip()
                for chunk in chunk_transcript_text(transcript_text):
                    record_transcript_text(state, session_id, chunk)
                    state.processed_audio_ms += estimate_audio_ms_from_text(chunk)
                    await broadcast(
                        build_event(
                            "transcript_final",
                            session_id,
                            {"text": chunk, "source": "transcript", "segmentMs": 0},
                        ).model_dump()
                    )
                    await maybe_emit_simulator_progress(state, session_id, broadcast)
                    await maybe_emit_live_notes(force=False)

                await maybe_emit_simulator_progress(state, session_id, broadcast, force=True)
                await maybe_emit_live_notes(force=True)
                await safe_send(
                    build_event(
                        "status",
                        session_id,
                        {"message": "finalizing session"},
                    ).model_dump()
                )
                state.running = False
                SESSION_RUNNING[session_id] = False
                await finalize_and_persist_session(send_final_event=True)
                reset_state(state)
                await broadcast(
                    build_event("status", session_id, {"message": "session stopped"}).model_dump()
                )
                if live_notes_task:
                    live_notes_task.cancel()
                    try:
                        await live_notes_task
                    except asyncio.CancelledError:
                        pass
                break

            if message_type == "camera_frame":
                if not (state.user_id is not None and state.mobile_attached):
                    continue
                payload = data.get("payload") or {}
                image = payload.get("image")
                mime_type = payload.get("mimeType")
                width = payload.get("width")
                height = payload.get("height")
                if (
                    isinstance(image, str)
                    and isinstance(mime_type, str)
                    and isinstance(width, int)
                    and isinstance(height, int)
                ):
                    await broadcast(
                        build_event(
                            "camera_preview",
                            session_id,
                            {
                                "image": image,
                                "mimeType": mime_type,
                                "width": width,
                                "height": height,
                            },
                        ).model_dump()
                    )
                    await maybe_schedule_whiteboard_analysis(
                        session_id=session_id,
                        state=state,
                        image_b64=image,
                        mime_type=mime_type,
                        broadcast=broadcast,
                    )
                continue

            if message_type != "audio_frame":
                continue

            if state.user_id is None and not state.mobile_attached:
                await safe_send(
                    build_event("error", session_id, {"message": "mobile not attached"}).model_dump()
                )
                continue

            if not SESSION_RUNNING.get(session_id, False):
                now = time.time()
                if now - state.last_not_started_notice_ts > 3.0:
                    state.last_not_started_notice_ts = now
                    await safe_send(
                        build_event("status", session_id, {"message": "session not started"}).model_dump()
                    )
                continue
            if not state.running:
                state.running = True
                state.vad_iterator = create_vad_iterator(sample_rate=TARGET_SAMPLE_RATE)

            payload = data.get("payload") or {}
            await handle_audio_frame(payload, session_id, broadcast, state)
    except WebSocketDisconnect:
        return
    finally:
        if live_notes_task:
            live_notes_task.cancel()
            try:
                await live_notes_task
            except asyncio.CancelledError:
                pass
        unregister_client(session_id, websocket)
        deferred_finalize = False
        if SESSION_RUNNING.get(session_id, False):
            if not SESSION_CLIENTS.get(session_id):
                async def finalize_after_grace(current_state: SessionState) -> None:
                    try:
                        await asyncio.sleep(RECONNECT_GRACE_SECONDS)
                    except asyncio.CancelledError:
                        return
                    if SESSION_CLIENTS.get(session_id) or not SESSION_RUNNING.get(session_id, False):
                        SESSION_FINALIZE_TASKS.pop(session_id, None)
                        return
                    await flush_session_audio(current_state, session_id, broadcast)
                    await maybe_emit_simulator_progress(
                        current_state, session_id, broadcast, force=True
                    )
                    await maybe_emit_live_notes(force=True)
                    current_state.running = False
                    SESSION_RUNNING[session_id] = False
                    await finalize_and_persist_session(send_final_event=False)
                    reset_state(current_state)
                    SESSION_FINALIZE_TASKS.pop(session_id, None)

                pending = SESSION_FINALIZE_TASKS.get(session_id)
                if pending and not pending.done():
                    pending.cancel()
                SESSION_FINALIZE_TASKS[session_id] = asyncio.create_task(
                    finalize_after_grace(state)
                )
                deferred_finalize = True
        elif not SESSION_CLIENTS.get(session_id):
            SESSION_RUNNING.pop(session_id, None)
            SESSION_TRANSCRIPT_BUFFER.pop(session_id, None)
        if not deferred_finalize:
            reset_state(state)


async def handle_audio_frame(
    payload: dict[str, Any],
    session_id: str,
    safe_send: Callable[[dict], Awaitable[bool]],
    state: SessionState,
) -> None:
    audio_b64 = payload.get("audio")
    sample_rate = payload.get("sampleRate")
    audio_format = payload.get("format")

    if not isinstance(audio_b64, str) or audio_format != "f32le":
        await safe_send(
            build_event("error", session_id, {"message": "Invalid audio payload"}).model_dump()
        )
        return

    if not isinstance(sample_rate, int) or sample_rate <= 0:
        await safe_send(
            build_event("error", session_id, {"message": "Invalid sample rate"}).model_dump()
        )
        return

    try:
        audio_bytes = base64.b64decode(audio_b64)
        audio_np = np.frombuffer(audio_bytes, dtype=np.float32).copy()
        if sample_rate != TARGET_SAMPLE_RATE:
            audio_np = resample_linear(audio_np, sample_rate, TARGET_SAMPLE_RATE)
    except Exception as exc:
        await safe_send(
            build_event("error", session_id, {"message": f"Audio decode failed: {exc}"}).model_dump()
        )
        return

    if state.pending.size > 0:
        audio_np = np.concatenate([state.pending, audio_np])
        state.pending = np.zeros(0, dtype=np.float32)

    offset = 0
    while offset + VAD_FRAME_SAMPLES <= audio_np.size:
        chunk = audio_np[offset : offset + VAD_FRAME_SAMPLES]
        offset += VAD_FRAME_SAMPLES
        state.processed_audio_ms += int((chunk.size / TARGET_SAMPLE_RATE) * 1000)

        segment = process_vad_chunk(state, chunk)
        if segment is None or segment.size == 0:
            continue

        await transcribe_segment(segment, session_id, safe_send, state)

    await maybe_emit_simulator_progress(state, session_id, safe_send)

    if offset < audio_np.size:
        state.pending = audio_np[offset:].astype(np.float32, copy=False)
