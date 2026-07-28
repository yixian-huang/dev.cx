#!/bin/bash
# 每周一早的运营心跳提醒(KB operating-rhythm):只提醒不代办,允许 paused、可无视。
# 附 48h 未获他人回复的 Show/Ask 清单——回复保障(最不可牺牲承诺)的唯一仪表。
set -u
ENV_FILE=/opt/devcx/ops.env
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
[ -n "${TG_BOT_TOKEN:-}" ] && [ -n "${TG_CHAT_ID:-}" ] || { echo "$(date -Is) no telegram creds"; exit 1; }

WEEK=$(date +%V)
YEAR=$(date +%G)

UNANSWERED=$(docker exec devcx-postgres-1 psql -U devcx -t -A devcx -c "
select '· ['||po.type||'] '||po.title||' — https://dev.cx/t/'||po.slug
from posts po
where po.type in ('show','ask')
  and po.merged_into is null and po.hidden_at is null
  and po.created_at > now() - interval '14 days'
  and po.created_at < now() - interval '48 hours'
  and not exists (
    select 1 from replies r
    where r.post_id = po.id and r.author_id <> po.author_id and r.hidden_at is null)
limit 10" 2>/dev/null)

MSG="📋 dev.cx 每周心跳(${YEAR}-W${WEEK})
· 周焦点策展(~30min)
· mkweekly 拼装 W${WEEK}(密度够才发)
· 邀请闸门:上一批过半完成主页+一帖了吗
· 本周在做(/me/status)+ 1 条 Build/Show"

if [ -n "$UNANSWERED" ]; then
  MSG="$MSG

⚠️ 48h 内无人回复的 Show/Ask:
$UNANSWERED"
fi

curl -fsS -m 10 "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
  -d chat_id="${TG_CHAT_ID}" --data-urlencode text="$MSG" >/dev/null && echo "$(date -Is) sent"
