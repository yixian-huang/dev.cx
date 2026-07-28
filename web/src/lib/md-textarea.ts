/**
 * Textarea Markdown helpers — pure string ops + thin DOM apply.
 * Used by EditorToolbar / MarkdownEditor (compose path).
 */

export type Selection = { start: number; end: number }

export type TextSnapshot = {
  value: string
  start: number
  end: number
}

export type FormatKey = 'bold' | 'italic' | 'strike' | 'code' | 'link'

const WRAP: Record<FormatKey, { prefix: string; suffix: string }> = {
  bold: { prefix: '**', suffix: '**' },
  italic: { prefix: '*', suffix: '*' },
  strike: { prefix: '~~', suffix: '~~' },
  code: { prefix: '`', suffix: '`' },
  link: { prefix: '[', suffix: '](url)' },
}

/** Set controlled textarea value via native setter so React onChange fires. */
export function applyToTextarea(
  el: HTMLTextAreaElement,
  next: TextSnapshot,
): void {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value',
  )?.set
  setter?.call(el, next.value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  const posStart = next.start
  const posEnd = next.end
  requestAnimationFrame(() => {
    el.setSelectionRange(posStart, posEnd)
    el.focus()
  })
}

export function snapshotOf(el: HTMLTextAreaElement): TextSnapshot {
  return {
    value: el.value,
    start: el.selectionStart ?? 0,
    end: el.selectionEnd ?? 0,
  }
}

/** Toggle wrap around selection if already wrapped; otherwise wrap. */
export function toggleWrap(
  snap: TextSnapshot,
  prefix: string,
  suffix: string,
): TextSnapshot {
  const { value, start, end } = snap
  const selected = value.slice(start, end)
  const before = value.slice(0, start)
  const after = value.slice(end)

  // Already wrapped: unwrap
  if (
    selected.startsWith(prefix) &&
    selected.endsWith(suffix) &&
    selected.length >= prefix.length + suffix.length
  ) {
    const inner = selected.slice(prefix.length, selected.length - suffix.length)
    return {
      value: before + inner + after,
      start,
      end: start + inner.length,
    }
  }
  // Surrounding markers outside selection
  if (
    before.endsWith(prefix) &&
    after.startsWith(suffix)
  ) {
    return {
      value:
        before.slice(0, before.length - prefix.length) +
        selected +
        after.slice(suffix.length),
      start: start - prefix.length,
      end: end - prefix.length,
    }
  }

  const inserted = prefix + selected + suffix
  const cursor = selected
    ? start + prefix.length + selected.length + suffix.length
    : start + prefix.length
  return {
    value: before + inserted + after,
    start: selected ? start + prefix.length : cursor,
    end: selected ? start + prefix.length + selected.length : cursor,
  }
}

export function wrapFormat(snap: TextSnapshot, key: FormatKey): TextSnapshot {
  const { prefix, suffix } = WRAP[key]
  return toggleWrap(snap, prefix, suffix)
}

/** Insert markdown link; text defaults to selection or "链接文字". */
export function insertLink(
  snap: TextSnapshot,
  url: string,
  text?: string,
): TextSnapshot {
  const u = url.trim()
  if (!u) return snap
  const { value, start, end } = snap
  const selected = value.slice(start, end)
  const label = (text?.trim() || selected || '链接文字').replace(/\[/g, '\\[')
  const md = `[${label}](${u})`
  return {
    value: value.slice(0, start) + md + value.slice(end),
    start: start + md.length,
    end: start + md.length,
  }
}

/** Insert fenced code block; optional language token. */
export function insertCodeBlock(snap: TextSnapshot, lang = ''): TextSnapshot {
  const { value, start, end } = snap
  const selected = value.slice(start, end)
  const open = lang ? `\`\`\`${lang}\n` : '```\n'
  const close = '\n```'
  const body = selected || ''
  const block = `${start > 0 && value[start - 1] !== '\n' ? '\n' : ''}${open}${body}${close}\n`
  const cursor = start + (start > 0 && value[start - 1] !== '\n' ? 1 : 0) + open.length + body.length
  return {
    value: value.slice(0, start) + block + value.slice(end),
    start: cursor,
    end: cursor,
  }
}

/** Prefix each selected line (or current line) for lists / quote / heading. */
export function prefixLines(snap: TextSnapshot, prefix: string): TextSnapshot {
  const { value, start, end } = snap
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  const lineEndIdx = value.indexOf('\n', end)
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx
  const block = value.slice(lineStart, lineEnd)
  const lines = block.split('\n')
  const next = lines
    .map((ln) => {
      if (!ln.trim()) return ln
      // avoid double-prefix same marker
      if (prefix === '- ' && (/^[-*+]\s/.test(ln) || /^\d+\.\s/.test(ln))) {
        return ln.replace(/^([-*+]|\d+\.)\s+/, '- ')
      }
      if (prefix === '1. ' && (/^[-*+]\s/.test(ln) || /^\d+\.\s/.test(ln))) {
        return ln.replace(/^([-*+]|\d+\.)\s+/, '1. ')
      }
      if (prefix === '- [ ] ' && /^[-*+]\s+\[[ xX]\]\s/.test(ln)) return ln
      if (prefix === '> ' && /^>\s?/.test(ln)) return ln
      if (prefix === '## ' && /^#{1,6}\s/.test(ln)) {
        return ln.replace(/^#{1,6}\s+/, '## ')
      }
      return prefix + ln
    })
    .join('\n')
  return {
    value: value.slice(0, lineStart) + next + value.slice(lineEnd),
    start: lineStart,
    end: lineStart + next.length,
  }
}

export function insertTaskList(snap: TextSnapshot): TextSnapshot {
  return prefixLines(snap, '- [ ] ')
}

/** Tab / Shift-Tab: indent or outdent list-ish lines. */
export function indentSelection(snap: TextSnapshot, outdent: boolean): TextSnapshot {
  const { value, start, end } = snap
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  const lineEndIdx = value.indexOf('\n', end)
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx
  const block = value.slice(lineStart, lineEnd)
  const lines = block.split('\n')
  const next = lines
    .map((ln) => {
      if (outdent) {
        if (ln.startsWith('  ')) return ln.slice(2)
        if (ln.startsWith('\t')) return ln.slice(1)
        return ln
      }
      if (!ln.trim()) return ln
      return '  ' + ln
    })
    .join('\n')
  const delta = next.length - block.length
  return {
    value: value.slice(0, lineStart) + next + value.slice(lineEnd),
    start: Math.max(lineStart, start + (outdent ? Math.min(0, delta) : 2)),
    end: end + delta,
  }
}

export function insertAtCursor(snap: TextSnapshot, text: string): TextSnapshot {
  const { value, start, end } = snap
  return {
    value: value.slice(0, start) + text + value.slice(end),
    start: start + text.length,
    end: start + text.length,
  }
}

export function insertImageMarkdown(snap: TextSnapshot, url: string, alt = ''): TextSnapshot {
  const md = `![${alt}](${url})`
  const needNl = snap.start > 0 && snap.value[snap.start - 1] !== '\n'
  return insertAtCursor(snap, `${needNl ? '\n' : ''}${md}\n`)
}

/** Heuristic active formats for toolbar highlight. */
export function detectActiveFormats(snap: TextSnapshot): Partial<Record<FormatKey, boolean>> {
  const { value, start, end } = snap
  const selected = value.slice(start, end)
  const before = value.slice(Math.max(0, start - 3), start)
  const after = value.slice(end, end + 3)
  const out: Partial<Record<FormatKey, boolean>> = {}

  const check = (key: FormatKey, p: string, s: string) => {
    if (
      (selected.startsWith(p) && selected.endsWith(s)) ||
      (before.endsWith(p) && after.startsWith(s))
    ) {
      out[key] = true
    }
  }
  check('bold', '**', '**')
  check('italic', '*', '*')
  check('strike', '~~', '~~')
  check('code', '`', '`')
  // link: selected looks like [text](url) or cursor inside
  if (/\[[^\]]*\]\([^)]*\)/.test(selected) || (
    before.includes('[') && after.includes('](')
  )) {
    out.link = true
  }
  return out
}

/** CJK-aware word/char stats. */
export function mdStats(text: string): { chars: number; words: number; minutes: number } {
  const plain = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~|\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const chars = [...plain].length
  // CJK ideographs count as words; latin runs count as words
  const cjk = plain.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)?.length ?? 0
  const latin = plain
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length
  const words = cjk + latin
  const minutes = Math.max(1, Math.ceil(words / 400))
  return { chars, words, minutes }
}
