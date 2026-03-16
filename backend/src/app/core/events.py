import time
from typing import Any
from pydantic import BaseModel
from .schemas import EventEnvelope, EventType


def _payload_to_dict(payload: Any) -> dict[str, Any]:
    if isinstance(payload, BaseModel):
        return payload.model_dump()
    if isinstance(payload, dict):
        return payload
    return {"value": payload}


def build_event(event_type: EventType, session_id: str, payload: Any) -> EventEnvelope:
    return EventEnvelope(
        type=event_type,
        sessionId=session_id,
        timestamp=int(time.time() * 1000),
        payload=_payload_to_dict(payload),
    )
