from typing import Any, List, Literal, Optional
from pydantic import BaseModel, Field

EventType = Literal[
    "status",
    "simulator_progress",
    "transcript_partial",
    "transcript_final",
    "notes_delta",
    "live_notes_delta",
    "final_notes",
    "camera_preview",
    "error",
]


class EventEnvelope(BaseModel):
    type: EventType
    sessionId: str
    timestamp: int
    payload: dict[str, Any]


class StatusPayload(BaseModel):
    message: str


class ErrorPayload(BaseModel):
    message: str


class TranscriptPartialPayload(BaseModel):
    lineId: str
    text: str


class TranscriptFinalPayload(BaseModel):
    lineId: Optional[str] = None
    text: str


class NotesTopicDelta(BaseModel):
    title: str
    bullets: List[str] = Field(default_factory=list)


class KeyTerm(BaseModel):
    term: str
    weight: float


class DefinitionItem(BaseModel):
    term: str
    definition: str


class NotesDeltaPayload(BaseModel):
    topics: List[NotesTopicDelta] = Field(default_factory=list)
    keyTerms: List[KeyTerm] = Field(default_factory=list)
    questions: List[str] = Field(default_factory=list)
    definitions: List[DefinitionItem] = Field(default_factory=list)
    steps: List[str] = Field(default_factory=list)


class NotesTopic(BaseModel):
    title: str
    bullets: List[str] = Field(default_factory=list)


class NotesState(BaseModel):
    topics: List[NotesTopic] = Field(default_factory=list)
    keyTerms: List[KeyTerm] = Field(default_factory=list)
    questions: List[str] = Field(default_factory=list)
    definitions: List[DefinitionItem] = Field(default_factory=list)
    steps: List[str] = Field(default_factory=list)
