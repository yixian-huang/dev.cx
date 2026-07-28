#!/bin/bash
# devcx 生产健康检查:api healthz / 容器存活 / 磁盘 / 备份新鲜度。
# 连续 2 次失败才告警(抑制抖动),恢复时发解除消息。凭据在 /opt/devcx/ops.env(600)。
set -u

ENV_FILE=/opt/devcx/ops.env
STATE=/var/tmp/devcx-health.state   # 内容:连续失败次数
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

fails=()

curl -fsS -m 10 http://127.0.0.1:8120/healthz >/dev/null 2>&1 || fails+=("api /healthz")

for c in devcx-api-1 devcx-web-1 devcx-postgres-1; do
  state=$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null)
  [ "$state" = "true" ] || fails+=("container $c")
done

disk=$(df --output=pcent / | tail -1 | tr -dc '0-9')
[ "${disk:-0}" -lt 90 ] || fails+=("disk ${disk}%")

# 备份新鲜度:最近 26 小时内应有新 dump(每日 04:45 跑)
newest=$(find /opt/devcx/backup -name 'devcx-*.sql.gz' -mmin -1560 2>/dev/null | head -1)
[ -n "$newest" ] || fails+=("backup stale (>26h)")

tg_send() {
  [ -n "${TG_BOT_TOKEN:-}" ] && [ -n "${TG_CHAT_ID:-}" ] || return 0
  curl -fsS -m 10 "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
    -d chat_id="${TG_CHAT_ID}" -d text="$1" >/dev/null 2>&1
}

prev=$(cat "$STATE" 2>/dev/null || echo 0)
if [ ${#fails[@]} -gt 0 ]; then
  cur=$((prev + 1))
  echo "$cur" > "$STATE"
  echo "$(date -Is) FAIL($cur): ${fails[*]}"
  # 恰好达到第 2 次才发,避免持续故障每 15 分钟刷屏;后续故障静默,恢复时发解除。
  if [ "$cur" -eq 2 ]; then
    tg_send "🔴 dev.cx health: ${fails[*]}"
  fi
else
  echo "0" > "$STATE"
  if [ "$prev" -ge 2 ]; then
    tg_send "🟢 dev.cx health: recovered"
  fi
  echo "$(date -Is) OK"
fi
