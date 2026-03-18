FROM python:3.11-slim
WORKDIR /app
COPY . .
RUN pip install --no-cache-dir -e . --extra-index-url https://download.pytorch.org/whl/cpu
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('tiny.en')"
WORKDIR /app/src
ENV PORT=8000
CMD python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
