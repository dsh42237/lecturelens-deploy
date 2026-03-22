# LiveLecture

Monorepo for LiveLecture:
- `frontend/`: Next.js app for live sessions, session history, simulator mode, and study notes
- `backend/`: FastAPI + WebSocket backend for transcription, live notes, final notes, and whiteboard vision

## What the app does

LiveLecture turns a lecture session into:
- live transcript
- live notes cards
- student-written notes
- final study notes after the session ends
- saved session history per course

Current capture modes:
- `Desktop mic`
- `Phone mic/camera`
- `Audio simulator`
- `Transcript simulator`

## Current features

- Real-time mic streaming from browser to backend at `16kHz`
- Silero VAD + Whisper-based transcription
- LLM-generated live notes during the session
- Final notes generated after stop
- Student notes editor on the live session page
- Session history with saved final notes and live notes timeline
- Simulator mode:
  - upload lecture audio
  - paste transcript directly
- Phone capture flow with QR code
- Phone camera preview on the live page
- Whiteboard vision pipeline for phone sessions:
  - board snapshots sampled in the background
  - server-side board change filtering
  - math / steps / diagram clues extracted from whiteboard photos
  - extracted board context included in final note generation

## Tech stack

Frontend:
- Next.js 14
- TypeScript
- Tiptap
- KaTeX
- Mermaid

Backend:
- FastAPI
- WebSockets
- faster-whisper
- Silero VAD
- OpenAI Responses API
- OpenCV

## Local development

### Prerequisites

- Node 18+ or 20+
- Python 3.11+
- OpenAI API key

### Backend setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .
cp .env.example .env
```

Set at least:

```env
OPENAI_API_KEY=...
NOTES_MODE=llm
LLM_PROVIDER=openai
```

Run backend:

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --app-dir src --port 8000
```

### Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Running the project later

Terminal 1:

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --app-dir src --port 8000
```

Terminal 2:

```bash
cd frontend
npm run dev
```

## Main user flows

### 1. Live session

1. Pick a course
2. Choose capture source
3. Start session
4. Watch transcript and live notes update
5. Stop session
6. Review final notes in Session History

### 2. Phone mic/camera capture

1. On the live page choose `Phone mic/camera`
2. Scan the QR code
3. Open the mobile page on the phone
4. Enable mic/camera on the phone
5. Start the session from desktop

Production should work directly over HTTPS.

For local development, mobile capture may still require manual tunnel URLs depending on browser/security restrictions.

### 3. Audio simulator

Two simulator modes are supported:

- `Audio upload`
  - upload a lecture recording
  - backend transcribes it and generates live/final notes

- `Transcript paste`
  - paste transcript text directly
  - skips speech-to-text
  - still generates live notes and final notes through the normal pipeline

## Whiteboard vision flow

Phone sessions can now use periodic camera snapshots to improve math-heavy final notes.

Current flow:

1. Phone sends `camera_frame` websocket events
2. Backend always rebroadcasts preview frames
3. Backend samples board analysis roughly every `90s`
4. Backend skips analysis if the board has not changed enough
5. Server crops the board, creates close-up regions, and calls OpenAI vision
6. Vision returns structured board context:
   - title
   - summary
   - equations in LaTeX
   - solve steps
   - diagram / structure hints
   - uncertain readings
7. Final notes use transcript + student notes + board context

This is intentionally not done on every frame, to control token usage and cost.

## Deployment

The project is currently deployed on Railway as separate frontend and backend services.

Typical env vars:

Backend:

```env
OPENAI_API_KEY=...
JWT_SECRET=...
COOKIE_SECURE=1
COOKIE_SAMESITE=none
CORS_ORIGINS=https://your-frontend-domain
```

Frontend:

```env
NEXT_PUBLIC_API_BASE=https://your-backend-domain
NEXT_PUBLIC_WS_BASE=wss://your-backend-domain
```

## Notes quality and limitations

- Final note quality still depends heavily on transcript quality
- Whiteboard math extraction is much better than plain OCR, but not perfect
- Diagram capture currently feeds diagram hints into final notes rather than full diagram reconstruction
- Live notes and final notes still depend on real model latency, so simulator speed is bounded by backend processing throughput
- Mermaid generation in notes is prompt-dependent and may be omitted when uncertain

## Useful paths

Frontend live page:
- [frontend/app/live/page.tsx](/Users/harman/advproject/frontend/app/live/page.tsx)

Backend websocket session flow:
- [backend/src/app/api/ws.py](/Users/harman/advproject/backend/src/app/api/ws.py)

Whiteboard vision service:
- [backend/src/app/services/vision/whiteboard_service.py](/Users/harman/advproject/backend/src/app/services/vision/whiteboard_service.py)

Final notes prompt:
- [backend/src/app/services/notes/prompt_templates.py](/Users/harman/advproject/backend/src/app/services/notes/prompt_templates.py)

## Troubleshooting

- If login fails in production, check backend `CORS_ORIGINS`, `COOKIE_SECURE`, and `COOKIE_SAMESITE`
- If final notes fall back to weak output, check `OPENAI_API_KEY` and backend logs
- If phone media fails locally, use HTTPS/tunnel URLs or test on production
- If the backend says `Address already in use`, another local process is already running on that port
- `GET /` on backend returning `404` is expected; use `/health` for a health check
