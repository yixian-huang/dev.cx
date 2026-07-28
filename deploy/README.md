# devCx 生产部署 runbook

## 1. 拓扑

```
CF → openresty(deploy/nginx/dev.cx.conf)
       ├─ /api/*  → 127.0.0.1:8120  (or :8121 when green is active)
       └─ /*      → 127.0.0.1:3120  (or :3121)
              → compose api / web → postgres (127.0.0.1:5432 host-only)
```

API 启动自动跑 goose 迁移，无需手动迁移步骤。

| 颜色 | API host port | Web host port | Compose 项目 |
|---|---|---|---|
| blue（默认 active） | 8120 | 3120 | `devcx`（`compose.production.yml`） |
| green | 8121 | 3121 | `devcx-green`（`compose.bluegreen.yml`） |

Active 颜色记录在 `/opt/devcx/active-color`（由 `release.sh` 维护）。

## 2. 首次部署

1. rsync 代码到主机：

```bash
rsync -az --delete --exclude .git --exclude node_modules --exclude web/dist --exclude deploy/.env ./ root@HOST:/opt/devcx/current/
```

2. 写 `deploy/.env`（勿入库）：

```bash
# 在 /opt/devcx/current/deploy/ 下
cp .env.example .env
# POSTGRES_PASSWORD: openssl rand -hex 24
# IMGLI_TOKEN: 主机上 img.li 服务配置中的 token
# IMGLI_BASE: 默认 https://img.li
```

3. 启动 compose：

```bash
cd /opt/devcx/current
docker compose -f deploy/compose.production.yml --env-file deploy/.env up -d --build
# 或等价：
./deploy/release.sh --mode rolling
```

4. 安装 nginx conf：将 `deploy/nginx/dev.cx.conf` 复制进 1Panel openresty 容器的 conf.d 挂载目录，然后：

```bash
nginx -s reload
```

5. 证书（二选一）：
   - **Cloudflare Origin Cert**：在 CF 面板签发 Origin Certificate，落到 `/usr/local/openresty/nginx/conf/ssl/devcx/dev.cx.crt` 与 `.key`（路径与 conf 中一致）。
   - **acme http-01**：conf 已预留 `/.well-known/acme-challenge/` → `/www/acme_challenge`；签发后同样落到上述 ssl 路径。

## 3. 日常发布（推荐 `release.sh`）

**先同步代码，再在主机上跑 release**（不要再手写 `up -d --build` recreate 整栈）。

```bash
rsync -az --delete \
  --exclude .git --exclude node_modules --exclude web/dist --exclude deploy/.env \
  ./ root@HOST:/opt/devcx/current/

ssh root@HOST 'cd /opt/devcx/current && ./deploy/release.sh --mode rolling'
```

### 3.1 rolling（默认，本周起用）

流程：

1. `docker compose build api web`（旧容器仍在接流量）
2. 只 recreate **api** → 等 `/healthz` + compose health
3. 只 recreate **web** → 等 `/healthz-ssr`
4. 本地 smoke（health + SSR `__DEVCX_DATA__`）
5. `docker image prune`

用户可见中断通常压到 **api 切换那几秒**（远好于整栈 recreate 的数十秒 502）。Postgres 全程不重启。

### 3.2 bluegreen（≈0 停机）

前提：

- 主栈 postgres 已在跑，且 `127.0.0.1:5432` 已 publish（见 `compose.production.yml`）
- 知道线上 openresty vhost 路径，例如：

```bash
export NGINX_CONF=/usr/local/openresty/nginx/conf/conf.d/dev.cx.conf
# 若 reload 必须进容器：
export NGINX_RELOAD_CMD='docker exec openresty nginx -s reload'
```

发布：

```bash
cd /opt/devcx/current
NGINX_CONF=... NGINX_RELOAD_CMD=... ./deploy/release.sh --mode bluegreen
```

流程：

1. 读 `/opt/devcx/active-color`（默认 `blue`）
2. 在 **空闲颜色** 端口上起 `compose.bluegreen.yml` 侧栈（api+web only，DB 走 `host.docker.internal:5432`）
3. 侧栈 health + smoke 通过后改 nginx upstream 端口并 reload
4. 写新 active-color，**stop** 旧颜色的 api/web（**不动 postgres**）

回滚（nginx 指回旧端口即可，旧容器若已 stop 需再 `up`）：

```bash
# 例：当前 green 有问题，切回 blue 端口
NGINX_CONF=... perl -pi -e 's/127\.0\.0\.1:8121/127.0.0.1:8120/g; s/127\.0\.0\.1:3121/127.0.0.1:3120/g' "$NGINX_CONF"
eval "$NGINX_RELOAD_CMD"
# 若 blue 容器已 stop：
cd /opt/devcx/current
docker compose -f deploy/compose.production.yml --env-file deploy/.env up -d api web
echo blue > /opt/devcx/active-color
```

### 3.3 npc 约定

```text
file sync → npc server exec … 'cd /opt/devcx/current && ./deploy/release.sh'
```

禁止在 exec 里手写 `docker compose … up -d --build` 整栈 recreate（会再次引入 502 窗口）。

## 4. 冒烟清单

本地（release 已覆盖子集）：

| 检查 | 期望 |
|---|---|
| `curl -s http://127.0.0.1:8120/healthz`（或 active 端口） | `{"ok":true}` |
| `curl -s http://127.0.0.1:3120/healthz-ssr` | `{"ok":true}` |
| `curl -s http://127.0.0.1:3120/` | body 含 `__DEVCX_DATA__` |

公网：

| 检查 | 期望 |
|---|---|
| `curl -s https://dev.cx/healthz-ssr` | 健康 |
| `curl -s https://dev.cx/api/posts` | JSON |
| `curl -sI https://dev.cx/` 与 body | 200 且含 `__DEVCX_DATA__` |
| `curl -sI https://dev.cx/assets/<hash>.js` | `cache-control` 含 `immutable` |
| 上传端点（IMGLI_TOKEN 缺失） | 503（非 500） |

仅 smoke：

```bash
./deploy/release.sh --smoke-only
```

## 5. 回滚

### rolling 发布后

```bash
# 重新 rsync 旧 git ref 到 /opt/devcx/current 后：
./deploy/release.sh --mode rolling
# pgdata / devcx_pgdata 卷不动
```

紧急整栈（会有中断，仅灾备）：

```bash
docker compose -f deploy/compose.production.yml --env-file deploy/.env down
# rsync 旧版本后再 up -d --build；pgdata 卷保留
```

### 迁移纪律（任何模式都适用）

坏迁移锁表仍会造成实质停写。规则：

- 迁移必须 **向前兼容**（先加列/表，双写或可空，再切读；禁止发布依赖「立刻锁全表 rewrite」的迁移）
- 大表变更拆窗口，必要时维护公告

## 6. 文件索引

| 路径 | 作用 |
|---|---|
| `compose.production.yml` | 主栈 postgres+api+web；healthcheck；端口可覆写 |
| `compose.bluegreen.yml` | 侧栈 api+web only；默认 8121/3121 |
| `release.sh` | rolling / bluegreen 发布入口 |
| `Dockerfile.api` / `Dockerfile.web` | 含 `wget` 供 HEALTHCHECK |
| `nginx/dev.cx.conf` | openresty vhost 模板（默认蓝端口） |
| `ops/devcx-health.sh` | 定时探活 + TG 告警 |
