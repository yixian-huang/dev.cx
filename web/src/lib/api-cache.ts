import { createClient, type ApiError } from './api'

/** 站内导航预取用的短时 GET 缓存(按 API path)。仅浏览器。 */
const TTL_MS = 30_000
const MAX_ENTRIES = 80

type Entry = {
  at: number
  data?: unknown
  error?: ApiError
  promise?: Promise<unknown>
}

const store = new Map<string, Entry>()

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

function touch(path: string, entry: Entry): void {
  store.delete(path)
  store.set(path, entry)
  while (store.size > MAX_ENTRIES) {
    const first = store.keys().next().value
    if (first === undefined) break
    store.delete(first)
  }
}

function fresh(entry: Entry): boolean {
  return Date.now() - entry.at < TTL_MS
}

/** 同步读新鲜成功结果;过期或进行中返回 undefined。 */
export function getFreshApiCache<T = unknown>(path: string): T | undefined {
  if (!isBrowser() || !path) return undefined
  const e = store.get(path)
  if (!e || e.data === undefined || !fresh(e)) return undefined
  return e.data as T
}

/** 写入/刷新成功结果(写操作后重取、clientFetch 共用)。 */
export function putApiCache(path: string, data: unknown): void {
  if (!isBrowser() || !path) return
  touch(path, { at: Date.now(), data })
}

/** 丢弃 path(强制下次走网络)。 */
export function invalidateApiCache(path: string): void {
  if (!path) return
  store.delete(path)
}

/**
 * 预取/GET:同 path 在途 promise 去重;新鲜命中直接返回。
 * force=true 时跳过新鲜缓存(写后刷新)。
 */
export function prefetchApi(path: string, opts?: { force?: boolean }): Promise<unknown> {
  if (!isBrowser() || !path) return Promise.resolve(undefined)

  const force = opts?.force === true
  const existing = store.get(path)
  if (!force && existing?.promise) return existing.promise
  if (!force && existing && existing.data !== undefined && fresh(existing)) {
    return Promise.resolve(existing.data)
  }

  if (force) store.delete(path)

  const promise = createClient({ baseURL: '' })
    .get(path)
    .then((data) => {
      touch(path, { at: Date.now(), data })
      return data
    })
    .catch((err) => {
      const e = err as ApiError
      // 失败不长期占坑,允许立刻重试
      store.delete(path)
      throw e
    })

  touch(path, { at: Date.now(), promise })
  return promise
}

/** 测试用 */
export function __resetApiCache(): void {
  store.clear()
}

export function __apiCacheSize(): number {
  return store.size
}
