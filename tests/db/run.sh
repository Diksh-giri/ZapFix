#!/usr/bin/env bash
# Runs the database safety tests against a SCRATCH plain-Postgres database.
# Usage: DB_URL=postgres://user:pass@localhost:5432/zapfix_test tests/db/run.sh
# Needs psql. On a real Supabase project, skip auth_stub.sql and run only safety.sql
# (never against production: it truncates auth.users).
set -euo pipefail
: "${DB_URL:?Set DB_URL to a scratch database}"
cd "$(dirname "$0")/../.."
P="psql $DB_URL -v ON_ERROR_STOP=1 -q"
$P -f tests/db/auth_stub.sql
for f in db/migrations/*.sql; do $P -f "$f"; done
$P -f db/policies/001_integrity.sql
out=$($P -t -A -F '|' -f tests/db/safety.sql)
echo "$out" | grep -E '^(PASS|FAIL)\|' | sed 's/|/  /'
failed=$(echo "$out" | tail -1 | cut -d'|' -f2)
echo "---"; echo "$out" | tail -1 | awk -F'|' '{print $1 " passed, " $2 " failed"}'
[ "$failed" = "0" ]
