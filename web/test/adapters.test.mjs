import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

let vite
async function load(mod) {
  vite ??= await createServer({ server: { middlewareMode: true }, appType: 'custom', root: process.cwd() })
  return vite.ssrLoadModule(mod)
}

const apiPost = {
  id: 'p1', slug: 'hello-world', type: 'show', title: '你好', body_md: '正文',
  feedback_wanted: [], uncertainties: [], links: [],
  author: { id: 'u1', handle: 'chip', display_name: 'Chip Zhang', avatar_url: '' },
  created_at: new Date(Date.now() - 3 * 3600e3).toISOString(),
  merged_into: null, reply_count: 14,
  project: { slug: 'meal-split', name: 'AA 分账' },
}

test('adaptFeedItem maps api post to FeedItem shape', async () => {
  const { adaptFeedItem } = await load('/src/lib/adapters/post.ts')
  const f = adaptFeedItem(apiPost)
  assert.equal(f.id, 'hello-world')       // FeedItem.id 用 slug(路由用)
  assert.equal(f.type, 'SHOW')
  assert.equal(f.authorHandle, 'chip')
  assert.equal(f.authorName, 'Chip Zhang')
  assert.equal(f.projectPath, 'meal-split')
  assert.equal(f.replyCount, 14)
  assert.equal(f.viewCount, 0)
  assert.match(f.time, /小时前/)
  // 3 小时前跨零点时会落进 'yesterday'(本地时钟在 00:00-03:00 之间跑这个测试就会命中)——
  // 不用硬编码 'today',只钉住 timeGroup 确实是从 created_at 推导出来的,而不是写死的常量。
  assert.ok(['today', 'yesterday'].includes(f.timeGroup), 'timeGroup must derive from created_at')
})

test('adaptFeedItem maps ask to DISCUSS and missing fields to neutral values', async () => {
  const { adaptFeedItem } = await load('/src/lib/adapters/post.ts')
  const f = adaptFeedItem({ ...apiPost, type: 'ask', author: null, project: null, reply_count: undefined })
  assert.equal(f.type, 'DISCUSS')
  assert.equal(f.authorName, '')
  assert.equal(f.replyCount, 0)
  assert.equal(f.projectPath, undefined)
})

test('relativeTime and timeGroup boundaries', async () => {
  const { relativeTime, timeGroup } = await load('/src/lib/adapters/time.ts')
  const { setAdapterLocale } = await load('/src/lib/adapters/locale.ts')
  const now = new Date('2026-07-26T12:00:00Z')
  assert.equal(relativeTime(new Date(now - 30e3).toISOString(), now), '刚刚')
  assert.match(relativeTime(new Date(now - 5 * 60e3).toISOString(), now), /分钟前/)
  // C3:adapter 文案随 locale 切换,不再硬编码中文
  setAdapterLocale('en-US')
  assert.equal(relativeTime(new Date(now - 30e3).toISOString(), now), 'just now')
  assert.match(relativeTime(new Date(now - 5 * 60e3).toISOString(), now), /min ago/)
  setAdapterLocale('zh')
  assert.equal(timeGroup(new Date(now - 2 * 3600e3).toISOString(), now), 'today')
  assert.equal(timeGroup(new Date(now - 26 * 3600e3).toISOString(), now), 'yesterday')
  assert.equal(timeGroup(new Date(now - 10 * 24 * 3600e3).toISOString(), now), 'thisWeek')
})

test('adaptProject keeps lowercase stage and neutral defaults honest', async () => {
  const { adaptProject, adaptExploreProject } = await load('/src/lib/adapters/project.ts')
  const apiProject = {
    id: 'pr1', slug: 'meal-split', name: 'meal-split', tagline: '一句话',
    description_md: '说明', stage: 'wip', screenshots: [], tags: ['Go'],
    links: [{ label: '仓库', url: 'https://x' }],
    author: { id: 'u1', handle: 'chip', display_name: 'Chip Zhang', avatar_url: '' },
    created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-25T00:00:00Z',
    stats: { timeline_count: 7, discuss_count: 12, feedback_count: 3 },
  }
  const p = adaptProject(apiProject)
  // stage 全链路小写(StageBadge 样式表按小写 key 查;此前 UIProject 转大写导致详情页
  // 徽章全部落到 fallback 色)
  assert.equal(p.stage, 'wip')
  assert.equal(adaptProject({ ...apiProject, stage: 'bogus' }).stage, 'idea')
  // audience 多选(0013):缺省/空归一成空数组,非法值滤掉,兼容旧单串形态
  assert.deepEqual(p.audience, [])
  assert.deepEqual(adaptProject({ ...apiProject, audience: [] }).audience, [])
  assert.deepEqual(adaptProject({ ...apiProject, audience: ['aliens'] }).audience, [])
  assert.deepEqual(adaptProject({ ...apiProject, audience: ['developers', 'end_users'] }).audience, ['developers', 'end_users'])
  assert.deepEqual(adaptProject({ ...apiProject, audience: 'developers' }).audience, ['developers'])
  assert.equal(p.stats.timelineCount, 7)
  assert.equal(p.author.name, 'Chip Zhang')
  assert.equal(p.screenshots.length, 0)   // 不编造截图
  const e = adaptExploreProject(apiProject)
  assert.equal(e.stage, 'wip')
  assert.equal(e.deck, '一句话')
  assert.equal(e.trending, false)
  // 列表接口无项目级"最新讨论"聚合字段 —— 中性 undefined,不编造空壳 latestThread 对象
  // (C2 评审 Finding I2:此前的空壳对象是真值,会让 ProjectListItem 渲染出假的 accent 块/
  // 空链接/"0 次浏览")。
  assert.equal(e.latestThread, undefined)
})

test('adaptReplies keeps floors and one-level children', async () => {
  const { adaptReplies } = await load('/src/lib/adapters/reply.ts')
  const rs = [{
    id: 'r1', author: { id: 'u2', handle: 'ana', display_name: 'Ana', avatar_url: '' },
    body_md: '顶层', parent_id: null, floor: 1, created_at: '2026-07-25T00:00:00Z',
    children: [{ id: 'r2', author: null, body_md: '子回复', parent_id: 'r1', floor: 0, created_at: '2026-07-25T01:00:00Z' }],
  }]
  const out = adaptReplies(rs)
  assert.equal(out[0].floor, 1)
  assert.equal(out[0].author.handle, 'ana')
  assert.equal(out[0].children.length, 1)
  assert.equal(out[0].children[0].replyToId, 'r1')
})

test('adaptThread maps merged_into_post/merged_at into mergeInfo.mergedInto/mergedAt', async () => {
  const { adaptThread } = await load('/src/lib/adapters/post.ts')
  const merged = adaptThread({
    ...apiPost, project: null,
    merged_into: 'p0', merged_into_post: { slug: 'canonical-topic', title: '正题' },
    merged_at: new Date(Date.now() - 2 * 3600e3).toISOString(),
  }, [])
  assert.equal(merged.mergeInfo?.mergedInto?.id, 'canonical-topic')
  assert.equal(merged.mergeInfo?.mergedInto?.title, '正题')
  assert.match(merged.mergeInfo?.mergedAt ?? '', /小时前/)
  assert.equal(merged.project, undefined)   // ask/discuss 帖没有项目,不编造

  const normal = adaptThread(apiPost, [])
  assert.equal(normal.mergeInfo, undefined)
  assert.equal(normal.project?.slug, 'meal-split')
})

test('adaptProfile maps link kind slugs to display labels, unknown kind falls back to itself', async () => {
  const { adaptProfile } = await load('/src/lib/adapters/user.ts')
  const p = adaptProfile({
    handle: 'chip', display_name: 'Chip', bio: '', avatar_url: '', status: 'building', weekly_status: '',
    github_verified: false,
    links: [
      { kind: 'website', url: 'https://chip.dev' },
      { kind: 'github', url: 'https://github.com/chip' },
      { kind: 'x', url: 'https://x.com/chip' },
      { kind: 'email', url: 'mailto:chip@example.com' },
      { kind: 'mastodon', url: 'https://mastodon.social/@chip' },
    ],
  })
  assert.deepEqual(p.links.map((l) => l.label), ['网站', 'GitHub', 'X', 'Email', 'mastodon'])
})

test.after(async () => { await vite?.close() })
