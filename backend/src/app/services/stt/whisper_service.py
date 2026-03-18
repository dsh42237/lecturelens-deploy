import os
from typing import Optional

import numpy as np
from faster_whisper import WhisperModel

_model: Optional[WhisperModel] = None


def _get_model() -> WhisperModel:
    global _model
    if _model is None:
        model_name = os.getenv("WHISPER_MODEL", "tiny.en")
        _model = WhisperModel(model_name)
    return _model


def transcribe(audio: np.ndarray, sample_rate: int) -> str:
    if audio.size == 0:
        return ""
    if sample_rate != 16000:
        # faster-whisper expects 16kHz mono float32
        raise ValueError("Unsupported sample rate; expected 16000")

    model = _get_model()
    segments, _info = model.transcribe(audio, language="en")
    text = "".join(segment.text for segment in segments).strip()
    return text
