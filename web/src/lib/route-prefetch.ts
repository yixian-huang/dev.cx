import { prefetchApi } from './api-cache'

/**
 * 站内路径 → 客户端应预取的 API 列表。
 * 与 server.mjs routePlan/prefetch 对齐(不必 100% 字段同形,命中 useApiData 的 path 即可)。
 */
export function apiPathsForRoute(pathname: string): string[] {
  const segs = pathname.split('/').filter(Boolean)
  if (segs.length === 0) {
    return [
      '/api/posts?limit=8',
      '/api/projects?sort=trending&limit=5',
      '/api/stats',
      '/api/weekly/latest',
    ]
  }
  if (segs.length === 1 && segs[0].startsWith('@')) {
    const handle = segs[0].slice(1)
    if (!handle) return []
    const h = encodeURIComponent(handle)
    return [`/api/resolve/${h}`, `/api/users/${h}/projects`]
  }
  if (segs[0] === 'p' && segs[1] && segs.length === 2) {
    const slug = encodeURIComponent(segs[1])
    return [`/api/projects/${slug}`, `/api/projects/${slug}/timeline`]
  }
  if (segs[0] === 't' && segs[1] && segs.length === 2) {
    const slug = encodeURIComponent(segs[1])
    return [`/api/posts/${slug}`, `/api/posts/${slug}/replies`]
  }
  if (segs.length === 1 && segs[0] === 'feed') {
    return ['/api/posts?limit=20', '/api/stats']
  }
  if (segs.length === 1 && segs[0] === 'explore') {
    return ['/api/projects?sort=trending&limit=20', '/api/stats']
  }
  if (segs[0] === 'weekly' && segs[1]) {
    const year = new Date().getFullYear()
    return [`/api/weekly/${year}/${encodeURIComponent(segs[1])}`]
  }
  return []
}

const scheduled = new Set<string>()

/** 空闲时预取路由相关 API(pointerover / touchstart 触发)。 */
export function prefetchRoute(pathname: string): void {
  if (typeof window === 'undefined') return
  let path = pathname
  try {
    // 允许传入绝对 URL path
    if (path.startsWith('http')) path = new URL(path).pathname
  } catch {
    return
  }
  // strip base if any
  const base = typeof __BASE_PATH__ === 'string' ? __BASE_PATH__.replace(/\/$/, '') : ''
  if (base && path.startsWith(base)) path = path.slice(base.length) || '/'
  if (!path.startsWith('/')) path = `/${path}`

  if (scheduled.has(path)) return
  scheduled.add(path)
  // 短防抖窗口后允许再次预取(用户在列表上反复 hover 同一链)
  window.setTimeout(() => scheduled.delete(path), 8_000)

  const paths = apiPathsForRoute(path)
  for (const p of paths) {
    void prefetchApi(p).catch(() => {
      /* 预取失败静默;真正导航时 useApiData 会再取 */
    })
  }
}

/** 挂到 document:同源 <a> 悬停/触碰时预取。返回卸载函数。 */
export function installLinkPrefetch(): () => void {
  if (typeof document === 'undefined') return () => {}

  const onIntent = (ev: Event) => {
    const t = ev.target
    if (!(t instanceof Element)) return
    const a = t.closest('a[href]')
    if (!(a instanceof HTMLAnchorElement)) return
    if (a.target === '_blank' || a.hasAttribute('download')) return
    if (a.origin !== window.location.origin) return
    const href = a.getAttribute('href')
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
    prefetchRoute(a.pathname + a.search)
  }

  // pointerover 覆盖鼠标;touchstart 覆盖移动端点按前的意图
  document.addEventListener('pointerover', onIntent, { passive: true, capture: true })
  document.addEventListener('touchstart', onIntent, { passive: true, capture: true })
  document.addEventListener('focusin', onIntent, { capture: true })

  return () => {
    document.removeEventListener('pointerover', onIntent, true)
    document.removeEventListener('touchstart', onIntent, true)
    document.removeEventListener('focusin', onIntent, true)
  }
}
