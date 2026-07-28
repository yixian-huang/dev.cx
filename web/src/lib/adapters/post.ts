import type { ApiPost, ApiReply } from './api-types'
import type { FeedItem, TimelineEntry, BaseThread } from './types'
import { relativeTime, timeGroup } from './time'
import { adaptReplies } from './reply'
import { stripMarkdown } from '../markdown'

const FEED_TYPE: Record<ApiPost['type'], FeedItem['type']> = {
  show: 'SHOW', build: 'BUILD', ask: 'DISCUSS', discuss: 'DISCUSS',
}

export function adaptFeedItem(p: ApiPost): FeedItem {
  return {
    id: p.slug,
    type: FEED_TYPE[p.type] ?? 'DISCUSS',
    title: p.title,
    authorHandle: p.author?.handle ?? '',
    authorName: p.author?.display_name ?? '',
    projectName: p.project?.name ?? undefined,
    projectPath: p.project?.slug ?? undefined,
    replyCount: p.reply_count ?? 0,
    viewCount: 0,
    time: relativeTime(p.created_at),
    timeGroup: timeGroup(p.created_at),
  }
}

export function adaptTimelineEntry(p: ApiPost): TimelineEntry {
  const t = p.type === 'show' ? 'SHOW' : p.type === 'ask' ? 'ASK' : 'BUILD'
  return {
    id: p.slug, type: t,
    date: p.created_at.slice(0, 10),
    title: p.title,
    excerpt: stripMarkdown(p.body_md).slice(0, 140),
    isRecent: (Date.now() - Date.parse(p.created_at)) < 14 * 24 * 3600e3,
  }
}

export function adaptThread(p: ApiPost, replies: ApiReply[]): BaseThread {
  const mergedFrom = p.merged_from?.length
    ? p.merged_from.map((m) => ({ id: m.slug, title: m.title, author: m.author?.display_name ?? '' }))
    : undefined
  // merged_into_post/merged_at 只在这条帖子被合并时才由 postJSON 附带(见 api-types.ts 的注释)。
  const mergedInto = p.merged_into_post
    ? { id: p.merged_into_post.slug, title: p.merged_into_post.title }
    : undefined
  const mergedAt = p.merged_at ? relativeTime(p.merged_at) : undefined
  return {
    id: p.slug,
    type: FEED_TYPE[p.type] ?? 'DISCUSS',
    title: p.title,
    author: {
      name: p.author?.display_name ?? '',
      handle: p.author?.handle ?? '',
      avatar: p.author?.avatar_url ?? '',
    },
    createdAt: p.created_at,
    formattedTime: relativeTime(p.created_at),
    feedbackWanted: p.feedback_wanted,
    uncertainties: p.uncertainties,
    body: p.body_md,
    replies: adaptReplies(replies),
    // ask/discuss 帖没有项目 —— 不编造,undefined 而非假对象。
    project: p.project ? { name: p.project.name, slug: p.project.slug } : undefined,
    links: p.links.map((l) => ({ label: l.label ?? '', url: l.url ?? '' })),
    mergeInfo: mergedFrom || mergedInto ? { mergedFrom, mergedInto, mergedAt } : undefined,
    hidden: p.hidden ? { reason: p.hidden_reason ?? '' } : undefined,
  }
}
