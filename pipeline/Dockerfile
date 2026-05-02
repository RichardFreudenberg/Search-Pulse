FROM python:3.11-slim

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev curl git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers (only chromium, minimal footprint)
RUN playwright install chromium --with-deps || true

# Copy application code
COPY . .

# Create data directories
RUN mkdir -p /app/data/documents /app/data/beat

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

CMD ["uvicorn", "pipeline.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
