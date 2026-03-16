from collections import Counter
from difflib import SequenceMatcher
from typing import Any, Iterable, Tuple

from app.core.schemas import DefinitionItem, KeyTerm, NotesDeltaPayload, NotesTopicDelta


def normalize_text(value: str) -> str:
    return " ".join(value.strip().lower().split())


def uniq_preserve_order(values: Iterable[str]) -> list[str]:
    seen = set()
    result = []
    for value in values:
        key = normalize_text(value)
        if key in seen:
            continue
        seen.add(key)
        result.append(value)
    return result


def clip_len(value: str, max_len: int) -> str:
    if len(value) <= max_len:
        return value
    return value[:max_len].rstrip()


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, normalize_text(a), normalize_text(b)).ratio()


def _clean_items(values: Iterable[str], max_len: int, min_len: int, drops: Counter, label: str) -> list[str]:
    cleaned = []
    for value in values:
        text = clip_len(value.strip(), max_len)
        if len(text) < min_len:
            drops[label] += 1
            continue
        cleaned.append(text)
    return cleaned


def normalize_notes_state(
    notes: NotesDeltaPayload,
    prev_notes: dict[str, Any],
    *,
    max_topics: int = 8,
    max_bullets_per_topic: int = 5,
    max_key_terms: int = 18,
    max_questions: int = 6,
) -> Tuple[NotesDeltaPayload, Counter]:
    drops: Counter = Counter()

    prev_topics = prev_notes.get("topics", []) if isinstance(prev_notes, dict) else []
    topic_order: list[str] = []
    topic_bullets: dict[str, list[str]] = {}

    for topic in prev_topics:
        title = clip_len(str(topic.get("title", "")).strip(), 80)
        if len(title) < 3:
            continue
        topic_order.append(title)
        bullets = topic.get("bullets", []) or []
        topic_bullets[title] = _clean_items(bullets, 180, 3, drops, "bullets")

    for topic in notes.topics or []:
        raw_title = clip_len(topic.title.strip(), 80)
        if len(raw_title) < 3:
            drops["topics"] += 1
            continue

        match = None
        best = 0.0
        for existing in topic_order:
            score = similarity(raw_title, existing)
            if score > best:
                best = score
                match = existing
        title = match if match and best >= 0.86 else raw_title

        if title not in topic_bullets:
            topic_bullets[title] = []
            topic_order.append(title)

        new_bullets = _clean_items(topic.bullets or [], 180, 3, drops, "bullets")
        merged = list(topic_bullets[title])
        for bullet in new_bullets:
            if any(similarity(bullet, existing) >= 0.82 for existing in merged):
                drops["bullets"] += 1
                continue
            merged.append(bullet)
        topic_bullets[title] = merged[:max_bullets_per_topic]

    if len(topic_order) > max_topics:
        drops["topics"] += max(0, len(topic_order) - max_topics)
        topic_order = topic_order[-max_topics:]

    for title in list(topic_bullets.keys()):
        if title not in topic_order:
            topic_bullets.pop(title, None)

    keyterm_map: dict[str, KeyTerm] = {}
    prev_terms = prev_notes.get("keyTerms", []) if isinstance(prev_notes, dict) else []
    for item in prev_terms:
        term = str(item.get("term", "")).strip()
        weight = float(item.get("weight", 0.0))
        if len(term) < 3:
            continue
        keyterm_map[normalize_text(term)] = KeyTerm(term=clip_len(term, 40), weight=weight)

    for item in notes.keyTerms or []:
        term = clip_len(item.term.strip(), 40)
        if len(term) < 3:
            drops["keyTerms"] += 1
            continue
        key = normalize_text(term)
        existing = keyterm_map.get(key)
        if existing is None or item.weight > existing.weight:
            keyterm_map[key] = KeyTerm(term=term, weight=item.weight)

    key_terms = sorted(keyterm_map.values(), key=lambda t: t.weight, reverse=True)[:max_key_terms]
    if len(keyterm_map) > max_key_terms:
        drops["keyTerms"] += len(keyterm_map) - max_key_terms

    prev_questions = prev_notes.get("questions", []) if isinstance(prev_notes, dict) else []
    merged_questions = list(prev_questions) + (notes.questions or [])
    cleaned_questions = _clean_items(merged_questions, 180, 3, drops, "questions")
    questions = uniq_preserve_order(cleaned_questions)[:max_questions]
    if len(cleaned_questions) > max_questions:
        drops["questions"] += len(cleaned_questions) - max_questions

    prev_definitions = prev_notes.get("definitions", []) if isinstance(prev_notes, dict) else []
    definition_map: dict[str, DefinitionItem] = {}
    for item in prev_definitions:
        term = str(item.get("term", "")).strip()
        definition = str(item.get("definition", "")).strip()
        if len(term) < 3 or len(definition) < 3:
            continue
        definition_map[normalize_text(term)] = DefinitionItem(
            term=clip_len(term, 60), definition=clip_len(definition, 220)
        )

    for item in notes.definitions or []:
        term = clip_len(item.term.strip(), 60)
        definition = clip_len(item.definition.strip(), 220)
        if len(term) < 3 or len(definition) < 3:
            drops["definitions"] += 1
            continue
        definition_map[normalize_text(term)] = DefinitionItem(term=term, definition=definition)

    definitions = list(definition_map.values())

    prev_steps = prev_notes.get("steps", []) if isinstance(prev_notes, dict) else []
    merged_steps = list(prev_steps) + (notes.steps or [])
    steps = uniq_preserve_order(_clean_items(merged_steps, 180, 3, drops, "steps"))

    normalized = NotesDeltaPayload(
        topics=[NotesTopicDelta(title=title, bullets=topic_bullets[title]) for title in topic_order],
        keyTerms=key_terms,
        questions=questions,
        definitions=definitions,
        steps=steps,
    )
    return normalized, drops
