import type { ApiUser } from './api-types'
import type { UIProfile } from './types'
import { adapterLocale } from './locale'

// links[].kind 是存储态 slug(website/github/x/email/...),直接当展示 label 用会把原始 slug 糊
// 到 UI 上——Task 3 评审发现,Task 10 落地修复。未登记的 kind 中性回落到 slug 本身(不是编造,
// 只是没有更好的名字时用它自己)。C3:label 按 adapter locale 选串(见 ./locale.ts),
// 只有 website 存在中英差异,品牌名不译。
const KIND_LABEL: Record<'zh' | 'en', Record<string, string>> = {
  zh: { website: '网站', github: 'GitHub', x: 'X', email: 'Email' },
  en: { website: 'Website', github: 'GitHub', x: 'X', email: 'Email' },
}

// 吸收自 C1 在 src/pages/profile/page.tsx 内联的映射逻辑(该文件在 Task 10 切换前保留自己那份,
// 两处语义故意保持一致):
export function adaptProfile(u: ApiUser): UIProfile {
  return {
    id: u.handle,
    handle: u.handle,
    displayName: u.display_name,
    // 头像空串保留,组件已有占位逻辑沿用;不得填 mock 头像 URL。
    avatar: u.avatar_url ?? '',
    // status 在数据库里是 not null 且带 check constraint,真实用户不会发来假值 —— 这个回落只覆盖
    // 桩数据/测试缺口,不覆盖生产数据。回落到的字面量与 mock 的 profileData.status 一致(而不是
    // 导入 mock 模块本身,因为 mock 在 Task 12 会被删除,adapter 不应依赖它)。
    status: (u.status || 'BUILDING') as UIProfile['status'],
    bio: u.bio ?? '',
    // API 无 location/company 字段 —— 中性默认,不编造。
    location: '',
    company: '',
    links: (u.links ?? []).map((l) => ({ label: KIND_LABEL[adapterLocale()][l.kind] ?? l.kind, url: l.url })),
    currentWork: {
      // weekly_status 是 `text not null default ''`,空串是合法的真实状态 —— 不回落(C1 评审裁决)。
      text: u.weekly_status,
      // API 无这些子字段(done/blockers/next/updatedAt)—— 中性默认,不编造。
      done: '',
      blockers: '',
      next: '',
      updatedAt: '',
    },
    // API 无项目列表/统计 —— 中性默认;WorksTab 对空 works 已有 EmptyState 处理。
    works: [],
    // followers 自 B2 起是真实计数(follower_count);works/following 仍无对应端点,中性 0。
    stats: { worksCount: 0, followers: u.follower_count ?? 0, following: 0 },
    viewerFollowing: u.viewer_following,
  }
}
