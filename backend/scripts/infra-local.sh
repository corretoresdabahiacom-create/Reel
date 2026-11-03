#!/usr/bin/env bash
# Sobe Postgres 16 e Redis 7 locais (sem Docker) para testes/desenvolvimento. Uso: scripts/infra-local.sh start|stop
set -euo pipefail
BASE=${INFRA_DIR:-/tmp/nexus-infra}; PGPORT=${PGPORT:-55432}; REDISPORT=${REDISPORT:-56379}
PGBIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
as_pg() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
case "${1:-start}" in
  start)
    mkdir -p "$BASE"; chmod 755 "$BASE"; [ "$(id -u)" = 0 ] && chown postgres "$BASE" || true
    if [ ! -d "$BASE/pg/base" ]; then as_pg "$PGBIN/initdb" -D "$BASE/pg" -U postgres --auth=trust >/dev/null; fi
    as_pg "$PGBIN/pg_ctl" -D "$BASE/pg" -o "-p $PGPORT -k $BASE -c listen_addresses=127.0.0.1 -c fsync=off" -l "$BASE/pg.log" -w start >/dev/null 2>&1 || true
    "$PGBIN/psql" -h 127.0.0.1 -p "$PGPORT" -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='nexus_test'" | grep -q 1 || "$PGBIN/createdb" -h 127.0.0.1 -p "$PGPORT" -U postgres nexus_test
    redis-cli -p "$REDISPORT" ping >/dev/null 2>&1 || redis-server --port "$REDISPORT" --save "" --appendonly no --daemonize yes --dir "$BASE" >/dev/null
    echo "postgres://postgres@127.0.0.1:$PGPORT/nexus_test redis://127.0.0.1:$REDISPORT" ;;
  stop)
    as_pg "$PGBIN/pg_ctl" -D "$BASE/pg" -m fast stop >/dev/null 2>&1 || true; redis-cli -p "$REDISPORT" shutdown nosave >/dev/null 2>&1 || true ;;
esac
