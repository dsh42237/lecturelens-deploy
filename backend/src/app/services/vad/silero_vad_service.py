from typing import Optional

import torch
from silero_vad import load_silero_vad
from silero_vad.utils_vad import VADIterator

_model: Optional[torch.nn.Module] = None


def _get_model() -> torch.nn.Module:
    global _model
    if _model is None:
        _model = load_silero_vad()
    return _model


def create_vad_iterator(sample_rate: int = 16000) -> VADIterator:
    model = _get_model()
    return VADIterator(model, sampling_rate=sample_rate)
