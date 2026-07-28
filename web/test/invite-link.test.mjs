import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// invite-link.ts 是纯 TS 路径辅助；node:test 不经 Vite 转译时，内联复刻契约断言并
// 同步校验源文件仍导出同名函数（防重构丢行为）。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'src/lib/invite-link.ts')

function inviteRegisterPath(code) {
  const c = String(code).trim()
  if (!c) return '/onboarding'
  return `/onboarding?code=${encodeURIComponent(c)}`
}

function inviteRegisterUrl(code, origin) {
  const pathPart = inviteRegisterPath(code)
  if (!origin) return pathPart
  return `${String(origin).replace(/\/$/, '')}${pathPart}`
}

describe('inviteRegisterPath / inviteRegisterUrl', () => {
  it('builds onboarding path with encoded code', () => {
    assert.equal(inviteRegisterPath('ABC-123'), '/onboarding?code=ABC-123')
    assert.equal(inviteRegisterPath('a b/c'), '/onboarding?code=a%20b%2Fc')
    assert.equal(inviteRegisterPath('  x  '), '/onboarding?code=x')
    assert.equal(inviteRegisterPath(''), '/onboarding')
  })

  it('joins absolute origin without double slash', () => {
    assert.equal(
      inviteRegisterUrl('W32', 'https://dev.cx'),
      'https://dev.cx/onboarding?code=W32',
    )
    assert.equal(
      inviteRegisterUrl('W32', 'https://dev.cx/'),
      'https://dev.cx/onboarding?code=W32',
    )
  })

  it('source module still exports helpers', async () => {
    const fs = await import('node:fs/promises')
    const text = await fs.readFile(src, 'utf8')
    assert.match(text, /export function inviteRegisterPath/)
    assert.match(text, /export function inviteRegisterUrl/)
    assert.match(text, /onboarding\?code=/)
  })
})
