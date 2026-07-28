// API 响应形状(唯一定义处)。与 Go 序列化逐字段对齐,见 api/internal/httpx/content_json.go。
// 跨任务稳定接口 —— 后续任务(T4-T12)一律引用这里的类型,不重新声明。

export type ApiAuthor = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string;
} | null;

export type ApiPost = {
  id: string;
  slug: string;
  type: 'show' | 'build' | 'ask' | 'discuss';
  title: string;
  body_md: string;
  feedback_wanted: string[];
  uncertainties: string[];
  links: { label?: string; url?: string }[];
  author: ApiAuthor;
  created_at: string;
  merged_into: string | null;
  reply_count?: number;
  project?: { slug: string; name: string } | null;
  merged_from?: { slug: string; title: string; author: ApiAuthor }[];
  // 只在这条帖子确实被合并时才出现(api/internal/httpx/content_json.go 的 postJSON 按
  // p.MergedInto != nil 门控):merged_into 本身只是目标帖的 id,没有 GET-by-id 端点,
  // 这两个字段把"已合并至"横幅要用的目标帖 slug/title 与合并时间内联进响应。
  merged_into_post?: { slug: string; title: string } | null;
  merged_at?: string | null;
  // Task 5(0008 moderation):详情路径才可能出现;列表路径隐藏帖已被 SQL 过滤。
  hidden?: boolean;
  hidden_reason?: string;
};

export type ApiProject = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description_md: string;
  stage: string;
  // 0013 起多选(空数组=未设置);旧客户端缓存可能还是单串,适配层做归一
  audience?: string[] | string;
  screenshots: string[];
  tags: string[];
  links: { label?: string; url?: string }[];
  author: ApiAuthor;
  created_at: string;
  updated_at: string;
  stats?: { timeline_count: number; discuss_count: number; feedback_count: number };
  follower_count?: number;
  viewer_following?: boolean;
  // B2-T4 列表聚合(详情端点不带)
  reply_count_7d?: number;
  has_feedback_request?: boolean;
  latest_post?: { slug: string; title: string; reply_count: number } | null;
};

export interface StatsEnvelope {
  builders: number;
  products: number;
  discussions: number;
}

export type ApiReply = {
  id: string;
  author: ApiAuthor;
  body_md: string;
  parent_id: string | null;
  floor: number;
  created_at: string;
  hidden?: boolean;
  hidden_reason?: string;
  children?: ApiReply[];
};

// 列表端点的原始信封——SSR 裸注入与客户端重取拿到的是同一个形状(见 server.mjs 的
// prefetch 注释),故页面层直接读 .posts/.projects/.next_cursor,不需要 unwrap。
// 曾经在 feed/page.tsx、explore/page.tsx、DiscussionPreview.tsx、FocusWorks.tsx 四处
// 各自重复声明,Task 12 收敛到这里唯一定义。
export interface PostsEnvelope {
  posts: ApiPost[];
  next_cursor: string | null;
}

export interface ProjectsEnvelope {
  projects: ApiProject[];
  next_cursor: string | null;
}

export type ApiWeeklyHighlight = {
  kind: 'project' | 'post';
  slug: string;
  title: string;
  deck: string;
  author_handle: string;
  reply_count: number;
};

export type ApiWeeklyIssue = {
  year: number;
  week: number;
  title: string;
  editor_note_md: string;
  highlights: ApiWeeklyHighlight[];
  published_at: string;
  prev: { year: number; week: number } | null;
  next: { year: number; week: number } | null;
};

export type ApiNotification = {
  id: string;
  kind: 'reply' | 'mention' | 'follow' | 'project_update' | 'moderation';
  read: boolean;
  created_at: string;
  actor: ApiAuthor | null;
  post: { slug: string; title: string } | null;
  project: { slug: string; name: string } | null;
  reply_excerpt: string | null;
  // moderation 警告的自由文本;其余 kind 恒为空串。
  message?: string;
};

export interface NotificationsEnvelope {
  notifications: ApiNotification[];
  next_cursor: string | null;
  unread_count: number;
}

export type ApiUser = {
  handle: string;
  display_name: string;
  bio: string;
  avatar_url: string;
  status: string;
  // /api/me 本人语境才有(writeUserByID includeEmail 分支);公开档案端点不带。
  role?: string;
  muted_until?: string;
  email_verified?: boolean;
  email_weekly?: boolean;
  weekly_status: string;
  github_verified: boolean;
  links: { kind: string; url: string }[];
  email?: string;
  follower_count?: number;
  viewer_following?: boolean;
  unread_notifications?: number;
};

// SSR 直接把裸对象/裸数组塞进某个 key(server.mjs 的 prefetch 分支,如 { post: t.post ?? t }
// 里的 t.post ?? t 本身、以及 replies 分支的裸数组),而 useApiData 的客户端重取路径走同一个
// key 却拿到的是 API 的原始信封({ post: {...} } / { replies: [...] })——两条路径拿到的形状
// 不一致。这个助手在页面层统一解一次信封:d 是信封(对象且有 k 这个键)就取 d[k],否则原样
// 返回 d(SSR 注入的裸对象/裸数组场景,包括 k 恰好是数组时 `k in d` 天然为 false 的情况)。
export function unwrap<T>(d: unknown, k: string): T {
  return d && typeof d === 'object' && k in d ? (d as Record<string, unknown>)[k] as T : (d as T);
}
