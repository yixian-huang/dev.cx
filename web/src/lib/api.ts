export type ApiError = Error & { status: number; code: string }

function apiError(status: number, code: string): ApiError {
  const e = new Error(`api ${status} ${code}`) as ApiError
  e.status = status
  e.code = code
  return e
}

export interface ApiClient {
  get<T = unknown>(path: string): Promise<T>
  tryGet<T = unknown>(path: string): Promise<T | null>
  post<T = unknown>(path: string, body?: unknown): Promise<T>
  patch<T = unknown>(path: string, body?: unknown): Promise<T>
  put<T = unknown>(path: string, body?: unknown): Promise<T>
  del<T = unknown>(path: string, body?: unknown): Promise<T>
}

export function createClient(opts: { baseURL: string; cookie?: string }): ApiClient {
  const base = opts.baseURL.replace(/\/$/, '')

  async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' }
    if (opts.cookie) headers.cookie = opts.cookie
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await fetch(base + path, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    let parsed: unknown = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = null
    }
    if (!res.ok) {
      let code =
        parsed && typeof parsed === 'object' && 'error' in parsed
          ? String((parsed as { error: unknown }).error)
          : 'unknown'
      // 上游返回 HTML 错误页时没有 JSON code——用状态码兜底,前端好展示清晰文案
      if (code === 'unknown') {
        if (res.status === 502) code = 'bad_gateway'
        else if (res.status === 504) code = 'gateway_timeout'
        else if (res.status === 429) code = 'rate_limited'
        else if (res.status === 401) code = 'auth_required'
        else if (res.status === 403) code = 'forbidden'
        else if (res.status === 404) code = 'not_found'
      }
      throw apiError(res.status, code)
    }
    return parsed as T
  }

  return {
    get: <T>(path: string) => send<T>('GET', path),
    async tryGet<T>(path: string): Promise<T | null> {
      try {
        return await send<T>('GET', path)
      } catch (err) {
        const e = err as ApiError
        if (e.status >= 400 && e.status < 500) return null
        throw err
      }
    },
    post: <T>(path: string, body?: unknown) => send<T>('POST', path, body),
    patch: <T>(path: string, body?: unknown) => send<T>('PATCH', path, body),
    put: <T>(path: string, body?: unknown) => send<T>('PUT', path, body),
    del: <T>(path: string, body?: unknown) => send<T>('DELETE', path, body),
  }
}
