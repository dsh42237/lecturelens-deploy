# LectureLens — V1.0.1

Monorepo for LectureLens:
- `frontend/`: Next.js + TypeScript UI (live transcript + live notes + final notes)
- `backend/`: FastAPI WebSocket service (Silero VAD + faster-whisper)
- `docs/`: project documentation

## Current progress
- Live microphone streaming from browser to backend (16kHz float32 frames).
- Backend Silero VAD streaming with faster-whisper transcription.
- Live notes stream during lecture + final notes generated on stop.
- Live notes snapshots are stored per session and visible in Session History.
- Desktop can generate a QR mobile capture link (`/mobile`) to use phone mic/camera over HTTPS tunnels.
- Phone camera frames can be previewed on the desktop during a session (90-degree rotated for landscape viewing).
- Improved UI layout with scrollable transcript/notes panels.

## Project Status (V1.0.1)
- Live transcription works.
- Backend VAD + Whisper streaming works.
- Live notes + final notes streaming works (LLM-backed).
- Session history stores final notes + live notes timeline.
- Ollama supported locally (optional).

Known limitations:
- LLM notes may lag due to batching.
- Notes quality depends on transcript clarity.
- Phone mic/camera generally require HTTPS on mobile browsers (LAN HTTP often blocked).
- Camera pipeline is currently preview-only (no OCR / board understanding yet).

Planned next versions:
- V1.1: Better notes structuring + topic clustering.
- V1.2: Student personalization (quiz feedback loop).
- V2.0: Camera/board capture + diagram generation.

## Quick Start (First Run)

Prereqs:
- Node 18+ (or 20)
- Python 3.11+
- OpenAI API key (for LLM notes)
- (Optional) `brew` on macOS

### 1) Backend (FastAPI)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .
cp .env.example .env
# edit backend/.env and set OPENAI_API_KEY=
uvicorn app.main:app --reload --app-dir src --port 8000
```

### 2) Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## Quick Start (Next Time)

Terminal 1 (backend):

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --app-dir src --port 8000
```

Terminal 2 (frontend):

```bash
cd frontend
npm run dev
```

## Phone Capture (Mic/Camera via HTTPS)

Mobile browsers often block mic/camera on plain `http://LAN-IP`. Use HTTPS tunnels.

### 1) Install Cloudflare tunnel client (macOS)

```bash
brew install cloudflared
```

### 2) Start HTTPS tunnels (two terminals)

Terminal 3 (frontend tunnel):

```bash
cloudflared tunnel --url http://localhost:3000
```

Terminal 4 (backend tunnel):

```bash
cloudflared tunnel --url http://localhost:8000
```

### 3) Connect phone to the session

In the desktop app (Live Session page):
1. Set **Capture source** = `Phone mic/camera`.
2. Set **Phone base URL** = the *frontend* `https://...trycloudflare.com` printed by terminal 3.
3. Set **Phone WS base URL (HTTPS)** = the *backend* `https://...trycloudflare.com` printed by terminal 4.
4. Click **Refresh QR** once and scan it on your phone.
5. On phone, tap **Enable Mic/Camera** once (permissions). After that, desktop Start/Stop controls the session and phone auto-streams when running.

## Environment Notes

- Backend reads env from `backend/.env` via `python-dotenv` (see `backend/src/app/main.py`).
- Notes LLM code lives in `backend/src/app/services/notes`.

Optional Whisper model override:

```bash
export WHISPER_MODEL=small.en
```

## Troubleshooting

- macOS mic permissions: System Settings → Privacy & Security → Microphone.
- If notes are empty: confirm `OPENAI_API_KEY` is set in `backend/.env` and restart backend.
- Backend `GET /` returns 404 by design; the UI runs on the frontend.

## Next step (video understanding)

We now reliably receive phone camera frames on the backend and can preview them on desktop. Next is processing those frames in Python for blackboard/whiteboard understanding. Likely Phase 2 libraries/tools:
- `opencv-python`: frame transforms, stabilization, motion detection, perspective correction.
- OCR: `paddleocr` (strong), `easyocr` (simple), or `tesseract` (baseline).
- Text region detection / layout: `layoutparser`, lightweight YOLO/segmentation (optional).
- Optional LLM vision pass (later) on selected key frames (not every frame).
