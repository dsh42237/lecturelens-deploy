#!/usr/bin/env bash
set -euo pipefail

stop_port() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    local pids
    pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN || true)
    if [[ -n "$pids" ]]; then
      echo "Stopping processes on port $port: $pids"
      kill $pids || true
    else
      echo "No process listening on port $port"
    fi
  else
    echo "lsof not available; cannot stop port $port"
  fi
}

stop_port 8000
stop_port 3000
