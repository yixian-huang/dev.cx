import { createServer as createHttpServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 5173)
const API_BASE = process.env.API_BASE || 'http://127.0.0.1:8787'
const SITE_ORIGIN = process.env.SITE_ORIGIN || `http://localhost:${PORT}`
const isProd = process.env.NODE_ENV === 'production'

// 浏览器同源 /api/* → 后端 API。生产通常由 nginx 分流;本地 SSR(dev:ssr)与直连 web
// 容器时必须在此转发,否则 fetch('/api/...') 会落到 SSR 拿到 HTML,注册/发帖全线假失败。
function proxyToApi(req, res) {
  let target
  try {
    target = new URL(req.url || '/', API_BASE)
  } catch {
    res.statusCode = 502
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: 'bad_gateway' }))
    return
  }
  const headers = { ...req.headers, host: target.host }
  // 避免上游按压缩体原样回写导致解码错乱;让 Node 走身份传输即可
  delete headers['accept-encoding']
  const lib = target.protocol === 'https:' ? httpsRequest : httpRequest
  const upstream = lib(
    target,
    { method: req.method, headers, timeout: 60_000 },
    (upRes) => {
      res.writeHead(upRes.statusCode || 502, upRes.headers)
      upRes.pipe(res)
    },
  )
  upstream.on('timeout', () => {
    upstream.destroy()
    if (!res.headersSent) {
      res.statusCode = 504
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ error: 'gateway_timeout' }))
    }
  })
  upstream.on('error', () => {
    if (!res.headersSent) {
      res.statusCode = 502
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ error: 'bad_gateway' }))
    }
  })
  req.pipe(upstream)
}

// 生产态在 main() 里一次性加载，供 handleSSR 复用；dev 态 vite 同理。
let vite = null
let templateProd = ''
let prodEntry = null
let sirvHandler = null

// ── 路由预取表：路径 → 取数逻辑。键是匹配函数，避免与 src/router/config 重复定义结构。
// 需要与 src/router/config.tsx 的具名一级路由保持同步：新增/删除顶层路由时一并更新。
const KNOWN_TOP = new Set([
  '', 'feed', 'explore', 'about', 'guidelines', 'privacy', 'terms', 'login', 'notifications',
  'me', 'compose', 'new', 'new-project', 'onboarding', 'design-system', 'weekly', 'p', 't',
  'verify-email', 'reset-password', 'admin',
])

// 首段允许带子段的顶层路由——对照 src/router/config.tsx 的 21 条逐一核对得出：
// /p/:id、/p/:id/settings（p）；/t/:id（t）；/me、/me/projects、/me/status（me）；
// /weekly/:weekNumber（weekly）。其余具名路由（feed/explore/about/guidelines/privacy/
// terms/login/notifications/compose/new/new-project/onboarding/design-system/
// verify-email/reset-password）在 config.tsx 里都只有单段形式，多带一段就是未知路径。
const MULTI_SEG_ALLOWLIST = new Set(['me', 'p', 't', 'weekly'])

// decodeURIComponent 对畸形 %xx 序列会抛出——路由匹配不能被一个坏的百分号编码打断，
// 抛出就原样使用（后续逻辑对着未解码的字符串做分段匹配依然是安全的，只是不会命中
// handle/project/post 分支，会走到下面的 notfound/static 兜底，不会 500）。
function safeDecode(pathname) {
  try {
    return decodeURIComponent(pathname)
  } catch {
    return pathname
  }
}

function routePlan(rawPathname) {
  const pathname = safeDecode(rawPathname)
  const segs = pathname.split('/').filter(Boolean)
  if (segs.length === 0) return { kind: 'home' }
  if (segs.length === 1 && segs[0].startsWith('@')) {
    return { kind: 'handle', handle: segs[0].slice(1) }
  }
  // 裸 /p、/t、/weekly（缺必需的子段）：config.tsx 里这三个只以 /p/:id、/t/:id、
  // /weekly/:weekNumber 形式存在，没有对应的单段路由。
  if (segs.length === 1 && ['p', 't', 'weekly'].includes(segs[0])) return { kind: 'notfound' }
  // 多段路径：首段必须是允许带子段的顶层路由之一，否则是未知路径。
  if (segs.length >= 2 && !MULTI_SEG_ALLOWLIST.has(segs[0])) return { kind: 'notfound' }
  if (segs[0] === 'p' && segs[1]) return { kind: 'project', slug: segs[1] }
  if (segs[0] === 't' && segs[1]) return { kind: 'post', slug: segs[1] }
  if (segs.length === 1 && segs[0] === 'feed') return { kind: 'feed' }
  if (segs.length === 1 && segs[0] === 'notifications') return { kind: 'notifications' }
  if (segs[0] === 'weekly' && segs[1]) return { kind: 'weekly', week: segs[1] }
  if (segs.length === 1 && segs[0] === 'explore') return { kind: 'explore' }
  if (segs.length === 1 && !KNOWN_TOP.has(segs[0])) return { kind: 'notfound' }
  return { kind: 'static' }
}

// 会话探测：未登录 401/404 → null；5xx 也吞掉。绝不能拖垮整页渲染。
// 与页面数据并行发起，避免「先 /api/me 再拉正文」的串行水位。
function fetchAuth(client) {
  return client.tryGet('/api/me').then((r) => r?.user ?? null).catch(() => null)
}

function withAuth(out, auth) {
  // 每个非 redirect 分支（含 404、static 兜底）都要注入 auth，好让 Navbar 首屏就是真实登录态。
  return { ...out, data: { auth, ...(out.data ?? {}) } }
}

async function prefetch(plan, client) {
  switch (plan.kind) {
    case 'handle': {
      // 公开档案：resolve + 默认 tab(works) + auth 并行。
      // works 的 SSR key 必须与 WorksTab 的 `works:${handle}` 一致，否则 hydrate 后仍会闪空再客户端补取。
      // 改名 {moved_to} 时丢弃 works 结果，只 301。
      const [auth, r, worksByPlan] = await Promise.all([
        fetchAuth(client),
        client.tryGet(`/api/resolve/${encodeURIComponent(plan.handle)}`),
        client.tryGet(`/api/users/${encodeURIComponent(plan.handle)}/projects`),
      ])
      if (!r) return withAuth({ status: 404, data: {} }, auth)
      if (r.moved_to) return { redirect: `/@${r.moved_to}` }
      const user = r.user ?? r
      const handle = (user && user.handle) || plan.handle
      let works = worksByPlan
      // resolve 若归一化了 handle（大小写/别名），按权威 handle 再取一次，保证 key 与 API 路径一致。
      if (handle !== plan.handle) {
        works = await client.tryGet(`/api/users/${encodeURIComponent(handle)}/projects`)
      }
      return withAuth({
        data: {
          user,
          [`works:${handle}`]: works ?? { projects: [] },
        },
      }, auth)
    }
    case 'project': {
      // project 本体与 timeline 并行（404 时 timeline 请求浪费可接受，换 TTFB）。
      // timeline 端点原样透传信封({timeline,discussions})，与客户端重取形状一致。
      const slug = encodeURIComponent(plan.slug)
      const [auth, p, t] = await Promise.all([
        fetchAuth(client),
        client.tryGet(`/api/projects/${slug}`),
        client.tryGet(`/api/projects/${slug}/timeline`),
      ])
      if (!p) return withAuth({ status: 404, data: {} }, auth)
      return withAuth({
        data: {
          project: p.project ?? p,
          timeline: t ?? { timeline: [], discussions: [] },
        },
      }, auth)
    }
    case 'post': {
      const slug = encodeURIComponent(plan.slug)
      const [auth, t, r] = await Promise.all([
        fetchAuth(client),
        client.tryGet(`/api/posts/${slug}`),
        client.tryGet(`/api/posts/${slug}/replies`),
      ])
      if (!t) return withAuth({ status: 404, data: {} }, auth)
      return withAuth({
        data: { post: t.post ?? t, replies: r?.replies ?? [] },
      }, auth)
    }
    case 'feed': {
      // 原样透传 API 信封({posts,next_cursor})——客户端重取同一路径拿到的是同一形状。
      const [auth, r, stats] = await Promise.all([
        fetchAuth(client),
        client.tryGet('/api/posts?limit=20'),
        client.tryGet('/api/stats'),
      ])
      return withAuth({
        data: { posts: r ?? { posts: [], next_cursor: null }, stats: stats ?? null },
      }, auth)
    }
    case 'explore': {
      const [auth, r, stats] = await Promise.all([
        fetchAuth(client),
        // B2:探索默认「热门」(trending);「最新」由客户端切换取数
        client.tryGet('/api/projects?sort=trending&limit=20'),
        client.tryGet('/api/stats'),
      ])
      return withAuth({
        data: { projects: r ?? { projects: [], next_cursor: null }, stats: stats ?? null },
      }, auth)
    }
    case 'home': {
      // 讨论区与 DiscussionPreview 客户端重取同路径:/api/posts?limit=8(全类型最新)。
      // 旧实现只拉 type=discuss|ask 再合并——真实内容大量是 show/build,硬刷新会注入
      // posts:[] ,而 useApiData 见到已定义的 SSR 值就不再客户端补取,首页讨论区永久空态。
      const [auth, posts, proj, stats, weeklyLatest] = await Promise.all([
        fetchAuth(client),
        client.tryGet('/api/posts?limit=8'),
        // B2:首页焦点 = trending(近 7 天回复热度)前 5
        client.tryGet('/api/projects?sort=trending&limit=5'),
        client.tryGet('/api/stats'),
        // 上期周刊行(B2):latest 未发布时 404 → null,刊头该行不渲染。
        client.tryGet('/api/weekly/latest'),
      ])
      return withAuth({
        data: {
          posts: posts ?? { posts: [], next_cursor: null },
          projects: proj ?? { projects: [], next_cursor: null },
          stats: stats ?? null,
          weekly_latest: weeklyLatest ?? null,
        },
      }, auth)
    }
    case 'weekly': {
      // 路由只有周号(/weekly/:weekNumber,C 阶段冻结);年份取当前 ISO 年——
      // 首批期刊都在同一年,跨年后再扩路由。未发布/不存在 → null,页面走 comingSoon 空态。
      const year = new Date().getFullYear()
      const [auth, w] = await Promise.all([
        fetchAuth(client),
        client.tryGet(`/api/weekly/${year}/${encodeURIComponent(plan.week)}`),
      ])
      return withAuth({ data: { weekly: w ?? null } }, auth)
    }
    case 'notifications': {
      // 登录 cookie 已随 client 透传;匿名时 API 401,tryGet 吞掉返回 null → 页面走 LoginPrompt。
      const [auth, r] = await Promise.all([
        fetchAuth(client),
        client.tryGet('/api/notifications'),
      ])
      return withAuth({ data: { notifications: r ?? null } }, auth)
    }
    case 'notfound': {
      const auth = await fetchAuth(client)
      return withAuth({ status: 404, data: {} }, auth)
    }
    default: {
      const auth = await fetchAuth(client)
      return withAuth({ data: {} }, auth)
    }
  }
}

// 正常 SSR 渲染时剔除 index.html 的 seo-fallback 块(含前置的说明注释行),让
// <!--app-head--> 注入的动态 head 成为唯一的 title/description/canonical 来源。
// shell() 降级路径不剔除——降级页没有动态 head,静态兜底就是它的标题。
function stripSeoFallback(template) {
  return template.replace(/[ \t]*<!-- seo-fallback[\s\S]*?<!--seo-fallback-start-->[\s\S]*?<!--seo-fallback-end-->\s*/, '')
}

function shell(template) {
  // 降级：占位符原样清空，客户端自己渲染
  // 用函数形式传入替换值：即便这里是静态空串本无 $ 模式风险，
  // 统一成函数形式可避免以后有人往这里塞动态内容时踩 $&/$' 的坑。
  return template
    .replace('<!--app-head-->', () => '')
    .replace('<!--app-html-->', () => '')
    .replace('<!--app-data-->', () => '')
}

// 连模板本身都没读到时（如 index.html 读取失败）的最后一道兜底：硬编码一个
// 最小骨架，保证 id="root" 与客户端入口脚本都在，浏览器仍能接管渲染。
const FALLBACK_SHELL = `<!doctype html>
<html>
  <head><meta charset="UTF-8" /></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/entry-client.tsx"></script>
  </body>
</html>
`

function serializeData(data) {
  // </script> 与 U+2028/2029 会破坏内联脚本
  const json = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
  return `<script>window.__DEVCX_DATA__=${json}</script>`
}

// ── /sitemap.xml:静态公开路由 + 项目/帖子/作者主页,从 API 分页收集(单类上限
// 10 页 × 50 条,冷启动阶段远够用;超出前先做分片 sitemap)。结果内存缓存 1 小时——
// 收录场景对新鲜度不敏感,不值得每次爬虫来访都打一轮 API。
const SITEMAP_STATIC = ['/', '/feed', '/explore', '/about', '/guidelines', '/privacy', '/terms']
let sitemapCache = { xml: '', at: 0 }
const SITEMAP_TTL_MS = 3600_000

function xmlEscape(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function buildSitemap() {
  const urls = new Set(SITEMAP_STATIC)
  const fetchJSON = async (path) => {
    try {
      const r = await fetch(API_BASE + path)
      return r.ok ? await r.json() : null
    } catch {
      return null
    }
  }
  const collect = async (endpoint, listKey, add) => {
    let cursor = ''
    for (let i = 0; i < 10; i++) {
      const q = cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
      const r = await fetchJSON(`${endpoint}?limit=50${q}`)
      const list = r?.[listKey]
      if (!list?.length) break
      for (const item of list) add(item)
      if (!r.next_cursor) break
      cursor = r.next_cursor
    }
  }
  await collect('/api/projects', 'projects', (p) => {
    if (p.slug) urls.add(`/p/${p.slug}`)
    if (p.author?.handle) urls.add(`/@${p.author.handle}`)
  })
  await collect('/api/posts', 'posts', (p) => {
    if (p.slug) urls.add(`/t/${p.slug}`)
    if (p.author?.handle) urls.add(`/@${p.author.handle}`)
  })
  const body = [...urls]
    .map((u) => `<url><loc>${xmlEscape(SITE_ORIGIN + u)}</loc></url>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
}

async function handleSitemap(res) {
  if (!sitemapCache.xml || Date.now() - sitemapCache.at > SITEMAP_TTL_MS) {
    sitemapCache = { xml: await buildSitemap(), at: Date.now() }
  }
  res.setHeader('content-type', 'application/xml; charset=utf-8')
  res.setHeader('cache-control', 'public, max-age=3600')
  res.end(sitemapCache.xml)
}

// 与 api CookieName 一致——有 session 的 HTML 含 auth 岛,绝不能进共享缓存。
const SESSION_COOKIE = 'devcx_session'

// 可匿名短缓存的公开路径(与 meta 私有前缀互补)。写路径 / 登录态页一律 no-store。
function isPublicCacheablePath(pathname) {
  if (!pathname || pathname === '/index.html') return false
  // 私有/写路径
  const privateExact = new Set([
    '/me', '/notifications', '/compose', '/new', '/new-project', '/onboarding',
    '/login', '/admin', '/verify-email', '/reset-password', '/design-system',
  ])
  if (privateExact.has(pathname)) return false
  if (pathname.startsWith('/me/')) return false
  if (pathname.startsWith('/admin')) return false
  if (pathname.startsWith('/p/') && pathname.endsWith('/settings')) return false
  // 公开实体 + 列表 + 静态说明页
  if (pathname === '/') return true
  if (pathname === '/feed' || pathname === '/explore') return true
  if (pathname === '/about' || pathname === '/guidelines' || pathname === '/privacy' || pathname === '/terms') return true
  if (pathname.startsWith('/@')) return true
  if (/^\/p\/[^/]+$/.test(pathname)) return true
  if (/^\/t\/[^/]+$/.test(pathname)) return true
  if (/^\/weekly\/[^/]+$/.test(pathname)) return true
  return false
}

function hasSessionCookie(cookieHeader) {
  if (!cookieHeader) return false
  // 简单包含匹配够用:Set-Cookie 名固定,值不含该名作为子串的风险可忽略
  return cookieHeader.split(';').some((part) => {
    const p = part.trim()
    return p === SESSION_COOKIE || p.startsWith(`${SESSION_COOKIE}=`)
  })
}

/** 匿名公开页允许 CDN 短缓存;有 session 或私有路径 no-store。始终 Vary: Cookie。 */
function setHtmlCacheHeaders(res, { pathname, cookieHeader, status }) {
  res.setHeader('vary', 'Cookie')
  // 4xx/5xx 与降级壳不共享缓存,避免把错误页钉在边缘
  if (status && status >= 400) {
    res.setHeader('cache-control', 'private, no-store')
    return
  }
  if (hasSessionCookie(cookieHeader) || !isPublicCacheablePath(pathname)) {
    res.setHeader('cache-control', 'private, no-store')
    return
  }
  // 浏览器不长缓存(max-age=0),边缘 60s + SWR 降低回源;内容站新鲜度可接受。
  res.setHeader('cache-control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=120')
}

async function handleSSR(req, res, url) {
  const pathname = url.pathname
  // metaForRoute/canonicalPath 做的是字面量前缀匹配（如 pathname.startsWith('/@')），跟
  // react-router 的参数匹配不是一回事——后者内部会自己解码路由参数，前者不会，所以要显式
  // 传解码后的路径，否则 /%40chip 会被误判成普通静态页而拿到错误的 <title>/canonical。
  const decodedPathname = safeDecode(pathname)

  let template
  let render, createClient, metaForRoute, renderHeadTags, canonicalPath
  try {
    if (isProd) {
      template = templateProd
      render = prodEntry.render
      createClient = prodEntry.createClient
      metaForRoute = prodEntry.metaForRoute
      renderHeadTags = prodEntry.renderHeadTags
      canonicalPath = prodEntry.canonicalPath
    } else {
      template = await readFile(resolve(__dirname, 'index.html'), 'utf8')
      template = await vite.transformIndexHtml(pathname, template)
      const entryMod = await vite.ssrLoadModule('/src/entry-server.tsx')
      render = entryMod.render
      const apiMod = await vite.ssrLoadModule('/src/lib/api.ts')
      createClient = apiMod.createClient
      const metaMod = await vite.ssrLoadModule('/src/lib/meta.ts')
      metaForRoute = metaMod.metaForRoute
      renderHeadTags = metaMod.renderHeadTags
      canonicalPath = metaMod.canonicalPath
    }
  } catch (err) {
    // 绝不白屏：模板/模块加载失败也必须降级为 SPA 骨架，而不是 500
    console.error('[ssr] template/module load failed, falling back to shell:', err)
    res.statusCode = 200
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    res.end(template ? shell(template) : FALLBACK_SHELL)
    return
  }

  try {
    const client = createClient({ baseURL: API_BASE, cookie: req.headers.cookie })

    const plan = routePlan(pathname)
    const out = await prefetch(plan, client)

    if (out.redirect) {
      res.statusCode = 301
      res.setHeader('location', out.redirect)
      res.end()
      return
    }

    const data = out.data ?? {}
    const meta = metaForRoute(decodedPathname, data)
    const { html } = await render(pathname + url.search, data)

    // 传函数而非字符串：字符串形式的替换参数会把 $&/$'/$`/$$ 解析成特殊
    // 替换模式，用户内容（display_name/bio 等）里恰好出现这些序列时会
    // 把匹配到的占位符或模板其它片段错误地拼接进来，函数形式是字面量安全的。
    const page = stripSeoFallback(template)
      .replace('<!--app-head-->', () => renderHeadTags(meta, SITE_ORIGIN + canonicalPath(decodedPathname)))
      .replace('<!--app-html-->', () => html)
      .replace('<!--app-data-->', () => serializeData(data))

    const status = out.status ?? 200
    res.statusCode = status
    res.setHeader('content-type', 'text/html; charset=utf-8')
    setHtmlCacheHeaders(res, {
      pathname: decodedPathname,
      cookieHeader: req.headers.cookie,
      status,
    })
    res.end(page)
  } catch (err) {
    // 绝不白屏：降级为 SPA 骨架
    console.error('[ssr] render failed, falling back to shell:', err)
    res.statusCode = 200
    res.setHeader('content-type', 'text/html; charset=utf-8')
    setHtmlCacheHeaders(res, {
      pathname: decodedPathname,
      cookieHeader: req.headers.cookie,
      status: 200,
    })
    // 降级壳可能缺 auth 岛——即便路径公开也勿共享缓存,避免把空壳钉在边缘
    res.setHeader('cache-control', 'private, no-store')
    res.end(shell(template))
  }
}

async function main() {
  if (isProd) {
    templateProd = await readFile(resolve(__dirname, 'dist/client/index.html'), 'utf8')
    // 生产态一次性加载：render/createClient/metaForRoute/renderHeadTags/canonicalPath
    // 五个符号都从 src/entry-server.tsx 的（再）导出里取，见该文件顶部的 re-export。
    prodEntry = await import('./dist/server/entry-server.js')
    const { default: sirv } = await import('sirv')
    sirvHandler = sirv(resolve(__dirname, 'dist/client'), {
      extensions: [],
      gzip: true,
      // /assets/ 下是 vite 内容指纹(hashed)产物,内容变则文件名变——一年 immutable 安全;
      // 其余静态文件(favicon.svg 等非指纹名)不加长缓存,改了要能生效。
      setHeaders(res, pathname) {
        if (pathname.startsWith('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        }
      },
    })
  } else {
    const { createServer } = await import('vite')
    vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', root: __dirname })
  }

  const server = createHttpServer((req, res) => {
    const url = new URL(req.url, SITE_ORIGIN)

    if (url.pathname === '/healthz-ssr') {
      res.setHeader('content-type', 'application/json')
      res.end('{"ok":true}')
      return
    }

    // 同源 API 转发(须在 SSR/静态之前)
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      proxyToApi(req, res)
      return
    }
    if (url.pathname === '/healthz') {
      proxyToApi(req, res)
      return
    }

    // dist/client/index.html（生产态）与 vite 的 /index.html（开发态）都是带
    // 占位符注释的 SSR 模板本体，不是渲染好的页面：sirv/vite 若把它当静态
    // 文件原样吐出去，客户端会拿到空的 <!--app-html--> 注释节点，
    // hasChildNodes() 判断失真导致对着占位符 hydrate。统一 301 到 '/' 让请求
    // 落回 SSR 分发。
    if (url.pathname === '/index.html') {
      res.statusCode = 301
      res.setHeader('location', '/')
      res.end()
      return
    }

    // sitemap 在静态分发之前拦截——dist/client 里没有这个文件,但语义上它属于服务端
    // 动态资源,不该有机会被静态层接管。
    if (url.pathname === '/sitemap.xml') {
      void handleSitemap(res)
      return
    }

    if (isProd) {
      // sirv 命中就直接返回，未命中调 next() 落到 SSR
      sirvHandler(req, res, () => { void handleSSR(req, res, url) })
      return
    }
    vite.middlewares(req, res, () => { void handleSSR(req, res, url) })
  })

  server.listen(PORT, () => console.log(`[ssr] listening on ${PORT} (api ${API_BASE})`))
}

main().catch((err) => {
  console.error('[ssr] fatal', err)
  process.exit(1)
})
