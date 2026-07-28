import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

test('src/mocks directory is gone', () => {
  assert.ok(!existsSync('src/mocks'), 'src/mocks still exists')
})

test('no source file references mocks', () => {
  let out = ''
  try {
    out = execFileSync('grep', ['-rn', 'mocks', 'src', '--include=*.ts', '--include=*.tsx'], { encoding: 'utf8' })
  } catch (e) {
    if (e.status !== 1) throw e   // grep 无匹配退出码 1 = 期望结果
  }
  assert.equal(out.trim(), '', `mock references remain:\n${out}`)
})
