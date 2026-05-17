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

# Acquire a PostgreSQL advisory lock to ensure only one container
# runs migrations at a time (prevents race conditions between
# backend and worker starting simultaneously).
echo "Acquiring migration lock..."
LOCK_ACQUIRED=$(python -c "
import psycopg2, os, sys
try:
    conn = psycopg2.connect(
        host=os.environ['POSTGRES_HOST'],
        port=int(os.environ.get('POSTGRES_PORT', 5432)),
        dbname=os.environ['POSTGRES_DB'],
        user=os.environ['POSTGRES_USER'],
        password=os.environ['POSTGRES_PASSWORD']
    )
    cur = conn.cursor()
    # pg_try_advisory_lock returns True if lock acquired, False if already held
    cur.execute('SELECT pg_try_advisory_lock(1542789643)')
    acquired = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    print('true' if acquired else 'false')
except Exception as e:
    print(f'false', file=sys.stderr)
    sys.exit(0)
")

if [ "$LOCK_ACQUIRED" != "true" ]; then
    echo "Migration lock is held by another container — skipping migrations."
else
    trap "echo 'Releasing migration lock...'; python -c \"
import psycopg2, os
conn = psycopg2.connect(
    host=os.environ['POSTGRES_HOST'],
    port=int(os.environ.get('POSTGRES_PORT', 5432)),
    dbname=os.environ['POSTGRES_DB'],
    user=os.environ['POSTGRES_USER'],
    password=os.environ['POSTGRES_PASSWORD']
)
cur = conn.cursor()
cur.execute('SELECT pg_advisory_unlock(1542789643)')
conn.commit()
conn.close()
\"" EXIT

    # Run Alembic migrations — but first check if this is a DB
    # that already has tables from the old create_all() path.
    echo "Checking database state..."
    MIGRATION_MODE=$(python -c "
import psycopg2, os, sys
try:
    conn = psycopg2.connect(
        host=os.environ['POSTGRES_HOST'],
        port=int(os.environ.get('POSTGRES_PORT', 5432)),
        dbname=os.environ['POSTGRES_DB'],
        user=os.environ['POSTGRES_USER'],
        password=os.environ['POSTGRES_PASSWORD']
    )
    cur = conn.cursor()
    # Check if users table exists (old create_all path)
    cur.execute(\"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users')\")
    users_exist = cur.fetchone()[0]
    # Check if alembic_version table exists
    cur.execute(\"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'alembic_version')\")
    alembic_exists = cur.fetchone()[0]
    conn.close()
    if users_exist and not alembic_exists:
        print('STAMP')
    elif not users_exist:
        print('MIGRATE')
    else:
        print('MIGRATE')  # normal path — alembic handles upgrades
    sys.exit(0)
except Exception as e:
    print(f'CHECK_FAILED:{e}', file=sys.stderr)
    sys.exit(1)
")

    if [ "$MIGRATION_MODE" = "STAMP" ]; then
        echo "Existing database detected without Alembic version table."
        echo "Stamping current head revision (tables already exist from create_all)..."
        alembic stamp head
        echo "Stamp complete."
    else
        echo "Running database migrations..."
        alembic upgrade head
    fi
fi

echo "=== Starting application as appuser ==="
# Ensure HOME points to appuser's actual home directory (not /root)
# so asyncpg/psycopg2 can find SSL certificates in ~/.postgresql/
export HOME=/app
# Drop privileges from root to appuser and run CMD
exec setpriv --reuid=appuser --regid=appuser --init-groups -- "$@"
