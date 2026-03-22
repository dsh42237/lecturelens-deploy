from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np


OPENAI_VISION_MODEL = os.getenv("OPENAI_VISION_MODEL", "gpt-4.1-mini")
WHITEBOARD_REGION_LIMIT = max(1, int(os.getenv("WHITEBOARD_REGION_LIMIT", "2")))
WHITEBOARD_MAX_IMAGE_SIDE = max(800, int(os.getenv("WHITEBOARD_MAX_IMAGE_SIDE", "1400")))


@dataclass
class Region:
    x: int
    y: int
    w: int
    h: int

    @property
    def area(self) -> int:
        return self.w * self.h


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
            if not isinstance(content, list):
                continue
            for part in content:
                if not isinstance(part, dict):
                    continue
                if part.get("type") in {"output_text", "text"} and isinstance(
                    part.get("text"), str
                ):
                    chunks.append(part["text"])
        if chunks:
            return "\n".join(chunks)

    raise ValueError("OpenAI response missing output text")


def _extract_json_payload(text: str) -> dict[str, Any]:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`").strip()
        if stripped.lower().startswith("json"):
            stripped = stripped[4:].strip()
    try:
        parsed = json.loads(stripped)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    if start == -1:
        raise ValueError("Vision response did not contain JSON")

    depth = 0
    for index in range(start, len(text)):
        char = text[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                candidate = text[start : index + 1]
                parsed = json.loads(candidate)
                if isinstance(parsed, dict):
                    return parsed
                break
    raise ValueError("Vision response did not contain a valid JSON object")


def _resize_for_vision(image: np.ndarray) -> np.ndarray:
    height, width = image.shape[:2]
    longest_side = max(height, width)
    if longest_side <= WHITEBOARD_MAX_IMAGE_SIDE:
        return image
    scale = WHITEBOARD_MAX_IMAGE_SIDE / float(longest_side)
    target = (max(1, int(round(width * scale))), max(1, int(round(height * scale))))
    return cv2.resize(image, target, interpolation=cv2.INTER_AREA)


def _largest_whiteboard_crop(image: np.ndarray) -> np.ndarray:
    image = _resize_for_vision(image)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blur, 60, 140)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=2)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    height, width = gray.shape
    best: tuple[int, int, int, int] | None = None
    best_area = 0
    for contour in contours:
        peri = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * peri, True)
        x, y, box_w, box_h = cv2.boundingRect(approx)
        area = box_w * box_h
        if area < 0.45 * width * height:
            continue
        if box_w < 0.70 * width or box_h < 0.65 * height:
            continue
        if area > best_area:
            best = (x, y, box_w, box_h)
            best_area = area

    if best is None:
        pad_x = int(width * 0.03)
        pad_y = int(height * 0.03)
        return image[pad_y : height - pad_y, pad_x : width - pad_x]

    x, y, box_w, box_h = best
    if (
        x > int(width * 0.12)
        or y > int(height * 0.12)
        or x + box_w < int(width * 0.88)
        or y + box_h < int(height * 0.88)
    ):
        pad_x = int(width * 0.03)
        pad_y = int(height * 0.03)
        return image[pad_y : height - pad_y, pad_x : width - pad_x]
    return image[y : y + box_h, x : x + box_w]


def _merge_regions(regions: list[Region], padding: int = 16) -> list[Region]:
    merged: list[Region] = []
    for region in sorted(regions, key=lambda item: (item.y, item.x)):
        current = Region(
            max(0, region.x - padding),
            max(0, region.y - padding),
            region.w + padding * 2,
            region.h + padding * 2,
        )
        merged_into_existing = False
        for index, existing in enumerate(merged):
            ex2 = existing.x + existing.w
            ey2 = existing.y + existing.h
            cx2 = current.x + current.w
            cy2 = current.y + current.h
            overlaps = (
                current.x <= ex2 + 20
                and cx2 >= existing.x - 20
                and current.y <= ey2 + 20
                and cy2 >= existing.y - 20
            )
            if not overlaps:
                continue
            nx1 = min(existing.x, current.x)
            ny1 = min(existing.y, current.y)
            nx2 = max(ex2, cx2)
            ny2 = max(ey2, cy2)
            merged[index] = Region(nx1, ny1, nx2 - nx1, ny2 - ny1)
            merged_into_existing = True
            break
        if not merged_into_existing:
            merged.append(current)
    return sorted(merged, key=lambda item: (item.y, item.x))


def _detect_content_regions(board: np.ndarray) -> list[np.ndarray]:
    gray = cv2.cvtColor(board, cv2.COLOR_BGR2GRAY)
    inverted = cv2.bitwise_not(gray)
    thresholded = cv2.adaptiveThreshold(
        inverted,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        -8,
    )
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
    dilated = cv2.dilate(thresholded, kernel, iterations=1)
    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    height, width = gray.shape
    raw_regions: list[Region] = []
    for contour in contours:
        x, y, box_w, box_h = cv2.boundingRect(contour)
        area = box_w * box_h
        if area < 0.02 * width * height:
            continue
        if box_w < 0.18 * width and box_h < 0.15 * height:
            continue
        raw_regions.append(Region(x, y, box_w, box_h))

    regions = _merge_regions(raw_regions)
    if not regions:
        regions = [Region(0, 0, width, height)]
    elif len(regions) == 1 and regions[0].area > int(0.55 * width * height):
        overlap = int(width * 0.06)
        midpoint = width // 2
        regions = [
            Region(0, 0, min(width, midpoint + overlap), height),
            Region(max(0, midpoint - overlap), 0, width - max(0, midpoint - overlap), height),
        ]

    return [
        board[region.y : region.y + region.h, region.x : region.x + region.w]
        for region in regions[:WHITEBOARD_REGION_LIMIT]
    ]


def _encode_image_data_url(image: np.ndarray, mime_type: str) -> str:
    normalized_mime = "image/png" if mime_type.lower().endswith("png") else "image/jpeg"
    extension = ".png" if normalized_mime == "image/png" else ".jpg"
    params = [] if extension == ".png" else [int(cv2.IMWRITE_JPEG_QUALITY), 88]
    ok, encoded = cv2.imencode(extension, image, params)
    if not ok:
        raise ValueError("Failed to encode whiteboard image")
    payload = base64.b64encode(encoded.tobytes()).decode("ascii")
    return f"data:{normalized_mime};base64,{payload}"


def _call_openai_vision(board: np.ndarray, regions: list[np.ndarray], mime_type: str) -> dict[str, Any]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not configured")

    prompt = (
        "You are analyzing a photographed classroom whiteboard with mathematical or diagram content. "
        "Return strict JSON only with keys: title, subject_guess, summary, equations_latex, steps, diagram_or_structure, uncertain_readings. "
        "title and subject_guess must be strings. summary must be one short paragraph string. "
        "equations_latex, steps, diagram_or_structure, uncertain_readings must be arrays of strings. "
        "Use LaTeX for equations and preserve mathematical meaning. "
        "Prefer concise cleaned equations over noisy verbatim handwriting. "
        "If there is a diagram, workflow, graph, or boxed relationship, describe it in diagram_or_structure. "
        "If some symbols are unclear, record only those ambiguities in uncertain_readings."
    )
    content: list[dict[str, Any]] = [
        {"type": "input_text", "text": prompt},
        {"type": "input_text", "text": "Whole whiteboard image:"},
        {"type": "input_image", "image_url": _encode_image_data_url(board, mime_type), "detail": "high"},
    ]
    for index, region in enumerate(regions, start=1):
        content.extend(
            [
                {"type": "input_text", "text": f"Close-up region {index}:"},
                {
                    "type": "input_image",
                    "image_url": _encode_image_data_url(region, mime_type),
                    "detail": "high",
                },
            ]
        )

    payload = {
        "model": OPENAI_VISION_MODEL,
        "input": [{"role": "user", "content": content}],
        "text": {"format": {"type": "json_object"}},
    }
    request = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=int(os.getenv("WHITEBOARD_VISION_TIMEOUT_SECONDS", "90"))) as response:
        parsed = json.loads(response.read().decode("utf-8"))
    return _extract_json_payload(_extract_openai_text(parsed))


def _normalize_strings(items: Any, limit: int) -> list[str]:
    if not isinstance(items, list):
        return []
    normalized: list[str] = []
    seen: set[str] = set()
    for item in items:
        if not isinstance(item, str):
            continue
        cleaned = " ".join(item.replace("\r", "\n").split()).strip()
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(cleaned)
        if len(normalized) >= limit:
            break
    return normalized


def analyze_whiteboard_image_bytes(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict[str, Any]:
    np_bytes = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(np_bytes, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Unsupported whiteboard image")

    board = _largest_whiteboard_crop(image)
    regions = _detect_content_regions(board)
    data = _call_openai_vision(board, regions, mime_type)

    summary = str(data.get("summary") or "").strip()
    title = str(data.get("title") or "Whiteboard capture").strip() or "Whiteboard capture"
    subject_guess = str(data.get("subject_guess") or "").strip()
    insight = {
        "title": title,
        "subjectGuess": subject_guess,
        "summary": summary,
        "equationsLatex": _normalize_strings(data.get("equations_latex"), 8),
        "steps": _normalize_strings(data.get("steps"), 8),
        "diagramHints": _normalize_strings(data.get("diagram_or_structure"), 6),
        "uncertainReadings": _normalize_strings(data.get("uncertain_readings"), 6),
    }
    return insight


def build_whiteboard_context(insights: list[dict[str, Any]]) -> str:
    if not insights:
        return ""

    blocks: list[str] = []
    for index, insight in enumerate(insights[-4:], start=1):
        title = str(insight.get("title") or f"Board Snapshot {index}").strip()
        summary = str(insight.get("summary") or "").strip()
        equations = [str(item).strip() for item in insight.get("equationsLatex") or [] if str(item).strip()]
        steps = [str(item).strip() for item in insight.get("steps") or [] if str(item).strip()]
        diagram_hints = [
            str(item).strip() for item in insight.get("diagramHints") or [] if str(item).strip()
        ]

        lines = [f"Snapshot {index}: {title}"]
        if summary:
            lines.append(f"Summary: {summary}")
        if equations:
            lines.append("Equations:")
            lines.extend(f"- {equation}" for equation in equations[:6])
        if steps:
            lines.append("Board steps:")
            lines.extend(f"- {step}" for step in steps[:5])
        if diagram_hints:
            lines.append("Diagram or structure clues:")
            lines.extend(f"- {hint}" for hint in diagram_hints[:4])
        blocks.append("\n".join(lines))

    return "\n\n".join(blocks).strip()
