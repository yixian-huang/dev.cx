import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

let vite
async function loadMeta() {
  vite ??= await createServer({ server: { middlewareMode: true }, appType: 'custom', root: process.cwd() })
  return vite.ssrLoadModule('/src/lib/meta.ts')
}

test('profile route uses the user display name and bio', async () => {
  const { metaForRoute } = await loadMeta()
  const m = metaForRoute('/@chip', {
    user: { handle: 'chip', display_name: 'Chip Zhang', bio: '在造开发者工具' },
  })
  assert.match(m.title, /Chip Zhang/)
  assert.match(m.title, /@chip/)
  assert.equal(m.description, '在造开发者工具')
  assert.equal(m.ogType, 'profile')
  assert.equal(m.noindex, false)
})

test('project route uses project name and tagline', async () => {
  const { metaForRoute } = await loadMeta()
  const m = metaForRoute('/p/meal-split', {
    project: { name: 'meal-split', tagline: '让 AA 分账毫不费力' },
  })
  assert.match(m.title, /meal-split/)
  assert.equal(m.description, '让 AA 分账毫不费力')
  assert.equal(m.ogType, 'article')
})

test('private routes are noindex', async () => {
  const { metaForRoute } = await loadMeta()
  for (const p of ['/me', '/me/projects', '/notifications', '/compose', '/new', '/onboarding', '/login',
    // C3:/new-project 与项目设置页同为私有写路径,不该被收录
    '/new-project', '/p/meal-split/settings',
    // 运营台与 token 页(邮箱验证/重置密码)同样不可收录
    '/admin', '/verify-email', '/reset-password']) {
    assert.equal(metaForRoute(p, {}).noindex, true, `${p} should be noindex`)
  }
})

test('public routes are indexable', async () => {
  const { metaForRoute } = await loadMeta()
  for (const p of ['/', '/feed', '/explore', '/about', '/guidelines', '/@chip', '/p/x', '/t/y', '/weekly/31']) {
    assert.equal(metaForRoute(p, {}).noindex, false, `${p} should be indexable`)
  }
})

test('home title uses the single brand line (产品驱动的创造者社区)', async () => {
  const { metaForRoute } = await loadMeta()
  const m = metaForRoute('/', {})
  assert.equal(m.title, 'dev.cx — 产品驱动的创造者社区')
})

test('weekly route gets its own title instead of the bare site name', async () => {
  const { metaForRoute } = await loadMeta()
  const m = metaForRoute('/weekly/31', {})
  assert.match(m.title, /VOL\.31/)
  assert.equal(m.ogType, 'article')
})

test('project with screenshots emits og:image and large card', async () => {
  const { metaForRoute, renderHeadTags } = await loadMeta()
  const m = metaForRoute('/p/img-li', {
    project: { name: '图鲤', tagline: '一个简单的图床', screenshots: ['https://img.li/a.png', 'https://img.li/b.png'] },
  })
  assert.equal(m.image, 'https://img.li/a.png')
  const tags = renderHeadTags(m, 'https://dev.cx/p/img-li')
  assert.ok(tags.includes('property="og:image" content="https://img.li/a.png"'))
  assert.ok(tags.includes('name="twitter:card" content="summary_large_image"'))
  // 无截图的项目不发 og:image,卡片回落 summary
  const bare = renderHeadTags(metaForRoute('/p/x', { project: { name: 'x' } }), 'https://dev.cx/p/x')
  assert.ok(!bare.includes('og:image'))
  assert.ok(bare.includes('name="twitter:card" content="summary"'))
})

test('renderHeadTags escapes quotes and emits og + twitter tags', async () => {
  const { metaForRoute, renderHeadTags } = await loadMeta()
  const m = metaForRoute('/@x', { user: { handle: 'x', display_name: 'A "quoted" name', bio: '<script>alert(1)</script>' } })
  const tags = renderHeadTags(m, 'https://dev.cx/@x')
  assert.ok(tags.includes('<title>'))
  assert.ok(tags.includes('property="og:title"'))
  assert.ok(tags.includes('property="og:url" content="https://dev.cx/@x"'))
  assert.ok(tags.includes('name="twitter:card"'))
  assert.ok(!tags.includes('<script>'), 'unescaped script tag leaked into head')
  assert.ok(!tags.includes('"quoted"'), 'unescaped double quote leaked into attribute')
})

test('noindex meta emits robots tag', async () => {
  const { metaForRoute, renderHeadTags } = await loadMeta()
  const tags = renderHeadTags(metaForRoute('/me', {}), 'https://dev.cx/me')
  assert.ok(tags.includes('name="robots" content="noindex"'))
})

test.after(async () => { await vite?.close() })
