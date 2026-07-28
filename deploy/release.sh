#!/usr/bin/env bash
# dev.cx release — reduce (rolling) or eliminate (blue-green) publish downtime.
#
# Usage (on the host, after code is synced to the tree that contains this script):
#
#   ./deploy/release.sh                  # rolling (default): build → recreate api → web
#   ./deploy/release.sh --mode rolling
#   ./deploy/release.sh --mode bluegreen # start free color → health → nginx flip → drain
#   ./deploy/release.sh --smoke-only     # hit active local ports, exit non-zero on fail
#
# Env (optional):
#   ROOT              repo root (auto-detected)
#   ENV_FILE          default: $ROOT/deploy/.env
#   STATE_DIR         default: /opt/devcx  (active-color + release logs)
#   NGINX_CONF        path to live openresty vhost (required for bluegreen switch)
#   NGINX_RELOAD_CMD  default: nginx -s reload
#   HEALTH_TIMEOUT_S  default: 120
#   SKIP_SMOKE=1      skip post-switch smoke
#
# npc-friendly:
#   npc server exec <host> -- bash -lc 'cd /opt/devcx/current && ./deploy/release.sh'
set -euo pipefail

MODE="rolling"
SMOKE_ONLY=0

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \?//'
  exit "${1:-0}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --mode)
      MODE="${2:?--mode needs rolling|bluegreen}"
      shift 2
      ;;
    --mode=*)
      MODE="${1#--mode=}"
      shift
      ;;
    --smoke-only)
      SMOKE_ONLY=1
      shift
      ;;
    -h|--help)
      usage 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      usage 1
      ;;
  esac
done

case "$MODE" in
  rolling|bluegreen) ;;
  *)
    echo "invalid --mode=$MODE (want rolling|bluegreen)" >&2
    exit 2
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${ROOT:-$SCRIPT_DIR/..}" && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/deploy/.env}"
STATE_DIR="${STATE_DIR:-/opt/devcx}"
COLOR_FILE="${COLOR_FILE:-$STATE_DIR/active-color}"
HEALTH_TIMEOUT_S="${HEALTH_TIMEOUT_S:-120}"
NGINX_RELOAD_CMD="${NGINX_RELOAD_CMD:-nginx -s reload}"

PROD_COMPOSE=(docker compose -f "$ROOT/deploy/compose.production.yml" --env-file "$ENV_FILE")
BG_COMPOSE_FILE="$ROOT/deploy/compose.bluegreen.yml"

log() { printf '[%s] %s\n' "$(date -Is)" "$*"; }
die() { log "ERROR: $*"; exit 1; }

need_env() {
  [ -f "$ENV_FILE" ] || die "missing env file: $ENV_FILE"
  # shellcheck disable=SC1090
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  [ -n "${POSTGRES_PASSWORD:-}" ] || die "POSTGRES_PASSWORD empty in $ENV_FILE"
}

# active color: blue = host ports 8120/3120, green = 8121/3121
read_active_color() {
  if [ -f "$COLOR_FILE" ]; then
    tr -d '[:space:]' <"$COLOR_FILE"
  else
    echo blue
  fi
}

color_ports() {
  # sets API_PORT WEB_PORT for $1=blue|green
  case "$1" in
    blue)
      API_PORT=8120
      WEB_PORT=3120
      ;;
    green)
      API_PORT=8121
      WEB_PORT=3121
      ;;
    *)
      die "unknown color $1"
      ;;
  esac
}

other_color() {
  case "$1" in
    blue) echo green ;;
    green) echo blue ;;
    *) die "unknown color $1" ;;
  esac
}

wait_http_ok() {
  local url=$1
  local label=${2:-$url}
  local deadline=$((SECONDS + HEALTH_TIMEOUT_S))
  local body
  while [ "$SECONDS" -lt "$deadline" ]; do
    if body=$(curl -fsS -m 3 "$url" 2>/dev/null); then
      if printf '%s' "$body" | grep -q '"ok"'; then
        log "healthy: $label"
        return 0
      fi
    fi
    sleep 2
  done
  die "timeout waiting for $label ($url) after ${HEALTH_TIMEOUT_S}s"
}

wait_compose_healthy() {
  # Args: SERVICE then docker compose ... (remaining).
  # Prefer Health=healthy; if the engine omits Health, fall through to caller’s HTTP probe.
  local svc=$1
  shift
  local deadline=$((SECONDS + HEALTH_TIMEOUT_S))
  local st
  while [ "$SECONDS" -lt "$deadline" ]; do
    st=$("$@" ps --format json "$svc" 2>/dev/null | head -1 || true)
    if printf '%s' "$st" | grep -q '"Health":"healthy"'; then
      log "compose healthy: $svc"
      return 0
    fi
    # No health field at all (older engine) but container is running → let HTTP wait decide.
    if printf '%s' "$st" | grep -q '"State":"running"' \
      && ! printf '%s' "$st" | grep -q '"Health"'; then
      log "compose running (no Health field): $svc"
      return 0
    fi
    sleep 2
  done
  log "compose ps dump for $svc:"
  "$@" ps "$svc" || true
  die "timeout waiting compose health for $svc"
}

smoke_ports() {
  local api_port=$1 web_port=$2
  log "smoke api :$api_port / web :$web_port"
  wait_http_ok "http://127.0.0.1:${api_port}/healthz" "api/healthz"
  wait_http_ok "http://127.0.0.1:${web_port}/healthz-ssr" "web/healthz-ssr"
  # SSR home should include the data island when API is reachable
  local home
  home=$(curl -fsS -m 10 "http://127.0.0.1:${web_port}/" || true)
  printf '%s' "$home" | grep -q '__DEVCX_DATA__' \
    || die "smoke: SSR home missing __DEVCX_DATA__"
  log "smoke ok"
}

switch_nginx() {
  local api_port=$1 web_port=$2
  [ -n "${NGINX_CONF:-}" ] || die "bluegreen requires NGINX_CONF=/path/to/dev.cx.conf"
  [ -f "$NGINX_CONF" ] || die "NGINX_CONF not a file: $NGINX_CONF"

  local bak
  bak="${NGINX_CONF}.bak.$(date +%Y%m%d%H%M%S)"
  cp -a "$NGINX_CONF" "$bak"
  log "nginx backup → $bak"

  # Only rewrite the known local upstreams (keep other ports intact).
  if command -v perl >/dev/null 2>&1; then
    perl -pi -e "s#127\\.0\\.0\\.1:812[01]#127.0.0.1:${api_port}#g; s#127\\.0\\.0\\.1:312[01]#127.0.0.1:${web_port}#g" "$NGINX_CONF"
  else
    sed -i.bak_sed \
      -e "s#127.0.0.1:8120#127.0.0.1:${api_port}#g" \
      -e "s#127.0.0.1:8121#127.0.0.1:${api_port}#g" \
      -e "s#127.0.0.1:3120#127.0.0.1:${web_port}#g" \
      -e "s#127.0.0.1:3121#127.0.0.1:${web_port}#g" \
      "$NGINX_CONF"
  fi

  log "nginx reload: $NGINX_RELOAD_CMD"
  # shellcheck disable=SC2086
  eval $NGINX_RELOAD_CMD || {
    log "reload failed — restoring $bak"
    cp -a "$bak" "$NGINX_CONF"
    eval $NGINX_RELOAD_CMD || true
    die "nginx reload failed; conf restored"
  }
}

write_active_color() {
  mkdir -p "$STATE_DIR"
  printf '%s\n' "$1" >"$COLOR_FILE"
  log "active-color → $1 ($COLOR_FILE)"
}

release_rolling() {
  log "mode=rolling root=$ROOT"
  need_env
  cd "$ROOT"

  log "build images"
  "${PROD_COMPOSE[@]}" build api web

  log "recreate api (postgres stays up)"
  "${PROD_COMPOSE[@]}" up -d --no-deps --no-build api
  wait_compose_healthy api "${PROD_COMPOSE[@]}"
  wait_http_ok "http://127.0.0.1:${API_HOST_PORT:-8120}/healthz" "api/healthz"

  log "recreate web"
  "${PROD_COMPOSE[@]}" up -d --no-deps --no-build web
  wait_compose_healthy web "${PROD_COMPOSE[@]}"
  wait_http_ok "http://127.0.0.1:${WEB_HOST_PORT:-3120}/healthz-ssr" "web/healthz-ssr"

  if [ "${SKIP_SMOKE:-0}" != "1" ]; then
    smoke_ports "${API_HOST_PORT:-8120}" "${WEB_HOST_PORT:-3120}"
  fi

  # Keep active-color coherent if never set (rolling always serves blue ports).
  if [ ! -f "$COLOR_FILE" ]; then
    write_active_color blue
  fi

  log "prune dangling images"
  docker image prune -f >/dev/null || true
  log "rolling release done"
}

start_green_stack() {
  # Apps-only side stack on 8121/3121 (DB via host.docker.internal → primary postgres).
  local api_port=8121 web_port=3121
  log "start green stack ports api=$api_port web=$web_port"
  API_HOST_PORT=$api_port WEB_HOST_PORT=$web_port \
    docker compose -p devcx-green \
      -f "$BG_COMPOSE_FILE" \
      --env-file "$ENV_FILE" \
      build api web
  API_HOST_PORT=$api_port WEB_HOST_PORT=$web_port \
    docker compose -p devcx-green \
      -f "$BG_COMPOSE_FILE" \
      --env-file "$ENV_FILE" \
      up -d --no-build api web
  local bg=(docker compose -p devcx-green -f "$BG_COMPOSE_FILE" --env-file "$ENV_FILE")
  wait_compose_healthy api "${bg[@]}"
  wait_compose_healthy web "${bg[@]}"
  smoke_ports "$api_port" "$web_port"
}

start_blue_apps() {
  # Primary project api+web on 8120/3120; postgres already running.
  local api_port=8120 web_port=3120
  log "start blue apps ports api=$api_port web=$web_port"
  API_HOST_PORT=$api_port WEB_HOST_PORT=$web_port \
    "${PROD_COMPOSE[@]}" build api web
  API_HOST_PORT=$api_port WEB_HOST_PORT=$web_port \
    "${PROD_COMPOSE[@]}" up -d --no-deps --no-build api web
  wait_compose_healthy api "${PROD_COMPOSE[@]}"
  wait_compose_healthy web "${PROD_COMPOSE[@]}"
  smoke_ports "$api_port" "$web_port"
}

drain_color() {
  # Stop app containers for a color. Never touch postgres.
  case "$1" in
    blue)
      log "drain blue apps (postgres stays)"
      "${PROD_COMPOSE[@]}" stop api web || true
      ;;
    green)
      log "drain green side stack"
      docker compose -p devcx-green -f "$BG_COMPOSE_FILE" --env-file "$ENV_FILE" \
        stop api web || true
      docker compose -p devcx-green -f "$BG_COMPOSE_FILE" --env-file "$ENV_FILE" \
        rm -f api web || true
      ;;
    *)
      die "drain_color: unknown $1"
      ;;
  esac
}

release_bluegreen() {
  log "mode=bluegreen root=$ROOT"
  need_env
  cd "$ROOT"

  local active inactive
  active=$(read_active_color)
  inactive=$(other_color "$active")
  log "active=$active → deploying $inactive"

  local act_api act_web in_api in_web
  color_ports "$active"
  act_api=$API_PORT
  act_web=$WEB_PORT
  color_ports "$inactive"
  in_api=$API_PORT
  in_web=$WEB_PORT

  # Primary postgres must stay up for both colors.
  log "ensure primary postgres"
  "${PROD_COMPOSE[@]}" up -d postgres
  wait_compose_healthy postgres "${PROD_COMPOSE[@]}"

  # Bring up the free color on its ports while active still serves traffic.
  if [ "$inactive" = "green" ]; then
    start_green_stack
  else
    start_blue_apps
  fi

  log "flip nginx → api:$in_api web:$in_web (was $act_api/$act_web)"
  switch_nginx "$in_api" "$in_web"

  if [ "${SKIP_SMOKE:-0}" != "1" ]; then
    smoke_ports "$in_api" "$in_web"
  fi

  write_active_color "$inactive"
  drain_color "$active"

  docker image prune -f >/dev/null || true
  log "bluegreen release done (active=$(read_active_color))"
}

smoke_only() {
  need_env
  local active
  active=$(read_active_color)
  color_ports "$active"
  smoke_ports "$API_PORT" "$WEB_PORT"
}

# --- main ---
if [ "$SMOKE_ONLY" -eq 1 ]; then
  smoke_only
  exit 0
fi

case "$MODE" in
  rolling) release_rolling ;;
  bluegreen) release_bluegreen ;;
esac
