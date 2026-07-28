# devCx 生产部署 runbook

## 1. 拓扑

CF → openresty(`deploy/nginx/dev.cx.conf`) → `127.0.0.1:3120` web SSR / `127.0.0.1:8120` api → compose 内 postgres。API 启动自动跑 goose 迁移，无需手动迁移步骤。

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
```

4. 安装 nginx conf：将 `deploy/nginx/dev.cx.conf` 复制进 1Panel openresty 容器的 conf.d 挂载目录，然后：

```bash
nginx -s reload
```

5. 证书（二选一）：
   - **Cloudflare Origin Cert**：在 CF 面板签发 Origin Certificate，落到 `/usr/local/openresty/nginx/conf/ssl/devcx/dev.cx.crt` 与 `.key`（路径与 conf 中一致）。
   - **acme http-01**：conf 已预留 `/.well-known/acme-challenge/` → `/www/acme_challenge`；签发后同样落到上述 ssl 路径。

## 3. 更新部署

```bash
rsync -az --delete --exclude .git --exclude node_modules --exclude web/dist --exclude deploy/.env ./ root@HOST:/opt/devcx/current/
ssh root@HOST 'cd /opt/devcx/current && docker compose -f deploy/compose.production.yml --env-file deploy/.env up -d --build'
```

`pgdata` 卷持久；API 启动自动迁移。

## 4. 冒烟清单

| 检查 | 期望 |
|---|---|
| `curl -s https://dev.cx/healthz-ssr` | 健康 |
| `curl -s https://dev.cx/api/posts` | JSON |
| `curl -sI https://dev.cx/` 与 body | 200 且含 `__DEVCX_DATA__` |
| `curl -sI https://dev.cx/assets/<hash>.js` | `cache-control` 含 `immutable` |
| 上传端点（IMGLI_TOKEN 缺失） | 503（非 500） |

## 5. 回滚

```bash
# 停当前栈
docker compose -f deploy/compose.production.yml --env-file deploy/.env down

# 重新 rsync 旧版本代码后再 up -d --build
# pgdata 卷不动
```
