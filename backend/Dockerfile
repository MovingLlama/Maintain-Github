FROM python:3.12-slim AS base

ARG DEBUG=false

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    openssh-client \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin appuser

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Install debugpy for remote debugging in development
RUN if [ "$DEBUG" = "true" ]; then \
        pip install --no-cache-dir debugpy>=1.8.0 && \
        echo "debugpy installed for remote debugging"; \
    fi

# Copy application code
COPY . .

# Create repos directory and set permissions
RUN mkdir -p /app/repos && chown -R appuser:appuser /app

# Configure git safe directory
RUN git config --global --add safe.directory '*'

# Ensure entrypoint is executable
RUN chmod +x /app/entrypoint.sh

# Use entrypoint for startup checks and permission fixes
ENTRYPOINT ["/app/entrypoint.sh"]

USER appuser

EXPOSE 8000

# Debug mode (only if debugpy is installed AND DEBUG=true):
#   attach debugpy on port 5678 with hot-reload
# Production mode (default):
#   standard uvicorn
CMD if [ "$DEBUG" = "true" ] && python -c "import debugpy" 2>/dev/null; then \
        echo "Starting with debugpy on port 5678 (hot-reload enabled)"; \
        exec python -m debugpy --listen 0.0.0.0:5678 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload; \
    else \
        exec uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1; \
    fi
