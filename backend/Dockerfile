FROM python:3.11-slim

WORKDIR /app

COPY . .

RUN pip install --no-cache-dir -e . --extra-index-url https://download.pytorch.org/whl/cpu

WORKDIR /app/src

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
