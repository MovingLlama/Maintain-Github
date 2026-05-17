#!/bin/bash
set -e

echo "=== Maintain@Github Backend Starting ==="

# Wait for PostgreSQL
echo "Waiting for PostgreSQL at ${POSTGRES_HOST}:${POSTGRES_PORT:-5432}..."
until python -c "
import psycopg2, os, sys
try:
    conn = psycopg2.connect(
        host=os.environ['POSTGRES_HOST'],
        port=int(os.environ.get('POSTGRES_PORT', 5432)),
        dbname=os.environ['POSTGRES_DB'],
        user=os.environ['POSTGRES_USER'],
        password=os.environ['POSTGRES_PASSWORD']
    )
    conn.close()
    print('PostgreSQL is ready!')
    sys.exit(0)
except Exception as e:
    print(f'PostgreSQL not ready: {e}')
    sys.exit(1)
"; do
    echo "Retrying in 2 seconds..."
    sleep 2
done

# Wait for Redis
echo "Waiting for Redis..."
until python -c "
import redis, os, sys
try:
    r = redis.from_url(os.environ.get('REDIS_URL', 'redis://redis:6379/0'))
    r.ping()
    print('Redis is ready!')
    sys.exit(0)
except Exception as e:
    print(f'Redis not ready: {e}')
    sys.exit(1)
"; do
    echo "Retrying in 2 seconds..."
    sleep 2
done

# Ensure repos directory is writable by appuser
echo "Fixing permissions for /app/repos..."
chown -R appuser:appuser /app/repos 2>/dev/null || true

# Run Alembic migrations
echo "Running database migrations..."
alembic upgrade head

echo "=== Starting application as appuser ==="
# Drop privileges from root to appuser and run CMD
exec setpriv --reuid=appuser --regid=appuser --init-groups -- "$@"
