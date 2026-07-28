import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

let vite
async function load(mod) {
  vite ??= await createServer({ server: { middlewareMode: true }, appType: 'custom', root: process.cwd() })
  return vite.ssrLoadModule(mod)
}
test.after(async () => { await vite?.close() })

test('collectFieldErrors and firstInvalidFieldId order name then slug', async () => {
  const {
    emptyDraft, validateDraft, validateSlug, collectFieldErrors, firstInvalidFieldId, PROJECT_FIELD_ID,
  } = await load('/src/lib/project-form.ts')
  const d = emptyDraft()
  const errors = validateDraft(d)
  const slugError = validateSlug('')
  const list = collectFieldErrors(errors, slugError)
  assert.equal(list[0].id, PROJECT_FIELD_ID.name)
  assert.equal(list[1].id, PROJECT_FIELD_ID.slug)
  assert.equal(firstInvalidFieldId(errors, slugError), PROJECT_FIELD_ID.name)
  // CJK 名合法但 slug 空 → 首错落在 slug
  const cjk = validateDraft({ ...d, name: '图鲤' })
  assert.equal(firstInvalidFieldId(cjk, validateSlug('')), PROJECT_FIELD_ID.slug)
})

test('validateDraft mirrors server limits (rune-counted, per project_handlers.go)', async () => {
  const { emptyDraft, validateDraft, hasErrors, PROJECT_LIMITS } = await load('/src/lib/project-form.ts')

  // 空名 → nameRequired;只有空格也算空(服务端 TrimSpace 同规则)
  const d = emptyDraft()
  assert.equal(validateDraft(d).name.key, 'project.err.nameRequired')
  assert.equal(validateDraft({ ...d, name: '   ' }).name.key, 'project.err.nameRequired')

  // 合法最小表单无错(空链接行不算错——提交时被丢弃)
  const ok = { ...d, name: '图鲤' }
  assert.equal(hasErrors(validateDraft(ok)), false)

  // 长度按 code point 计,与服务端 utf8.RuneCountInString 对齐:64 个汉字 = 64 rune 通过,
  // 65 个越界(按 UTF-16 单元计会得出别的结果,这里明确锚定 rune 语义)
  assert.equal(hasErrors(validateDraft({ ...ok, name: '汉'.repeat(PROJECT_LIMITS.name) })), false)
  assert.equal(
    validateDraft({ ...ok, name: '汉'.repeat(PROJECT_LIMITS.name + 1) }).name.key,
    'project.err.tooLong',
  )
  assert.equal(
    validateDraft({ ...ok, tagline: '字'.repeat(PROJECT_LIMITS.tagline + 1) }).tagline.key,
    'project.err.tooLong',
  )

  // 标签:超个数与超单长分别报错
  assert.equal(
    validateDraft({ ...ok, tags: Array.from({ length: 9 }, (_, i) => `t${i}`) }).tags.key,
    'project.err.tooMany',
  )
  assert.equal(
    validateDraft({ ...ok, tags: ['x'.repeat(25)] }).tags.key,
    'project.err.tagTooLong',
  )

  // 链接:半填行按行号报 linkIncomplete;非 http(s) 报 urlScheme;全空行不报
  const e1 = validateDraft({ ...ok, links: [{ label: '', url: '' }, { label: '演示', url: '' }] })
  assert.equal(e1.links[0], undefined)
  assert.equal(e1.links[1].key, 'project.err.linkIncomplete')
  const e2 = validateDraft({ ...ok, links: [{ label: '演示', url: 'javascript:alert(1)' }] })
  assert.equal(e2.links[0].key, 'project.err.urlScheme')

  // 截图:非 http(s) URL 报错
  assert.equal(
    validateDraft({ ...ok, screenshots: ['data:image/png;base64,x'] }).screenshots.key,
    'project.err.urlScheme',
  )
})

test('draftToPayload drops empty link rows; diffDraft only ships changes', async () => {
  const { emptyDraft, draftToPayload, diffDraft } = await load('/src/lib/project-form.ts')

  const d = { ...emptyDraft(), name: ' 图鲤 ', links: [{ label: '', url: '' }, { label: ' 演示 ', url: ' https://img.li ' }] }
  const payload = draftToPayload(d)
  assert.equal(payload.name, '图鲤')
  assert.deepEqual(payload.links, [{ label: '演示', url: 'https://img.li' }])

  // 加了空链接行但没填 → 不算改动;真实字段改动逐个进 patch(含 audience——编辑页此前
  // 根本没有该字段)
  const base = { ...emptyDraft(), name: '图鲤' }
  assert.deepEqual(diffDraft(base, { ...base, links: [...base.links, { label: '', url: '' }] }), {})
  const patch = diffDraft(base, { ...base, audience: ['developers', 'end_users'], tagline: '一个简单的图床' })
  assert.deepEqual(patch, { audience: ['developers', 'end_users'], tagline: '一个简单的图床' })
})

test('deriveSlug derives a valid slug candidate from CJK/edge-case names', async () => {
  const { deriveSlug } = await load('/src/lib/project-form.ts')
  // 与 api/internal/slugs.Validate 同规则:2–32 位小写字母数字与中划线,首尾字母数字
  const re = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,30}[a-z0-9]$/
  for (const name of ['图鲤', 'Nav.ax', '  ', 'A', 'x'.repeat(80)]) {
    const slug = deriveSlug(name)
    assert.match(slug, re, `deriveSlug(${JSON.stringify(name)}) → ${slug}`)
  }
})

test('slugStem derives clean stems (no random suffix); validateSlug mirrors server rules', async () => {
  const { slugStem, validateSlug } = await load('/src/lib/project-form.ts')
  // 干净词干:不再无条件加随机后缀
  assert.equal(slugStem('Nav.ax'), 'nav-ax')
  assert.equal(slugStem('img.li 图鲤'), 'img-li')
  // 派生不出词干(纯 CJK/过短)→ '' 交给用户填,不生成 project-xxxx
  assert.equal(slugStem('图鲤'), '')
  assert.equal(slugStem('A'), '')
  // validateSlug 镜像 slugs.Validate
  assert.equal(validateSlug('').key, 'project.err.slugRequired')
  assert.equal(validateSlug('nav-ax'), undefined)
  assert.equal(validateSlug('a').key, 'project.err.slugInvalid')
  assert.equal(validateSlug('-ab').key, 'project.err.slugInvalid')
  assert.equal(validateSlug('ab-').key, 'project.err.slugInvalid')
  assert.equal(validateSlug('a--b').key, 'project.err.slugInvalid')
  assert.equal(validateSlug('Ab').key, 'project.err.slugInvalid')
  assert.equal(validateSlug('x'.repeat(33)).key, 'project.err.slugInvalid')
})
