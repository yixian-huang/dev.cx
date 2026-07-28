// 写路径纯函数层——全部接收 ApiClient 注入,node:test 可直测(不需要 DOM)。
// 跨任务稳定接口:后续任务(T5-T11)一律调用这里的函数,不重新实现写路径。

import type { ApiClient } from './api'

export async function login(c: ApiClient, email: string, password: string): Promise<void> {
  await c.post('/api/auth/login', { email, password })
}

export async function register(
  c: ApiClient,
  f: { invite_code: string; email: string; password: string; handle: string; display_name: string },
): Promise<void> {
  await c.post('/api/auth/register', f)
}

export async function verifyEmail(c: ApiClient, token: string): Promise<void> {
  await c.post('/api/auth/verify-email', { token })
}

export async function resendVerification(c: ApiClient): Promise<void> {
  await c.post('/api/me/resend-verification')
}

export async function forgotPassword(c: ApiClient, email: string): Promise<void> {
  await c.post('/api/auth/forgot-password', { email })
}

export async function resetPassword(c: ApiClient, token: string, password: string): Promise<void> {
  await c.post('/api/auth/reset-password', { token, password })
}

export async function joinWaitlist(c: ApiClient, email: string): Promise<void> {
  await c.post('/api/waitlist', { email })
}

export async function createPost(
  c: ApiClient,
  f: {
    type: string
    project_slug?: string
    title: string
    body_md: string
    feedback_wanted?: string[]
    uncertainties?: string[]
    links?: { label: string; url: string }[]
    /** draft | published；默认 published */
    status?: 'draft' | 'published'
    /** 有则 upsert 该草稿（可改为 published 发布） */
    draft_slug?: string
  },
): Promise<{ slug: string; status?: string }> {
  return (await c.post<{ post: { slug: string; status?: string } }>('/api/posts', f)).post
}

export async function listMyDrafts(
  c: ApiClient,
): Promise<{ posts: Array<Record<string, unknown>>; next_cursor: string | null }> {
  return c.get('/api/me/drafts')
}

export async function deleteDraft(c: ApiClient, slug: string): Promise<void> {
  await c.del(`/api/posts/${encodeURIComponent(slug)}`)
}

export async function createReply(
  c: ApiClient,
  postSlug: string,
  body_md: string,
  parent_id?: string,
): Promise<void> {
  await c.post(`/api/posts/${postSlug}/replies`, { body_md, parent_id })
}

export async function deleteReply(c: ApiClient, id: string): Promise<void> {
  await c.del(`/api/replies/${id}`)
}

export async function createProject(
  c: ApiClient,
  f: {
    slug: string
    name: string
    tagline: string
    description_md: string
    stage: string
    // 多选(0013);空数组/缺省 = 未设置
    audience?: string[]
    tags?: string[]
    screenshots?: string[]
    links?: { label: string; url: string }[]
  },
): Promise<{ slug: string }> {
  return (await c.post<{ project: { slug: string } }>('/api/projects', f)).project
}

export async function updateProject(
  c: ApiClient,
  slug: string,
  patch: Omit<Partial<Parameters<typeof createProject>[1]>, 'slug'>,
): Promise<void> {
  await c.patch(`/api/projects/${slug}`, patch)
}

export async function submitFeedback(
  c: ApiClient,
  slug: string,
  f: { title: string; body_md: string },
): Promise<{ slug: string }> {
  return (await c.post<{ post: { slug: string } }>(`/api/projects/${slug}/feedback`, f)).post
}

export async function mergePost(c: ApiClient, dupSlug: string, targetSlug: string): Promise<void> {
  await c.post(`/api/posts/${dupSlug}/merge`, { into: targetSlug })
}

export async function unmergePost(c: ApiClient, dupSlug: string): Promise<void> {
  await c.del(`/api/posts/${dupSlug}/merge`)
}

export async function updateProfile(
  c: ApiClient,
  patch: { display_name?: string; bio?: string; status?: string; weekly_status?: string; avatar_url?: string; email_weekly?: boolean },
): Promise<void> {
  await c.patch('/api/me', patch)
}

export async function putLinks(c: ApiClient, links: { kind: string; url: string }[]): Promise<void> {
  await c.put('/api/me/links', links)
}

export async function renameHandle(c: ApiClient, handle: string): Promise<void> {
  await c.post('/api/me/handle', { handle })
}

export async function uploadImage(
  baseFetch: (path: string, init?: RequestInit) => Promise<Response>,
  file: File,
): Promise<{ url: string; thumbnail_url: string }> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await baseFetch('/api/upload', { method: 'POST', body: formData, credentials: 'include' })
  const text = await res.text()
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }
  if (!res.ok) {
    const code =
      parsed && typeof parsed === 'object' && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : 'unknown'
    const e = new Error(`api ${res.status} ${code}`) as Error & { status: number; code: string }
    e.status = res.status
    e.code = code
    throw e
  }
  return parsed as { url: string; thumbnail_url: string }
}

// 关注(B2-T2 端点):kind=user|project,id=handle|slug。幂等,204 无 body。
export async function follow(c: ApiClient, kind: 'user' | 'project', id: string): Promise<void> {
  await c.put(`/api/follows/${kind}/${encodeURIComponent(id)}`)
}

export async function unfollow(c: ApiClient, kind: 'user' | 'project', id: string): Promise<void> {
  await c.del(`/api/follows/${kind}/${encodeURIComponent(id)}`)
}

// 标记通知已读:传 ids 或 all(B2-T3 端点)。
export async function markNotificationsRead(
  c: ApiClient,
  arg: { ids: string[] } | { all: true },
): Promise<void> {
  await c.post('/api/notifications/read', arg)
}

// ── admin 处置(全部 admin-only 端点;非 admin 会得到 403,入口本身也被 isAdmin 门控)──

export async function adminHidePost(c: ApiClient, slug: string, reason: string): Promise<void> {
  await c.post(`/api/admin/posts/${slug}/hide`, { reason })
}

export async function adminUnhidePost(c: ApiClient, slug: string): Promise<void> {
  await c.del(`/api/admin/posts/${slug}/hide`)
}

export async function adminHideReply(c: ApiClient, id: string, reason: string): Promise<void> {
  await c.post(`/api/admin/replies/${id}/hide`, { reason })
}

export async function adminUnhideReply(c: ApiClient, id: string): Promise<void> {
  await c.del(`/api/admin/replies/${id}/hide`)
}

export async function adminDeleteReply(c: ApiClient, id: string, reason: string): Promise<void> {
  await c.del(`/api/admin/replies/${id}`, { reason })
}

export async function adminWarn(c: ApiClient, handle: string, message: string): Promise<void> {
  await c.post(`/api/admin/users/${handle}/warn`, { message })
}

export async function adminMute(c: ApiClient, handle: string, reason: string, until?: string): Promise<void> {
  await c.post(`/api/admin/users/${handle}/mute`, until ? { reason, until } : { reason })
}

export async function adminUnmute(c: ApiClient, handle: string): Promise<void> {
  await c.del(`/api/admin/users/${handle}/mute`)
}

export async function adminSuspend(c: ApiClient, handle: string, reason: string): Promise<void> {
  await c.post(`/api/admin/users/${handle}/suspend`, { reason })
}

export async function adminUnsuspend(c: ApiClient, handle: string): Promise<void> {
  await c.del(`/api/admin/users/${handle}/suspend`)
}

// ── admin 配置与邀请码(Task 19;端点见 Task 16-18)──

export interface AdminSetting {
  key: string
  secret: boolean
  configured: boolean
  source: 'db' | 'env' | 'none'
  value?: string
  updated_at?: string
}

export async function adminListSettings(c: ApiClient): Promise<AdminSetting[]> {
  const r = await c.get<{ settings: AdminSetting[] }>('/api/admin/settings')
  return r.settings
}

export async function adminPutSetting(c: ApiClient, key: string, value: string): Promise<void> {
  await c.put(`/api/admin/settings/${key}`, { value })
}

export async function adminDeleteSetting(c: ApiClient, key: string): Promise<void> {
  await c.del(`/api/admin/settings/${key}`)
}

export async function adminSMTPTest(c: ApiClient): Promise<{ ok: boolean; to: string }> {
  return await c.post('/api/admin/settings/smtp-test')
}

export interface AdminInvite {
  code: string
  note: string
  max_uses: number
  used_count: number
  expires_at: string | null
  created_at: string
  active: boolean
}

export async function adminListInvites(c: ApiClient): Promise<AdminInvite[]> {
  const r = await c.get<{ invites: AdminInvite[] }>('/api/admin/invites')
  return r.invites
}

export async function adminMintInvites(c: ApiClient, n: number, uses: number, note: string): Promise<string[]> {
  const r = await c.post<{ codes: string[] }>('/api/admin/invites', { n, uses, note })
  return r.codes
}

export async function adminVoidInvite(c: ApiClient, code: string): Promise<void> {
  await c.del(`/api/admin/invites/${code}`)
}

export interface WaitlistEntry { email: string; created_at: string }
export async function adminListWaitlist(c: ApiClient): Promise<{ waitlist: WaitlistEntry[]; count: number }> {
  return await c.get('/api/admin/waitlist')
}
