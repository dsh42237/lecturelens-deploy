# LectureLens Backend

## Setup

Create a virtual environment and install dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

## Run

```bash
uvicorn app.main:app --reload --app-dir src --port 8000
```

Health check: `GET http://localhost:8000/health`.
