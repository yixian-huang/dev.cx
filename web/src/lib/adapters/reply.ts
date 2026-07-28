import type { ApiReply } from './api-types'
import type { ThreadReply, SubReply } from './types'
import { relativeTime } from './time'

function adaptAuthor(a: ApiReply['author']) {
  return {
    name: a?.display_name ?? '',
    handle: a?.handle ?? '',
    avatar: a?.avatar_url ?? '',
  }
}

function adaptChild(c: ApiReply): SubReply {
  return {
    id: c.id,
    replyToId: c.parent_id ?? '',
    author: adaptAuthor(c.author),
    body: c.body_md,
    time: relativeTime(c.created_at),
    createdAt: c.created_at,
    hidden: c.hidden ?? false,
    hiddenReason: c.hidden_reason ?? '',
  }
}

export function adaptReplies(rs: ApiReply[]): ThreadReply[] {
  return rs.map((r) => ({
    id: r.id,
    floor: r.floor,
    author: adaptAuthor(r.author),
    body: r.body_md,
    time: relativeTime(r.created_at),
    createdAt: r.created_at,
    hidden: r.hidden ?? false,
    hiddenReason: r.hidden_reason ?? '',
    // UI 只支持一层子回复(SubReply 无 children 字段);更深的嵌套按 UI 冻结要求截断,不递归。
    children: (r.children ?? []).map(adaptChild),
  }))
}
