import type { ApiProject } from './api-types'
import type { UIProject, ExploreProject, StageKey, AudienceKey } from './types'
import { relativeTime } from './time'

// stage 全链路统一小写 StageKey(UIProject 与 ExploreProject 一致)——此前 UIProject 转
// 全大写,而 StageBadge 的样式表只登记小写/首字母大写,详情页徽章全部落到 fallback 色。
// 非法值落到 'idea' 中性默认,不编造状态。
const VALID_STAGES: StageKey[] = ['idea', 'wip', 'shipped', 'paused']

export function normalizeStage(stage: string): StageKey {
  return VALID_STAGES.includes(stage as StageKey) ? (stage as StageKey) : 'idea'
}

// 0013 起 API 是数组(空数组=未设置);兼容旧的单串形态,非法值直接滤掉(不编造受众)。
const VALID_AUDIENCES: AudienceKey[] = ['end_users', 'developers', 'teams']
export function normalizeAudience(audience: string[] | string | undefined): AudienceKey[] {
  const list = Array.isArray(audience) ? audience : audience ? [audience] : []
  return list.filter((a): a is AudienceKey => VALID_AUDIENCES.includes(a as AudienceKey))
}

export function adaptProject(p: ApiProject, opts?: { isOwner?: boolean }): UIProject {
  return {
    id: p.slug,
    name: p.name,
    displayName: p.name,
    tagline: p.tagline,
    stage: normalizeStage(p.stage),
    audience: normalizeAudience(p.audience),
    // API 暂无对应字段(是否有待处理的 feedback 请求)—— 中性默认,不编造。
    hasFeedbackRequest: false,
    createdAt: p.created_at,
    updatedAt: relativeTime(p.updated_at),
    links: (p.links ?? []).map((l) => ({ label: l.label ?? '', url: l.url ?? '' })),
    // API 每张截图只有一个 URL,没有单独的缩略图/原图之分;thumb/full 复用同一 URL(不编造第二张图)。
    screenshots: (p.screenshots ?? []).map((url) => ({ thumb: url, full: url })),
    author: {
      name: p.author?.display_name ?? '',
      handle: p.author?.handle ?? '',
      avatar: p.author?.avatar_url ?? '',
    },
    tags: p.tags ?? [],
    description: p.description_md,
    stats: {
      timelineCount: p.stats?.timeline_count ?? 0,
      discussCount: p.stats?.discuss_count ?? 0,
      feedbackCount: p.stats?.feedback_count ?? 0,
    },
    followerCount: p.follower_count ?? 0,
    viewerFollowing: p.viewer_following,
    isOwner: opts?.isOwner ?? false,
  }
}

export function adaptExploreProject(p: ApiProject): ExploreProject {
  return {
    id: p.slug,
    name: p.name,
    displayTitle: p.name,
    deck: p.tagline,
    stage: normalizeStage(p.stage),
    authorHandle: p.author?.handle ?? '',
    authorName: p.author?.display_name ?? '',
    tags: p.tags ?? [],
    // B2:replyCount = 近 7 天热度(reply_count_7d);trending 由页面按排序模式标注。
    replyCount: p.reply_count_7d ?? 0,
    updatedAt: relativeTime(p.updated_at),
    trending: false,
    hasFeedbackRequest: p.has_feedback_request ?? false,
    // B2:latest_post 是真实聚合;缺失(null/详情端点)保持 undefined,
    // 不编造空壳(C2 Finding I2 的诚实语义不变)。
    latestThread: p.latest_post
      ? { id: p.latest_post.slug, title: p.latest_post.title, replyCount: p.latest_post.reply_count, time: '', recencyScore: 0, viewCount: 0 }
      : undefined,
  }
}
