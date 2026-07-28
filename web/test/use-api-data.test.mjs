import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer as createViteServer } from 'vite'
import { stubAPI } from './helpers.mjs'

let vite
async function load(mod) {
  vite ??= await createViteServer({ server: { middlewareMode: true }, appType: 'custom', root: process.cwd() })
  return vite.ssrLoadModule(mod)
}

test('clientFetch resolves data through the shared api client', async () => {
  const { clientFetch } = await load('/src/lib/use-api-data.ts')
  const api = await stubAPI({ '/api/posts': { body: { posts: [{ slug: 'a' }], next_cursor: null } } })
  try {
    const out = await clientFetch(`http://127.0.0.1:${api.port}`, '/api/posts')
    assert.equal(out.posts[0].slug, 'a')
  } finally { api.close() }
})

test('ssr consumption marker prevents double-consume (browser semantics)', async () => {
  const m = await load('/src/lib/use-api-data.ts')
  m.__resetSSRConsumption()
  assert.equal(m.__takeSSRValue('posts', { posts: [1] }), true)   // 首次:可用
  assert.equal(m.__takeSSRValue('posts', { posts: [1] }), false)  // 二次:已消费,走 fetch
})

test('resolveInitialState: server mode always takes a defined ssrValue, never consumes the Set', async () => {
  const m = await load('/src/lib/use-api-data.ts')
  m.__resetSSRConsumption()
  // 模拟同一长驻进程内连续多次渲染同一个 key(比如两个不同的 project slug 先后命中同一个
  // ssrLoadModule 实例)——服务端语义下每次都应该拿到各自的 ssrValue,不受前一次"消费"影响。
  assert.equal(m.resolveInitialState('project', { slug: 'proj-a' }, true), true)
  assert.equal(m.resolveInitialState('project', { slug: 'proj-b' }, true), true)
  assert.equal(m.resolveInitialState('project', { slug: 'proj-c' }, true), true)
  // 服务端模式全程没有碰 Set:同一个 key 切到浏览器模式时仍应是"未消费"的初始状态。
  assert.equal(m.resolveInitialState('project', { slug: 'proj-d' }, false), true)
  assert.equal(m.resolveInitialState('project', { slug: 'proj-e' }, false), false)
})

test('resolveInitialState: undefined ssrValue is never taken in either mode', async () => {
  const m = await load('/src/lib/use-api-data.ts')
  assert.equal(m.resolveInitialState('missing', undefined, true), false)
  assert.equal(m.resolveInitialState('missing', undefined, false), false)
})

// useApiData 的 refreshToken 参数(第三个,默认 0)驱动"写操作后重取只读列表"这条路径
// (线程页:回复提交成功后重取回复列表)。这条行为绑死在 useEffect 的依赖数组与内部一个
// ref 比较上,不搭 DOM 渲染harness 不好直接触发 effect 重跑——退而求其次做源码级断言,
// 钉住三处让这条路径成立的关键写法,防止日后重构悄悄改掉签名/依赖数组/绕过条件。
test('useApiData refreshToken: default param, effect deps, and bypass-guard wiring stay in place', async () => {
  const src = await readFile('src/lib/use-api-data.ts', 'utf8')
  assert.match(src, /refreshToken\s*=\s*0/, 'refreshToken should default to 0 (backward compatible 2-arg calls)')
  assert.match(src, /\[path,\s*refreshToken\]/, 'effect deps must include refreshToken or bumping it would not refetch')
  assert.match(
    src, /refreshToken\s*!==\s*lastRefreshToken\.current/,
    'must compare against the previously-seen token to bypass the "data already exists" guard exactly once per bump',
  )
})

test.after(async () => { await vite?.close() })
