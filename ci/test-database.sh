#!/bin/sh
set -eu

# The shared runner uses host networking: service DNS aliases are unavailable.
# A per-job Unix socket also avoids competing with other jobs for TCP port 5432.
pg_bin=${PG_BIN:-/usr/lib/postgresql/15/bin}
as_postgres() {
  if [ "$(id -u)" -eq 0 ]; then
    runuser -u postgres -- "$@"
  else
    "$@"
  fi
}
test_db_dir=$(mktemp -d /tmp/ai-cup-db.XXXXXX)
cleanup() {
  as_postgres "$pg_bin/pg_ctl" -D "$test_db_dir/data" -m immediate -w stop >/dev/null 2>&1 || true
  rm -rf "$test_db_dir"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
if [ "$(id -u)" -eq 0 ]; then chown postgres:postgres "$test_db_dir"; fi
as_postgres "$pg_bin/initdb" -D "$test_db_dir/data" \
  -U ai_cup_test --encoding=UTF8 --auth-local=trust --auth-host=reject > "$test_db_dir/init.log"
as_postgres "$pg_bin/pg_ctl" -D "$test_db_dir/data" \
  -l "$test_db_dir/server.log" \
  -o "-c listen_addresses='' -k $test_db_dir -p 5432" -w start
as_postgres "$pg_bin/createdb" -h "$test_db_dir" -p 5432 -U ai_cup_test ai_cup_test

# Override any inherited test URL; never connect to the deployment database.
export TEST_DATABASE_URL="postgresql://ai_cup_test@localhost:5432/ai_cup_test?host=$test_db_dir"
npm run test:db
