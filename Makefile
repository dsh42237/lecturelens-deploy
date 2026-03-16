.PHONY: install dev dev-llm dev-rules stop \
        backend-install backend-run frontend-install frontend-run \
        ollama-check check

# ---- Install ----
install: backend-install frontend-install

backend-install:
	cd backend && \
	if [ ! -d .venv ]; then python -m venv .venv; fi && \
	. .venv/bin/activate && \
	pip install -U pip && \
	pip install -e .

frontend-install:
	cd frontend && npm install

# ---- Run (single services) ----
backend-run:
	cd backend && \
	. .venv/bin/activate && \
	uvicorn app.main:app --reload --app-dir src --port 8000

frontend-run:
	cd frontend && npm run dev

# ---- Ollama sanity ----
ollama-check:
	@curl -s http://localhost:11434/api/tags >/dev/null 2>&1 && \
		echo "✅ Ollama reachable" || \
		(echo "❌ Ollama not reachable at http://localhost:11434" && exit 1)
	@curl -s http://localhost:11434/api/tags | grep -q "llama3.1:8b" && \
		echo "✅ Model llama3.1:8b is available" || \
		(echo "⚠️  Run: ollama pull llama3.1:8b" && exit 1)

# ---- Dev (runs both) ----
dev:
	@if [ ! -d backend/.venv ]; then $(MAKE) backend-install; fi
	@if [ ! -f backend/.env ]; then cp backend/.env.example backend/.env; fi
	@bash scripts/dev.sh llm

dev-llm: dev

dev-rules:
	@bash scripts/dev.sh rules

stop:
	@bash scripts/stop.sh || true

check:
	@bash scripts/check.sh
