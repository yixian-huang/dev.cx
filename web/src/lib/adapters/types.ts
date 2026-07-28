// UI 形状 —— 真源(Task 3-11 期间自当时的 mock 字面量逐字段复制而来,而非移动;
// 那批 mock 文件已在 Task 12 随全部 mock 回落一起删除,这里的 interface 是它们唯一的存续形态)。
// 组件的 props 类型不改;这里只是把"曾经只活在字面量类型推断里"的形状固化成显式 interface,
// 给 adapter 的返回值一个稳定的类型目标。

// ── feed item shape ──

export type FeedType = 'SHOW' | 'BUILD' | 'DISCUSS';

export interface FeedItem {
  id: string;
  type: FeedType;
  title: string;
  authorHandle: string;
  authorName: string;
  projectName?: string;
  projectPath?: string;
  replyCount: number;
  viewCount: number;
  time: string;
  timeGroup: 'today' | 'yesterday' | 'thisWeek';
}

// ── explore project shape ──

export type StageKey = 'idea' | 'wip' | 'shipped' | 'paused';

export type AudienceKey = 'end_users' | 'developers' | 'teams';

export interface LatestThread {
  id: string;
  title: string;
  time: string;
  recencyScore: number;
  replyCount: number;
  viewCount: number;
}

export interface ExploreProject {
  id: string;
  name: string;
  displayTitle: string;
  deck: string;
  stage: StageKey;
  authorHandle: string;
  authorName: string;
  tags: string[];
  replyCount: number;
  updatedAt: string;
  trending: boolean;
  hasFeedbackRequest: boolean;
  // API 列表响应无项目级"最新讨论"聚合 —— 中性 undefined,不编造空壳对象(C2 评审 Finding I2)。
  latestThread?: LatestThread;
  /** 主人软隐藏/下架 */
  hidden?: boolean;
}

// ── project shapes ──

export interface TimelineEntry {
  id: string;
  type: 'SHOW' | 'BUILD' | 'ASK' | 'PROGRESS';
  date: string;
  title: string;
  excerpt: string;
  isRecent: boolean;
}

// UIProject = `typeof projectData` 的显式 interface 化(projectData.ts 顶部的对象字面量,
// 不是同文件里已具名导出的 TimelineEntry/DiscussEntry)。
export interface UIProject {
  id: string;
  name: string;
  displayName: string;
  tagline: string;
  // 全链路统一小写 StageKey(与 ExploreProject 一致),StageBadge 按 key 查样式表。
  stage: StageKey;
  // 0013 起多选;空数组=未设置,消费方按「空则不渲染」处理。
  audience: AudienceKey[];
  hasFeedbackRequest: boolean;
  createdAt: string;
  updatedAt: string;
  links: { label: string; url: string }[];
  screenshots: { thumb: string; full: string }[];
  author: {
    name: string;
    handle: string;
    avatar: string;
  };
  tags: string[];
  description: string;
  stats: {
    timelineCount: number;
    discussCount: number;
    feedbackCount: number;
  };
  followerCount: number;
  // undefined = 匿名(接口不带该键);登录态为真实布尔
  viewerFollowing?: boolean;
  isOwner: boolean;
  /** 主人软隐藏/下架 */
  hidden?: boolean;
}

// DiscussTab 的 prop 契约(带 mergedFrom/mergedInto/feedbackType 等合并溯源与反馈分类字段)——
// 这些字段真实列表接口从不返回(见 project/page.tsx 的 toDiscussEntry 注释),仍然按仓库
// "不编造"的一贯做法只搬运 adaptFeedItem 已给出的字段,其余留空/不生成。
export interface DiscussEntry {
  id: string;
  type: 'ASK' | 'BUILD' | 'SHOW' | 'DISCUSS';
  feedbackType?: 'BUG' | 'UX' | 'FEATURE';
  title: string;
  author: string;
  replies: number;
  time: string;
  /** IDs merged into this thread */
  mergedFrom?: string[];
  /** ID this thread was merged into */
  mergedInto?: string;
  mergedAt?: string;
  mergedBy?: string;
}

// ── thread shapes ──

export interface SubReply {
  id: string;
  replyToId: string;
  author: {
    name: string;
    handle: string;
    avatar: string;
  };
  body: string;
  time: string;
  createdAt: string;
  hidden?: boolean;
  hiddenReason?: string;
}

export interface MergeInfo {
  mergedFrom?: { id: string; title: string; author: string }[];
  mergedInto?: { id: string; title: string };
  mergedAt?: string;
  mergedBy?: string;
}

export interface ThreadReply {
  id: string;
  floor: number;
  author: {
    name: string;
    handle: string;
    avatar: string;
  };
  body: string;
  time: string;
  createdAt: string;
  hidden?: boolean;
  hiddenReason?: string;
  children: SubReply[];
}

export interface BaseThread {
  id: string;
  type: 'SHOW' | 'BUILD' | 'DISCUSS';
  title: string;
  author: {
    name: string;
    handle: string;
    avatar: string;
  };
  createdAt: string;
  formattedTime: string;
  feedbackWanted: string[];
  uncertainties: string[];
  body: string;
  replies: ThreadReply[];
  mergeInfo?: MergeInfo;
  // ask/discuss 帖没有项目、show/build 帖才有 —— 可选而非强制必填。
  project?: { name: string; slug: string };
  links?: { label: string; url: string }[];
  // 软隐藏(0008 moderation):详情路径才可能出现;undefined = 未隐藏。
  hidden?: { reason: string };
  /** 发布后再次编辑过 */
  edited?: boolean;
  /** 当前登录作者是否可编辑 */
  canEdit?: boolean;
}

// ── profile shapes ──

// profile.works[] 里每一项的形状。
// stage 字段流向 ProjectListItem 的 `stage: StageKey` prop,故按规则保留字面量联合类型
// (不像 UIProject.stage 那样宽化 —— 那边的消费方只要求 string)。
export interface ProfileWork {
  id: string;
  name: string;
  displayTitle: string;
  deck: string;
  stage: StageKey;
  hasFeedbackRequest: boolean;
  updatedAt: string;
  tags: string[];
  isLead: boolean;
  authorHandle: string;
  authorName: string;
  latestThread: LatestThread;
}

// UIProfile = ProfileHero/ProfileTabs 冻结的 profile prop 形状。
export interface UIProfile {
  id: string;
  handle: string;
  displayName: string;
  avatar: string;
  // ProfileHero/ProfileTabs 的冻结 prop 契约里这个字段是字面量类型(`'BUILDING' as const`),
  // 按规则保留字面量而不宽化为 string(与 profileData.status 的例子一致)。
  status: 'BUILDING';
  bio: string;
  location: string;
  company: string;
  links: { label: string; url: string }[];
  currentWork: {
    text: string;
    done: string;
    blockers: string;
    next: string;
    updatedAt: string;
  };
  works: ProfileWork[];
  stats: {
    worksCount: number;
    followers: number;
    following: number;
  };
  // undefined = 匿名(接口不带该键);登录态为真实布尔(B2 关注)
  viewerFollowing?: boolean;
}
