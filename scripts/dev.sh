#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-rules}"  # rules | llm

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

# Kill children on exit
pids=()
cleanup() {
  echo ""
  echo "Stopping..."
  for pid in "${pids[@]:-}"; do
    kill "$pid" >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT INT TERM

echo "Mode: $MODE"

# Backend env
export NOTES_MODE="$MODE"

if [[ "$MODE" == "llm" ]]; then
  export DISABLE_RULES="${DISABLE_RULES:-1}"
  export LLM_PROVIDER="${LLM_PROVIDER:-openai}"
  if [[ "$LLM_PROVIDER" == "ollama" ]]; then
    export LLM_MODEL="${LLM_MODEL:-llama3.1:8b}"
    export LLM_HTTP_URL="${LLM_HTTP_URL:-http://localhost:11434}"
  else
    export LLM_MODEL="${LLM_MODEL:-gpt-5-mini}"
  fi
else
  export DISABLE_RULES="${DISABLE_RULES:-0}"
fi

# Start backend
echo "Starting backend..."
cd "$BACKEND_DIR"
if [[ ! -d ".venv" ]]; then
  if command -v python3 >/dev/null 2>&1; then
    python3 -m venv .venv
  else
    python -m venv .venv
  fi
  # shellcheck disable=SC1091
  source .venv/bin/activate
  pip install -U pip
  pip install -e .
else
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi
uvicorn app.main:app --reload --app-dir src --port 8000 &
pids+=($!)

# Start frontend
echo "Starting frontend..."
cd "$FRONTEND_DIR"
if [[ ! -d "node_modules" ]]; then
  npm install
fi
npm run dev &
pids+=($!)

echo ""
echo "✅ Dev running:"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:8000"
echo ""
wait
