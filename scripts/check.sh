#!/usr/bin/env bash
set -euo pipefail

failures=0
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

say_ok()   { echo "PASS: $*"; }
say_fail() { echo "FAIL: $*"; failures=$((failures + 1)); }
say_info() { echo "INFO: $*"; }

check_bin() {
  local label="$1"
  local cmd="$2"
  if command -v "$cmd" >/dev/null 2>&1; then
    say_ok "$label"
    return 0
  fi
  say_fail "$label ($cmd not found)"
  return 1
}

# Prefer python3 on macOS, fall back to python
pick_python() {
  if command -v python3 >/dev/null 2>&1; then echo "python3"; return 0; fi
  if command -v python  >/dev/null 2>&1; then echo "python";  return 0; fi
  echo ""
  return 1
}

check_port() {
  local port="$1"
  # lsof is usually available on macOS
  if command -v lsof >/dev/null 2>&1; then
    if lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      local who
      who="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN | tail -n +2 | head -n 1 || true)"
      say_info "Port $port is in use: ${who:-unknown process}"
    else
      say_ok "Port $port is free"
    fi
  else
    say_info "lsof not available; skipping port $port check"
  fi
}

echo "== Tooling =="
check_bin "Node" node || true
check_bin "npm" npm || true

PYBIN="$(pick_python || true)"
if [[ -n "${PYBIN:-}" ]]; then
  say_ok "Python ($PYBIN)"
else
  say_fail "Python (python3/python not found)"
fi

if command -v curl >/dev/null 2>&1; then say_ok "curl"; else say_info "curl not available"; fi
if command -v ollama >/dev/null 2>&1; then say_ok "Ollama installed"; else say_info "Ollama not installed (optional)"; fi

echo ""
echo "== Repo layout =="
[[ -d backend ]]  && say_ok "backend/ exists"  || say_fail "backend/ missing"
[[ -d frontend ]] && say_ok "frontend/ exists" || say_fail "frontend/ missing"

echo ""
echo "== Ports =="
check_port 3000
check_port 8000
check_port 11434

echo ""
echo "== Backend venv & deps =="
if [[ -d "backend/.venv" ]]; then
  # shellcheck disable=SC1091
  source "backend/.venv/bin/activate"
  say_ok "Activated backend/.venv"
else
  say_info "backend/.venv not found. Run: make backend-install"
fi

if [[ -n "${PYBIN:-}" ]]; then
  # If venv activated, python should now exist in PATH
  if command -v python >/dev/null 2>&1; then
    if python -c "import torch" >/dev/null 2>&1; then
      say_ok "torch import"
    else
      say_fail "torch import (run: make backend-install)"
    fi

    if python -c "import silero_vad" >/dev/null 2>&1; then
      say_ok "silero_vad import"
    else
      say_fail "silero_vad import (run: make backend-install)"
    fi
  else
    say_info "No python in PATH after venv step; skipping backend import checks"
  fi
else
  say_info "No python available; skipping backend import checks"
fi

echo ""
echo "== Ollama runtime (optional) =="
# Only treat Ollama as REQUIRED if NOTES_MODE=llm or LLM_PROVIDER=ollama is set
REQUIRE_OLLAMA=0
if [[ "${NOTES_MODE:-}" == "llm" ]] || [[ "${LLM_PROVIDER:-}" == "ollama" ]]; then
  REQUIRE_OLLAMA=1
fi

if command -v curl >/dev/null 2>&1; then
  if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
    say_ok "Ollama reachable (http://localhost:11434)"
    if curl -s http://localhost:11434/api/tags | grep -q "\"name\":\"llama3.1:8b\"" ; then
      say_ok "Ollama model llama3.1:8b present"
    else
      msg="Model llama3.1:8b missing (run: ollama pull llama3.1:8b)"
      if [[ "$REQUIRE_OLLAMA" -eq 1 ]]; then say_fail "$msg"; else say_info "$msg"; fi
    fi

    # lightweight generate sanity (optional)
    if command -v python >/dev/null 2>&1; then
      if curl -s http://localhost:11434/api/generate \
        -H "Content-Type: application/json" \
        -d '{"model":"llama3.1:8b","prompt":"Return {}","stream":false}' \
        | python -c "import json,sys; d=json.load(sys.stdin); assert isinstance(d.get('response'), str)" \
        >/dev/null 2>&1; then
        say_ok "Ollama generate"
      else
        msg="Ollama generate failed"
        if [[ "$REQUIRE_OLLAMA" -eq 1 ]]; then say_fail "$msg"; else say_info "$msg"; fi
      fi
    else
      say_info "python not available; skipping Ollama generate sanity"
    fi
  else
    msg="Ollama not reachable at http://localhost:11434 (run: ollama serve)"
    if [[ "$REQUIRE_OLLAMA" -eq 1 ]]; then say_fail "$msg"; else say_info "$msg"; fi
  fi
else
  say_info "curl not available; skipping Ollama runtime checks"
fi

echo ""
if [[ "$failures" -gt 0 ]]; then
  echo "Checks completed with $failures failure(s)."
  exit 1
fi

echo "All checks passed."