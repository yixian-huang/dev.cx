import type { SSRData } from './ssr-data'

export type PageMeta = {
  title: string
  description: string
  ogType: string
  noindex: boolean
  // 分享卡片图(og:image/twitter:image):项目页取第一张截图,主页取头像;无则不发该标签。
  image?: string
}

export const SITE = 'dev.cx'
// 品牌语单一来源(与 index.html 的 seo-fallback 块同句)。定位三层:社区是身份、
// 产品驱动是机制、公共档案是着力点;「创造者体验(cx)」只进 About/规范页的品牌故事,
// 不进定位语(2026-07-28 用户定稿)。
export const SITE_TAGLINE = '产品驱动的创造者社区'
const DEFAULT_DESC = 'dev.cx 是产品驱动的创造者社区：每个创造者有一份持续更新的公共档案，讨论锚定在产品上。不限制工具，不区分身份——重要的是你在创造。'

const PRIVATE_PREFIXES = [
  '/me', '/notifications', '/compose', '/new', '/new-project', '/onboarding', '/login',
  // 运营台与两个 token 页(邮箱验证/重置密码)同为不可收录路径。
  '/admin', '/verify-email', '/reset-password',
]

function isPrivate(pathname: string): boolean {
  // 项目设置页是写路径(且现在会被 SSR),同私有页一样不收录(C3 清单项)。
  if (pathname.startsWith('/p/') && pathname.endsWith('/settings')) return true
  return PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

function pick(obj: unknown, key: string): string {
  if (obj && typeof obj === 'object' && key in obj) {
    const v = (obj as Record<string, unknown>)[key]
    if (typeof v === 'string') return v
  }
  return ''
}

export function metaForRoute(pathname: string, data: SSRData): PageMeta {
  const noindex = isPrivate(pathname)

  if (pathname.startsWith('/@')) {
    const u = data.user
    const name = pick(u, 'display_name')
    const handle = pick(u, 'handle') || pathname.slice(2)
    const bio = pick(u, 'bio')
    return {
      title: name ? `${name} · @${handle} — ${SITE}` : `@${handle} — ${SITE}`,
      description: bio || `${name || handle} 在 ${SITE} 的创造者主页。`,
      ogType: 'profile',
      noindex,
      image: pick(u, 'avatar_url') || undefined,
    }
  }

  if (pathname.startsWith('/p/')) {
    const p = data.project
    const name = pick(p, 'name') || pathname.slice(3)
    const shots = p && typeof p === 'object' && Array.isArray((p as Record<string, unknown>).screenshots)
      ? ((p as Record<string, unknown>).screenshots as unknown[])
      : []
    const firstShot = typeof shots[0] === 'string' ? (shots[0] as string) : undefined
    return {
      title: `${name} — ${SITE}`,
      description: pick(p, 'tagline') || `${name} 的项目主页与更新记录。`,
      ogType: 'article',
      noindex,
      image: firstShot,
    }
  }

  if (pathname.startsWith('/weekly/')) {
    const week = pathname.split('/')[2] ?? ''
    return {
      title: `周刊 VOL.${week} — ${SITE}`,
      description: `${SITE} 社区周刊第 ${week} 期:本周产品动态与讨论精选。`,
      ogType: 'article',
      noindex,
    }
  }

  if (pathname.startsWith('/t/')) {
    const t = data.post
    const title = pick(t, 'title') || '讨论'
    return {
      title: `${title} — ${SITE}`,
      description: pick(t, 'body_md').slice(0, 140) || `${SITE} 上的一场讨论。`,
      ogType: 'article',
      noindex,
    }
  }

  const staticTitles: Record<string, string> = {
    '/': `${SITE} — ${SITE_TAGLINE}`,
    '/feed': `最新 — ${SITE}`,
    '/explore': `探索 — ${SITE}`,
    '/about': `关于 — ${SITE}`,
    '/guidelines': `社区规范 — ${SITE}`,
    '/privacy': `隐私政策 — ${SITE}`,
    '/terms': `用户协议 — ${SITE}`,
    '/verify-email': `邮箱验证 — ${SITE}`,
    '/reset-password': `重置密码 — ${SITE}`,
    '/admin': `运营台 — ${SITE}`,
    '/me/drafts': `草稿箱 — ${SITE}`,
  }
  return {
    title: staticTitles[pathname] ?? `${SITE}`,
    description: DEFAULT_DESC,
    ogType: 'website',
    noindex,
  }
}

// 规范化 canonical 链接的路径部分：去掉尾部一个或多个 '/'（首页 '/' 本身保留，不能被
// 削成空串）。裸 /p、/t、/weekly 4xx 之外，形如 /feed/ 这类误带尾斜杠的合法路径也不该
// 生成两个不同的 canonical URL 指向同一页面。
export function canonicalPath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/'
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderHeadTags(meta: PageMeta, canonicalURL: string): string {
  const t = esc(meta.title)
  const d = esc(meta.description)
  const u = esc(canonicalURL)
  // 有图时:og:image + twitter:image;项目页(article)用大图卡片,主页头像保持小卡片。
  const card = meta.image && meta.ogType === 'article' ? 'summary_large_image' : 'summary'
  const lines = [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}">`,
    `<link rel="canonical" href="${u}">`,
    `<meta property="og:site_name" content="${SITE}">`,
    `<meta property="og:type" content="${esc(meta.ogType)}">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:url" content="${u}">`,
    `<meta name="twitter:card" content="${card}">`,
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,
  ]
  if (meta.image) {
    lines.push(`<meta property="og:image" content="${esc(meta.image)}">`)
    lines.push(`<meta name="twitter:image" content="${esc(meta.image)}">`)
  }
  if (meta.noindex) lines.push(`<meta name="robots" content="noindex">`)
  return lines.join('\n    ')
}
