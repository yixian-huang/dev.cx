// 项目表单的单一字段模型 + 校验——发布页(new-project)与设置页(project/settings)共用,
// 两个入口不再各自维护一份字段清单。限制常量镜像 api/internal/httpx/project_handlers.go
// 顶部的同名常量;长度一律按 Unicode code point 计(Array.from),与服务端
// utf8.RuneCountInString 对齐,避免客户端放行、服务端 400 回弹。

import type { ApiProject } from './adapters/api-types'
import type { StageKey, AudienceKey } from './adapters/types'
import { normalizeStage, normalizeAudience } from './adapters/project'

export const PROJECT_LIMITS = {
  name: 64,
  tagline: 140,
  description: 20000,
  tag: 24,
  tags: 8,
  screenshots: 8,
  links: 6,
  url: 512,
  linkLabel: 24,
} as const

export const STAGE_OPTIONS: StageKey[] = ['idea', 'wip', 'shipped', 'paused']

export const STAGE_LABEL_KEY: Record<StageKey, string> = {
  idea: 'project.stageIdea',
  wip: 'project.stageWIP',
  shipped: 'project.stageShipped',
  paused: 'project.stagePaused',
}

export const AUDIENCE_OPTIONS: { key: AudienceKey; labelKey: string }[] = [
  { key: 'end_users', labelKey: 'project.audience.endUsers' },
  { key: 'developers', labelKey: 'project.audience.developers' },
  { key: 'teams', labelKey: 'project.audience.teams' },
]

export interface ProjectLink {
  label: string
  url: string
}

export interface ProjectDraft {
  name: string
  tagline: string
  stage: StageKey
  // 多选(0013);空数组 = 未设置——"不确定给谁用"时留空是合法答案
  audience: AudienceKey[]
  description: string
  tags: string[]
  links: ProjectLink[]
  screenshots: string[]
}

export function emptyDraft(): ProjectDraft {
  return {
    name: '',
    tagline: '',
    stage: 'wip',
    audience: [],
    description: '',
    tags: [],
    // 发布页一进来就有一个空链接行可填;全空行提交时被 filledLinks 丢弃
    links: [{ label: '', url: '' }],
    screenshots: [],
  }
}

export function draftFromApiProject(p: ApiProject): ProjectDraft {
  return {
    name: p.name,
    tagline: p.tagline,
    stage: normalizeStage(p.stage),
    audience: normalizeAudience(p.audience),
    description: p.description_md,
    tags: p.tags ?? [],
    links: (p.links ?? []).map((l) => ({ label: l.label ?? '', url: l.url ?? '' })),
    screenshots: p.screenshots ?? [],
  }
}

// 从名称派生干净的 slug 词干(无随机后缀)——发布表单的 slug 字段预填值。
// 纯 CJK 等派生不出词干时返回 '',由用户在表单里自己填(不再生成 project-xxxx)。
export function slugStem(name: string): string {
  const stem = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '')
  return stem.length >= 2 ? stem : ''
}

// 与 api/internal/slugs.Validate 逐条镜像:2–32 位小写字母数字与中划线,首尾必须
// 字母数字,禁止连续中划线。
const SLUG_SHAPE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

export function validateSlug(slug: string): FieldError | undefined {
  if (slug === '') return { key: 'project.err.slugRequired' }
  if (slug.length < 2 || slug.length > 32 || !SLUG_SHAPE.test(slug) || slug.includes('--')) {
    return { key: 'project.err.slugInvalid' }
  }
  return undefined
}

// 带随机后缀的派生——仅供 compose 快速创建(那里没有 slug 输入框,撞名靠重点一次
// 换随机段解决;C2 评审 Finding I5)。完整发布表单用 slugStem + 用户可编辑字段。
export function deriveSlug(name: string): string {
  const base = slugStem(name).slice(0, 24).replace(/-+$/g, '') || 'project'
  const suffix = Math.random().toString(36).slice(2, 6).padEnd(4, '0')
  return `${base}-${suffix}`
}

// 标签混排判别(画布 5a:同一字段内技术类 mono、场景类正文字体):纯 ASCII 视为技术栈
// 标签走 font-mono,含 CJK 等其他字符走正文字体。分错也只是字体差异,不影响数据。
export function isTechTag(tag: string): boolean {
  return /^[\x21-\x7e]+$/.test(tag)
}

// 与服务端 utf8.RuneCountInString 对齐的长度:按 code point,不按 UTF-16 单元。
export function runeLen(s: string): number {
  return Array.from(s).length
}

// 服务端 allowedURL(u, false):只认 http(s)。
export function isAllowedUrl(u: string): boolean {
  return u.startsWith('https://') || u.startsWith('http://')
}

// 去掉全空行、trim 后的可提交链接——发布/编辑提交前都过这一道。
export function filledLinks(links: ProjectLink[]): ProjectLink[] {
  return links
    .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
    .filter((l) => l.label !== '' || l.url !== '')
}

export interface FieldError {
  key: string
  params?: Record<string, string | number>
}

export interface DraftErrors {
  name?: FieldError
  tagline?: FieldError
  description?: FieldError
  tags?: FieldError
  // 按原始行号标注(全空行不算错,提交时会被丢弃)
  links?: Record<number, FieldError>
  linksCount?: FieldError
  screenshots?: FieldError
}

export function validateDraft(d: ProjectDraft): DraftErrors {
  const errors: DraftErrors = {}

  if (d.name.trim() === '') {
    errors.name = { key: 'project.err.nameRequired' }
  } else if (runeLen(d.name.trim()) > PROJECT_LIMITS.name) {
    errors.name = { key: 'project.err.tooLong', params: { max: PROJECT_LIMITS.name } }
  }

  if (runeLen(d.tagline) > PROJECT_LIMITS.tagline) {
    errors.tagline = { key: 'project.err.tooLong', params: { max: PROJECT_LIMITS.tagline } }
  }

  if (runeLen(d.description) > PROJECT_LIMITS.description) {
    errors.description = { key: 'project.err.tooLong', params: { max: PROJECT_LIMITS.description } }
  }

  if (d.tags.length > PROJECT_LIMITS.tags) {
    errors.tags = { key: 'project.err.tooMany', params: { max: PROJECT_LIMITS.tags } }
  } else if (d.tags.some((tag) => runeLen(tag) > PROJECT_LIMITS.tag)) {
    errors.tags = { key: 'project.err.tagTooLong', params: { max: PROJECT_LIMITS.tag } }
  }

  if (d.screenshots.length > PROJECT_LIMITS.screenshots) {
    errors.screenshots = { key: 'project.err.tooMany', params: { max: PROJECT_LIMITS.screenshots } }
  } else if (d.screenshots.some((u) => !isAllowedUrl(u) || runeLen(u) > PROJECT_LIMITS.url)) {
    errors.screenshots = { key: 'project.err.urlScheme' }
  }

  const linkErrors: Record<number, FieldError> = {}
  d.links.forEach((l, i) => {
    const label = l.label.trim()
    const url = l.url.trim()
    if (label === '' && url === '') return
    if (label === '' || url === '') {
      linkErrors[i] = { key: 'project.err.linkIncomplete' }
    } else if (runeLen(label) > PROJECT_LIMITS.linkLabel) {
      linkErrors[i] = { key: 'project.err.tooLong', params: { max: PROJECT_LIMITS.linkLabel } }
    } else if (!isAllowedUrl(url)) {
      linkErrors[i] = { key: 'project.err.urlScheme' }
    } else if (runeLen(url) > PROJECT_LIMITS.url) {
      linkErrors[i] = { key: 'project.err.tooLong', params: { max: PROJECT_LIMITS.url } }
    }
  })
  if (Object.keys(linkErrors).length > 0) errors.links = linkErrors
  if (filledLinks(d.links).length > PROJECT_LIMITS.links) {
    errors.linksCount = { key: 'project.err.tooMany', params: { max: PROJECT_LIMITS.links } }
  }

  return errors
}

export function hasErrors(e: DraftErrors): boolean {
  return Object.keys(e).length > 0
}

/** DOM id 前缀——与 ProjectFormFields 输入控件 id 对齐,提交失败时 focus/scroll 用。 */
export const PROJECT_FIELD_ID = {
  name: 'project-field-name',
  slug: 'project-field-slug',
  tagline: 'project-field-tagline',
  description: 'project-field-description',
  tags: 'project-field-tags',
  screenshots: 'project-field-screenshots',
  link: (i: number) => `project-field-link-${i}`,
} as const

/** 按表单自上而下的顺序收集错误,供摘要列表与首错聚焦共用。 */
export function collectFieldErrors(
  errors: DraftErrors,
  slugError?: FieldError,
): { id: string; error: FieldError }[] {
  const out: { id: string; error: FieldError }[] = []
  if (errors.name) out.push({ id: PROJECT_FIELD_ID.name, error: errors.name })
  if (slugError) out.push({ id: PROJECT_FIELD_ID.slug, error: slugError })
  if (errors.tagline) out.push({ id: PROJECT_FIELD_ID.tagline, error: errors.tagline })
  if (errors.description) out.push({ id: PROJECT_FIELD_ID.description, error: errors.description })
  if (errors.tags) out.push({ id: PROJECT_FIELD_ID.tags, error: errors.tags })
  if (errors.links) {
    for (const key of Object.keys(errors.links).map(Number).sort((a, b) => a - b)) {
      const err = errors.links[key]
      if (err) out.push({ id: PROJECT_FIELD_ID.link(key), error: err })
    }
  }
  if (errors.linksCount) out.push({ id: PROJECT_FIELD_ID.link(0), error: errors.linksCount })
  if (errors.screenshots) out.push({ id: PROJECT_FIELD_ID.screenshots, error: errors.screenshots })
  return out
}

export function firstInvalidFieldId(errors: DraftErrors, slugError?: FieldError): string | null {
  return collectFieldErrors(errors, slugError)[0]?.id ?? null
}

/** 提交失败后:滚到首个错误并尽量 focus 可编辑控件。 */
export function focusProjectField(fieldId: string | null): void {
  if (!fieldId || typeof document === 'undefined') return
  const el = document.getElementById(fieldId)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    try {
      el.focus({ preventScroll: true })
    } catch {
      el.focus()
    }
  } else {
    const nested = el.querySelector('input, textarea, select, [contenteditable="true"]') as
      | HTMLElement
      | null
    nested?.focus?.()
  }
}

export interface ProjectPayload {
  name: string
  tagline: string
  description_md: string
  stage: string
  audience: string[]
  tags: string[]
  screenshots: string[]
  links: ProjectLink[]
}

export function draftToPayload(d: ProjectDraft): ProjectPayload {
  return {
    name: d.name.trim(),
    tagline: d.tagline,
    description_md: d.description,
    stage: d.stage,
    audience: d.audience,
    tags: d.tags,
    screenshots: d.screenshots,
    links: filledLinks(d.links),
  }
}

// 逐字段 diff——设置页只 PATCH 改动的字段。链接比较用 filledLinks 归一后的形态,
// 加了个空行又没填不算改动。
export function diffDraft(initial: ProjectDraft, current: ProjectDraft): Partial<ProjectPayload> {
  const a = draftToPayload(initial)
  const b = draftToPayload(current)
  const patch: Partial<ProjectPayload> = {}
  if (a.name !== b.name) patch.name = b.name
  if (a.tagline !== b.tagline) patch.tagline = b.tagline
  if (a.description_md !== b.description_md) patch.description_md = b.description_md
  if (a.stage !== b.stage) patch.stage = b.stage
  if (JSON.stringify(a.audience) !== JSON.stringify(b.audience)) patch.audience = b.audience
  if (JSON.stringify(a.tags) !== JSON.stringify(b.tags)) patch.tags = b.tags
  if (JSON.stringify(a.screenshots) !== JSON.stringify(b.screenshots)) patch.screenshots = b.screenshots
  if (JSON.stringify(a.links) !== JSON.stringify(b.links)) patch.links = b.links
  return patch
}
