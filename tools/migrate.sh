#!/usr/bin/env bash
set -euo pipefail

: "${POSTGRES_URI:?POSTGRES_URI not set}"

for f in db/migrations/*.sql; do
  echo "Applying $f"
  psql "${POSTGRES_URI}" -v ON_ERROR_STOP=1 -f "$f"
done
