FROM python:3.11-slim AS builder

WORKDIR /app
RUN pip install uv

COPY pyproject.toml ./
RUN uv venv && \
    . .venv/bin/activate && \
    uv pip compile pyproject.toml -o requirements.txt && \
    uv pip install --no-cache -r requirements.txt

FROM python:3.11-slim

RUN useradd -m -u 1000 appuser && \
    mkdir -p /app /app/storage && \
    chown -R appuser:appuser /app

WORKDIR /app

COPY --from=builder --chown=appuser:appuser /app/.venv /app/.venv
COPY --chown=appuser:appuser . ./

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

USER appuser

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
