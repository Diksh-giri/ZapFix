#!/usr/bin/env bash
# Runs the database safety tests against a SCRATCH plain-Postgres database.
# Usage: DB_URL=postgres://user:pass@localhost:5432/zapfix_test tests/db/run.sh
# Needs psql. On a real Supabase project, skip auth_stub.sql and run only safety.sql
# (never against production: it truncates auth.users).
set -euo pipefail
: "${DB_URL:?Set DB_URL to a scratch database}"
# Any non-local database (for example a Supabase project) needs an explicit CONFIRM_SCRATCH=yes.
case "$DB_URL" in
  *@localhost:*|*@localhost/*|*@127.0.0.1:*|*@127.0.0.1/*) ;;
  *)
    if [ "${CONFIRM_SCRATCH:-}" != "yes" ]; then
      echo "Refusing to run: these tests TRUNCATE auth.users. Only use a throwaway scratch database," >&2
      echo "then re-run with CONFIRM_SCRATCH=yes." >&2
      exit 1
    fi ;;
esac
cd "$(dirname "$0")/../.."
P="psql $DB_URL -v ON_ERROR_STOP=1 -q"
# A real Supabase project already has auth.users, and its schema comes from `npm run db:migrate`
# (which includes the safety rules, 0001_integrity_and_rls.sql). Only plain Postgres needs the stub.
if [ "$($P -t -A -c "select to_regclass('auth.users') is not null")" = "t" ]; then
  echo "Supabase-style database detected: running safety tests only (migrations must already be applied)."
else
  $P -f tests/db/auth_stub.sql
  for f in db/migrations/*.sql; do $P -f "$f"; done
fi
out=$($P -t -A -F '|' -f tests/db/safety.sql)
echo "$out" | grep -E '^(PASS|FAIL)\|' | sed 's/|/  /'
failed=$(echo "$out" | tail -1 | cut -d'|' -f2)
echo "---"; echo "$out" | tail -1 | awk -F'|' '{print $1 " passed, " $2 " failed"}'
[ "$failed" = "0" ]
