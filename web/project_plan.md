# dev.cx

> **真源声明**：产品/UI/业务以 2026-07-25 定稿冻结为准（Readdy demo 及其导出前端 + omni KB `dev-cx/` 域），本文件只是工程侧速览，与 KB 冲突时以 KB 为准。落地必读顺序：demo-source-of-truth → baseline-freeze → route-map → domain-model → user-flows → product-constitution → content-and-posting。本阶段不做方向性改版、视觉大改、prompt 整站重生成。

## 1. Project Description
dev.cx 是创造者的公开主页与项目驱动讨论社区。主页优先于论坛灌水；项目是一等公民；`/` 是社区发现（周焦点精选），不是官网 landing。产品气质「编辑式沉静」——质量优先于噪音。

定位：为公开创造过程与作品的人优化；欢迎读者、提问者、反馈者。长期兴趣项目，运营与商业化原则见 KB `dev-cx/operating-rhythm`、`dev-cx/monetization-principles`。

## 2. Design System
- 完整设计系统文档：`design-system.md`
- 核心原则：Ink & Paper / 墨与纸 — 六大设计原语（纸·墨·印·白·字·码）
- 设计 token：tailwind config + CSS variables (OKLCH)
- 字体栈：Noto Serif SC（展示标题）+ Noto Sans SC（UI/正文）+ JetBrains Mono（代码/句柄）
- 颜色：暖纸底色 + 深墨主色（暖炭色，< 5% 面积）+ 朱砂点缀（暖红，极度克制）+ 宣纸灰辅色
- 间距：4px 基准单位，单列 max-w-[720px]
- 圆角：2-3px（矩形感，拒绝药丸形）
- 动画：200-400ms 颜色/透明度过渡，无悬浮抬升/阴影/视差

## 3. Page Structure（对齐 KB route-map）
- `/` — 社区发现（刊首 + 本周焦点 + 正在讨论）
- `/@:handle` — 创造者主页
- `/p/:id` — 项目页；`/p/:id/settings` — 项目设置
- `/t/:id` — 帖子/讨论详情（Show | Build | Ask | Discuss）
- `/new` · `/compose` — 发布流；`/new-project` — 创建项目
- `/onboarding` — 注册引导；`/login` — 登录（邀请制文案）
- `/feed` — 最新时间流；`/explore` — 探索/全部作品
- `/weekly/:weekNumber` — 周刊/周主题（早期由周焦点 + 周状态拼装，不单独编辑成刊）
- `/notifications` — 通知
- `/me` · `/me/projects` · `/me/status` — 我的（主页/项目/本周状态）
- `/about` — 关于；`/guidelines` — 社区规范
- `/design-system` — 设计系统（可工程内私有）
- `*` — 404

三维入口：人 `/@:handle` · 项目 `/p/:id` · 帖 `/t/:id`。不做「首页 + 发现」双推荐入口：`/` 即社区发现。

## 4. Core Features
- [x] 设计系统：token、字体、颜色、间距、组件规范
- [x] 全局 shell：Navbar + MobileTabs + Footer
- [x] 全部页面 UI（上表全部路由，对齐冻结 demo；数据来自 `src/mocks/*`）
- [ ] API / DB / 真实鉴权（当前 `useAuth` 为 mock）
- [ ] 假数据换真数据
- [ ] 部署 dev.cx 与上线验收（公开 URL、首屏定位、移动端、社交预览、基本反馈入口）

## 5. Data Model Design
实体：User(@handle) · Project(/p/:id) · Post(/t/:id：Show | Build | Ask | Discuss) · Reply；关注（人/项目）、通知、周刊 weekly。项目页「提交反馈」生成关联讨论帖，支持合并重复讨论。详见 KB `dev-cx/domain-model`；落表设计在后端阶段进行。

handle 注意事项：唯一且是对外资产（`dev.cx/@you`）。工程侧需要：保留字清单（全部一级路由词 + 品牌词 + 易混淆字符限制）、GitHub 绑定归属验证（同名优先权）、改名后旧 handle 永久 301 不释放（`handle_history` 表）、@mention 存 user id、双层身份显示（displayName 主 + @handle mono 辅）。完整治理与 UX 政策见 KB `dev-cx/handle-policy`。

## 6. Backend / Third-party Integration Plan
- Supabase（候选）：Auth（邀请制注册）+ Postgres
- 待清理的模板残留依赖：`@stripe/react-stripe-js`、`firebase`、`recharts`（均未使用）
- 暂无其他第三方集成

## 7. Development Phase Plan

### Phase 1: 设计系统 + 全部页面 UI
- 产出：tailwind 配置、CSS 变量、字体系统、design-system.md、全部路由页面（mock 数据）
- 状态：✅ 完成（对齐 2026-07-25 冻结 demo）

### Phase 2: API / DB / 鉴权
- 领域模型落表；邀请制注册与登录（邀请码 + GitHub 优先，Google 后置）；handle 保留字清单与归属验证
- 档案页联系方式字段（builder 自选暴露 email / X / GitHub；MVP 无私信，见 KB `dev-cx/feature-boundaries`）
- 新组件：HandleField（实时校验 + `dev.cx/@you` 预览）、ContactLinks（档案联系方式）、VerifiedMark（GitHub 归属验证）
- Bug 修复（2026-07-25 审计）：`/@:handle` 路由自定义匹配（React Router 不支持段内参数，当前 `/@chip` 404）；档案页项目序号 NaN；404 页残留 Readdy 文案
- UI 对齐（审计裁决，详见 KB `dev-cx/ui-baseline-audit`）：首页 Discussion 收敛 5–8 条；Focus 桌面改紧凑竖排 1 主 + 2 弱；导航统一 发现(/) · 讨论(/feed) · 探索(/explore)；删 masthead 视差；onboarding 头像改上传

### Phase 3: 假数据换真数据
- 逐页替换 `src/mocks/*`；通知、关注、周刊拼装跑真
- ✅ C3(2026-07-27):按 `devCx 前端设计审阅.zip`(墨与纸视觉细化)全站落地——朱砂印章体系、双态首页(1b/4a)、行式列表(2a/3a)、产品详情/个人主页/登录/发布合并编辑器/创建产品/帖子详情/通知(2b–6b)、暗色暖炭 token(7a/7b);「项目→产品」命名统一;audience 字段(API+表单+详情);假 register/forgot 拆除、onboarding 步骤 2/3 真实落库、quick=1 链接修复、explore 真排序、moved_to SPA 跳转、404/noindex/immutable 缓存头。周刊 2d 版式与统计行/热度标记等待 B2 数据源点亮。

### Phase 4: 部署与上线验收
- 部署 dev.cx；按创作者台账验收项（公开 URL / 首屏 / 移动端 / 社交预览 / 反馈入口）过检后发正式上线帖
