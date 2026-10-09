#!/usr/bin/env bash
# Corre las migraciones y las pruebas de la base de datos en un Postgres local.
# Uso: PGHOST=/tmp PGUSER=postgres ./scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."

DB=obrapay_test
export PGHOST="${PGHOST:-/tmp}" PGUSER="${PGUSER:-postgres}"

dropdb --if-exists "$DB" >/dev/null
createdb "$DB"

run() { psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$1" 2>&1 | sed -e 's/^psql:[^ ]* NOTICE:  /  /' -e '/^NOTICE:/s/^NOTICE:  /  /'; }

run tests/db/00_stub_supabase.sql
for f in supabase/migrations/*.sql; do
  case "$f" in *_cron.sql) continue ;; esac   # pg_cron solo existe en Supabase
  echo "migración: $(basename "$f")"
  run "$f"
done
run tests/db/01_seed.sql

fallas=0
for t in tests/db/[1-9]*.sql; do
  [ -e "$t" ] || continue
  echo "prueba: $(basename "$t")"
  if ! out=$(psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$t" 2>&1); then
    fallas=$((fallas + 1))
  fi
  echo "$out" | sed -n -e 's/.*NOTICE:  /  /p' -e 's/.*ERROR:  /  ERROR: /p'
done

if [ "$fallas" -gt 0 ]; then
  echo "RESULTADO: $fallas archivo(s) con fallas"
  exit 1
fi
echo "RESULTADO: todo bien"
