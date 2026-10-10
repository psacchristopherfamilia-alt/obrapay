#!/usr/bin/env bash
# Arranca un Postgres 16 local para las pruebas (si no está corriendo).
set -euo pipefail
PG=/usr/lib/postgresql/16/bin
DATA="${PGDATA_LOCAL:-/home/claude/pgdata}"
if pg_isready -h /tmp -q 2>/dev/null; then exit 0; fi
if [ ! -f "$DATA/PG_VERSION" ]; then
  mkdir -p "$DATA" && chown postgres:postgres "$DATA"
  su postgres -c "$PG/initdb -D $DATA -U postgres --auth=trust -E UTF8 >/dev/null"
fi
rm -f "$DATA/postmaster.pid"
su postgres -c "$PG/pg_ctl -D $DATA -l $DATA/log.txt -o '-k /tmp -c timezone=UTC' -w start" >/dev/null
