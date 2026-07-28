# dev.cx

**产品驱动的创造者社区** · A product-driven creator community.

每个创造者有一份持续更新的公共档案,讨论锚定在产品上。不限制工具,不区分身份——你手写代码也好,用 AI 也罢,重要的是你在创造。

线上:[dev.cx](https://dev.cx)(邀请制)

## 技术栈

- **api/** — Go(net/http + pgx),PostgreSQL,goose 自动迁移,无框架
- **web/** — React 19 + Vite SSR(自建 server.mjs),Tailwind,i18next(zh/en)
- **deploy/** — Docker compose 生产编排(compose.production.yml + Dockerfile ×2)

## 本地起步

```bash
# 1. 起开发/测试数据库(postgres :5432 / 测试库 :5433)
docker compose up -d

# 2. API
cd api && go run ./cmd/server

# 3. Web(SSR 开发模式)
cd web && npm install && npm run dev:ssr
```

测试:

```bash
cd api && TEST_DATABASE_URL='postgres://devcx:devcx@localhost:5433/devcx_test?sslmode=disable' go test ./...
cd web && npm run type-check && npm run test:ssr
```

## 维护边界

这是长期兴趣项目,由一个人按个人节奏维护:issue 欢迎,PR 不承诺响应时限,运营者也会有暂停周。社区规范与条款见站内 [/guidelines](https://dev.cx/guidelines) 与 [/terms](https://dev.cx/terms)。

本仓库是全新历史快照发布(内部运营文档不随源码公开),历史自开源日起。

## License

[AGPL-3.0](./LICENSE) — 你可以阅读、修改、自部署;基于本代码对外提供网络服务的衍生版本,须以同等许可开源。
