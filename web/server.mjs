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

async function prefetch(plan, client) {
  // 全路由公用的会话探测：/api/me 未登录时 401/404，tryGet 吞掉 4xx 返回 null；
  // 5xx 会抛错，.catch 兜底成 null——会话探测绝不能把整页渲染拖下水。
  const auth = await client.tryGet('/api/me').then((r) => r?.user ?? null).catch(() => null)
  // 每个非 redirect 分支（含 404、static 兜底）都要注入 auth，好让 Navbar 首屏就是真实登录态。
  const withAuth = (out) => ({ ...out, data: { auth, ...(out.data ?? {}) } })

  switch (plan.kind) {
    case 'handle': {
      // 公开档案数据 + 旧 handle → 新 handle 的改名解析都由 /api/resolve/{handle}
      // 承担：命中返回用户本体，改名返回 { moved_to }，否则 404。
      const r = await client.tryGet(`/api/resolve/${encodeURIComponent(plan.handle)}`)
      if (!r) return withAuth({ status: 404, data: {} })
      if (r.moved_to) return { redirect: `/@${r.moved_to}` }
      return withAuth({ data: { user: r.user ?? r } })
    }
    case 'project': {
      const p = await client.tryGet(`/api/projects/${encodeURIComponent(plan.slug)}`)
      if (!p) return withAuth({ status: 404, data: {} })
      // timeline 端点原样透传信封({timeline:[...], discussions:[...]})——不像 project 分支
      // 那样拆一层,客户端重取路径走同一个 key 拿到的就是同一个信封,页面层用 unwrap 才需要
      // 处理不一致的地方是裸对象场景,这里两条路径形状本就一致,不需要 unwrap。
      const t = await client.tryGet(`/api/projects/${encodeURIComponent(plan.slug)}/timeline`)
      return withAuth({ data: { project: p.project ?? p, timeline: t ?? { timeline: [], discussions: [] } } })
    }
    case 'post': {
      const t = await client.tryGet(`/api/posts/${encodeURIComponent(plan.slug)}`)
      if (!t) return withAuth({ status: 404, data: {} })
      const r = await client.tryGet(`/api/posts/${encodeURIComponent(plan.slug)}/replies`)
      return withAuth({ data: { post: t.post ?? t, replies: r?.replies ?? [] } })
    }
    case 'feed': {
      // 原样透传 API 信封({posts,next_cursor})——客户端重取同一路径拿到的是同一形状,
      // 页面层直接读 .posts/.next_cursor,不需要 unwrap。
      const [r, stats] = await Promise.all([
        client.tryGet('/api/posts?limit=20'),
        client.tryGet('/api/stats'),
      ])
      return withAuth({ data: { posts: r ?? { posts: [], next_cursor: null }, stats: stats ?? null } })
    }
    case 'explore': {
      const [r, stats] = await Promise.all([
        // B2:探索默认「热门」(trending);「最新」由客户端切换取数
        client.tryGet('/api/projects?sort=trending&limit=20'),
        client.tryGet('/api/stats'),
      ])
      return withAuth({ data: { projects: r ?? { projects: [], next_cursor: null }, stats: stats ?? null } })
    }
    case 'home': {
      // 讨论区与 DiscussionPreview 客户端重取同路径:/api/posts?limit=8(全类型最新)。
      // 旧实现只拉 type=discuss|ask 再合并——真实内容大量是 show/build,硬刷新会注入
      // posts:[] ,而 useApiData 见到已定义的 SSR 值就不再客户端补取,首页讨论区永久空态。
      const [posts, proj, stats, weeklyLatest] = await Promise.all([
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
      })
    }
    case 'weekly': {
      // 路由只有周号(/weekly/:weekNumber,C 阶段冻结);年份取当前 ISO 年——
      // 首批期刊都在同一年,跨年后再扩路由。未发布/不存在 → null,页面走 comingSoon 空态。
      const year = new Date().getFullYear()
      const w = await client.tryGet(`/api/weekly/${year}/${encodeURIComponent(plan.week)}`)
      return withAuth({ data: { weekly: w ?? null } })
    }
    case 'notifications': {
      // 登录 cookie 已随 client 透传;匿名时 API 401,tryGet 吞掉返回 null → 页面走 LoginPrompt。
      const r = await client.tryGet('/api/notifications')
      return withAuth({ data: { notifications: r ?? null } })
    }
    case 'notfound':
      return withAuth({ status: 404, data: {} })
    default:
      return withAuth({ data: {} })
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

    res.statusCode = out.status ?? 200
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    res.end(page)
  } catch (err) {
    // 绝不白屏：降级为 SPA 骨架
    console.error('[ssr] render failed, falling back to shell:', err)
    res.statusCode = 200
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
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
