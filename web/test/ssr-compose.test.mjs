import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

// 2f 合并编辑器:三个类型表单合一,切换类型不重置内容(单一 state 持有 title/body),
// 真实提交路径 createPost,401 转登录。
test('unified editor submits via createPost with one shared content state', async () => {
  const src = await readFile('src/pages/compose/components/UnifiedEditor.tsx', 'utf8')
  assert.ok(src.includes('createPost('), 'createPost not wired')
  assert.ok(!src.includes('setTimeout'), 'fake submit remains')
  assert.ok(src.includes("navigate('/login')"), 'no 401 -> /login redirect')
  // 类型切换只改 postType,不卸载/清空内容字段
  assert.ok(src.includes('setPostType'), 'type switching missing')
  assert.ok(src.includes('feedback_wanted'), 'feedback chips not wired to feedback_wanted')
})

test('old per-type forms and TypeChooser are gone', async () => {
  for (const f of ['ShowForm', 'BuildForm', 'DiscussForm', 'TypeChooser']) {
    const gone = await readFile(`src/pages/compose/components/${f}.tsx`, 'utf8').then(() => false, () => true)
    assert.ok(gone, `${f} should be deleted`)
  }
})

// C3:ProjectHeader 的 发布进展(build)/分享成果(show) 入口必须触发锁定,
// 文案按类型取 key(LockedHeader 泛化,不再只有 feedback 一种)。
test('compose locks type for build/show/feedback entries', async () => {
  const page = await readFile('src/pages/compose/page.tsx', 'utf8')
  assert.ok(page.includes("'show'") && page.includes("'build'"), 'locked types missing')
  const locked = await readFile('src/pages/compose/components/LockedHeader.tsx', 'utf8')
  assert.ok(locked.includes('lockedBuildTitle') || locked.includes('lockedTitleKey'), 'LockedHeader not generalized per type')
  const zh = await readFile('src/i18n/local/zh/common.ts', 'utf8')
  for (const k of ['compose.lockedBuildTitle', 'compose.lockedShowTitle']) {
    assert.ok(zh.includes(k), `${k} missing in zh i18n`)
  }
})

// C3(parked):quick=1 快速建产品带链接曾 400 bad_link——空 label 未过滤。
// 修复:QuickProjectForm 提供 label 输入,提交侧按 new-project 约定 label&&url 才带上。
test('quick create filters incomplete links and offers a label input', async () => {
  const page = await readFile('src/pages/compose/page.tsx', 'utf8')
  assert.ok(page.includes('.filter('), 'incomplete links not filtered before createProject')
  assert.ok(!page.includes("label: ''"), 'still sends empty-label link')
  const form = await readFile('src/pages/compose/components/QuickProjectForm.tsx', 'utf8')
  assert.ok(form.includes('linkLabel') || form.includes('linkUrl'), 'no label input for links')
})

test('project selector hook uses real my-projects data', async () => {
  const src = await readFile('src/hooks/useMyProjects.ts', 'utf8')
  assert.ok(src.includes('useApiData'), 'selector not wired to real data')
})
