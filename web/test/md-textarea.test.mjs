import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Pure helpers duplicated for node:test without TS transpile — keep in sync with src/lib/md-textarea.ts
function toggleWrap(snap, prefix, suffix) {
  const { value, start, end } = snap
  const selected = value.slice(start, end)
  const before = value.slice(0, start)
  const after = value.slice(end)
  if (selected.startsWith(prefix) && selected.endsWith(suffix) && selected.length >= prefix.length + suffix.length) {
    const inner = selected.slice(prefix.length, selected.length - suffix.length)
    return { value: before + inner + after, start, end: start + inner.length }
  }
  if (before.endsWith(prefix) && after.startsWith(suffix)) {
    return {
      value: before.slice(0, before.length - prefix.length) + selected + after.slice(suffix.length),
      start: start - prefix.length,
      end: end - prefix.length,
    }
  }
  const inserted = prefix + selected + suffix
  const cursor = selected ? start + prefix.length + selected.length + suffix.length : start + prefix.length
  return {
    value: before + inserted + after,
    start: selected ? start + prefix.length : cursor,
    end: selected ? start + prefix.length + selected.length : cursor,
  }
}

function insertLink(snap, url, text) {
  const u = url.trim()
  if (!u) return snap
  const { value, start, end } = snap
  const selected = value.slice(start, end)
  const label = (text?.trim() || selected || '链接文字').replace(/\[/g, '\\[')
  const md = `[${label}](${u})`
  return { value: value.slice(0, start) + md + value.slice(end), start: start + md.length, end: start + md.length }
}

function prefixLines(snap, prefix) {
  const { value, start, end } = snap
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  const lineEndIdx = value.indexOf('\n', end)
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx
  const block = value.slice(lineStart, lineEnd)
  const lines = block.split('\n')
  const next = lines.map((ln) => {
    if (!ln.trim()) return ln
    if (prefix === '- [ ] ' && /^[-*+]\s+\[[ xX]\]\s/.test(ln)) return ln
    return prefix + ln
  }).join('\n')
  return { value: value.slice(0, lineStart) + next + value.slice(lineEnd), start: lineStart, end: lineStart + next.length }
}

function indentSelection(snap, outdent) {
  const { value, start, end } = snap
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  const lineEndIdx = value.indexOf('\n', end)
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx
  const block = value.slice(lineStart, lineEnd)
  const lines = block.split('\n')
  const next = lines.map((ln) => {
    if (outdent) {
      if (ln.startsWith('  ')) return ln.slice(2)
      if (ln.startsWith('\t')) return ln.slice(1)
      return ln
    }
    if (!ln.trim()) return ln
    return '  ' + ln
  }).join('\n')
  const delta = next.length - block.length
  return { value: value.slice(0, lineStart) + next + value.slice(lineEnd), start, end: end + delta }
}

function mdStats(text) {
  const plain = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~|\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const chars = [...plain].length
  const cjk = plain.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)?.length ?? 0
  const latin = plain.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ').split(/\s+/).filter(Boolean).length
  const words = cjk + latin
  const minutes = Math.max(1, Math.ceil(words / 400))
  return { chars, words, minutes }
}

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/lib/md-textarea.ts')

describe('md-textarea helpers', () => {
  it('toggles bold wrap', () => {
    const s = { value: 'hello', start: 0, end: 5 }
    const w = toggleWrap(s, '**', '**')
    assert.equal(w.value, '**hello**')
    const u = toggleWrap({ value: w.value, start: 0, end: w.value.length }, '**', '**')
    assert.equal(u.value, 'hello')
  })

  it('inserts link with selection as label', () => {
    const r = insertLink({ value: 'see docs here', start: 4, end: 8 }, 'https://dev.cx')
    assert.equal(r.value, 'see [docs](https://dev.cx) here')
  })

  it('prefixes task list lines', () => {
    const r = prefixLines({ value: 'a\nb', start: 0, end: 3 }, '- [ ] ')
    assert.equal(r.value, '- [ ] a\n- [ ] b')
  })

  it('indents and outdents', () => {
    const r = indentSelection({ value: '- a', start: 0, end: 3 }, false)
    assert.equal(r.value, '  - a')
    const o = indentSelection({ value: r.value, start: 0, end: r.value.length }, true)
    assert.equal(o.value, '- a')
  })

  it('counts CJK as words', () => {
    const s = mdStats('你好 world')
    assert.ok(s.words >= 3)
    assert.ok(s.minutes >= 1)
  })

  it('source exports expected symbols', () => {
    const text = fs.readFileSync(src, 'utf8')
    for (const name of [
      'toggleWrap', 'insertLink', 'insertCodeBlock', 'prefixLines',
      'insertTaskList', 'indentSelection', 'insertImageMarkdown', 'mdStats', 'detectActiveFormats',
    ]) {
      assert.match(text, new RegExp(`export function ${name}`))
    }
  })
})
