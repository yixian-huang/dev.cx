import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  applyToTextarea,
  detectActiveFormats,
  insertCodeBlock,
  insertLink,
  insertTaskList,
  prefixLines,
  snapshotOf,
  wrapFormat,
  type FormatKey,
} from '@/lib/md-textarea';

type ActionKey =
  | FormatKey
  | 'heading'
  | 'ul'
  | 'ol'
  | 'task'
  | 'quote'
  | 'codeblock'
  | 'divider';

interface ToolbarButton {
  key: ActionKey;
  icon: string;
  label: string;
  /** format wrap keys use wrapFormat; others handled specially */
  kind: 'wrap' | 'prefix' | 'codeblock' | 'link' | 'task' | 'hr';
  prefix?: string;
}

const TOOLBAR_ACTIONS: ToolbarButton[] = [
  { key: 'bold', icon: 'ri-bold', label: '加粗 ⌘B', kind: 'wrap' },
  { key: 'italic', icon: 'ri-italic', label: '斜体 ⌘I', kind: 'wrap' },
  { key: 'strike', icon: 'ri-strikethrough', label: '删除线', kind: 'wrap' },
  { key: 'code', icon: 'ri-code-line', label: '行内代码', kind: 'wrap' },
  { key: 'link', icon: 'ri-link', label: '链接 ⌘K', kind: 'link' },
  { key: 'heading', icon: 'ri-heading', label: '标题', kind: 'prefix', prefix: '## ' },
  { key: 'ul', icon: 'ri-list-unordered', label: '无序列表', kind: 'prefix', prefix: '- ' },
  { key: 'ol', icon: 'ri-list-ordered', label: '有序列表', kind: 'prefix', prefix: '1. ' },
  { key: 'task', icon: 'ri-checkbox-line', label: '任务列表', kind: 'task' },
  { key: 'quote', icon: 'ri-double-quotes-l', label: '引用', kind: 'prefix', prefix: '> ' },
  { key: 'codeblock', icon: 'ri-terminal-box-line', label: '代码块', kind: 'codeblock' },
  { key: 'divider', icon: 'ri-separator', label: '分割线', kind: 'hr' },
];

export { TOOLBAR_ACTIONS };
export type { ToolbarButton as ToolbarAction };

interface EditorToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  className?: string;
  /** selection change tick from parent (optional) */
  selectionTick?: number;
}

export default function EditorToolbar({
  textareaRef,
  className = '',
  selectionTick = 0,
}: EditorToolbarProps) {
  const [active, setActive] = useState<Partial<Record<FormatKey, boolean>>>({});
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');
  const [linkText, setLinkText] = useState('');
  const [codeLangOpen, setCodeLangOpen] = useState(false);
  const [codeLang, setCodeLang] = useState('');
  const linkWrapRef = useRef<HTMLDivElement>(null);
  const codeWrapRef = useRef<HTMLDivElement>(null);
  const savedSel = useRef<{ start: number; end: number } | null>(null);

  const refreshActive = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    setActive(detectActiveFormats(snapshotOf(el)));
  }, [textareaRef]);

  useEffect(() => {
    refreshActive();
  }, [selectionTick, refreshActive]);

  useEffect(() => {
    if (!linkOpen && !codeLangOpen) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (linkOpen && linkWrapRef.current && !linkWrapRef.current.contains(t)) {
        setLinkOpen(false);
      }
      if (codeLangOpen && codeWrapRef.current && !codeWrapRef.current.contains(t)) {
        setCodeLangOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [linkOpen, codeLangOpen]);

  const run = useCallback(
    (fn: (snap: ReturnType<typeof snapshotOf>) => ReturnType<typeof snapshotOf>) => {
      const el = textareaRef.current;
      if (!el) return;
      applyToTextarea(el, fn(snapshotOf(el)));
      requestAnimationFrame(refreshActive);
    },
    [textareaRef, refreshActive],
  );

  const openLink = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    savedSel.current = { start: el.selectionStart, end: el.selectionEnd };
    const selected = el.value.slice(el.selectionStart, el.selectionEnd);
    setLinkText(selected);
    setLinkUrl('https://');
    setLinkOpen(true);
    setCodeLangOpen(false);
  }, [textareaRef]);

  const confirmLink = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (savedSel.current) {
      el.setSelectionRange(savedSel.current.start, savedSel.current.end);
    }
    run((snap) => insertLink(snap, linkUrl, linkText || undefined));
    setLinkOpen(false);
    setLinkUrl('https://');
    setLinkText('');
  }, [textareaRef, linkUrl, linkText, run]);

  const openCodeLang = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    savedSel.current = { start: el.selectionStart, end: el.selectionEnd };
    setCodeLang('');
    setCodeLangOpen(true);
    setLinkOpen(false);
  }, [textareaRef]);

  const confirmCodeBlock = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (savedSel.current) {
      el.setSelectionRange(savedSel.current.start, savedSel.current.end);
    }
    run((snap) => insertCodeBlock(snap, codeLang.trim()));
    setCodeLangOpen(false);
    setCodeLang('');
  }, [textareaRef, codeLang, run]);

  const handleAction = useCallback(
    (action: ToolbarButton) => {
      if (action.kind === 'link') {
        openLink();
        return;
      }
      if (action.kind === 'codeblock') {
        openCodeLang();
        return;
      }
      if (action.kind === 'wrap') {
        run((snap) => wrapFormat(snap, action.key as FormatKey));
        return;
      }
      if (action.kind === 'prefix' && action.prefix) {
        run((snap) => prefixLines(snap, action.prefix!));
        return;
      }
      if (action.kind === 'task') {
        run((snap) => insertTaskList(snap));
        return;
      }
      if (action.kind === 'hr') {
        run((snap) => {
          const { value, start, end } = snap;
          const block = `${start > 0 && value[start - 1] !== '\n' ? '\n' : ''}\n---\n`;
          return {
            value: value.slice(0, start) + block + value.slice(end),
            start: start + block.length,
            end: start + block.length,
          };
        });
      }
    },
    [openLink, openCodeLang, run],
  );

  return (
    <div className={`relative flex items-center flex-wrap gap-0.5 ${className}`}>
      {TOOLBAR_ACTIONS.map((action) => {
        const isActive =
          (action.key === 'bold' ||
            action.key === 'italic' ||
            action.key === 'strike' ||
            action.key === 'code' ||
            action.key === 'link') &&
          active[action.key as FormatKey];
        return (
          <button
            key={action.key}
            type="button"
            onMouseDown={(e) => {
              // keep textarea selection
              e.preventDefault();
            }}
            onClick={() => handleAction(action)}
            title={action.label}
            className={`w-7 h-7 flex items-center justify-center rounded-xs transition-colors duration-150 cursor-pointer ${
              isActive
                ? 'text-primary-700 bg-primary-100'
                : 'text-foreground-400 hover:text-foreground-700 hover:bg-background-200/60'
            }`}
            aria-label={action.label}
            aria-pressed={isActive || undefined}
          >
            <i className={`${action.icon} text-[15px]`}></i>
          </button>
        );
      })}

      {linkOpen && (
        <div
          ref={linkWrapRef}
          className="absolute z-30 top-full left-0 mt-1 w-72 p-3 bg-background-50 border border-background-200 rounded-xs shadow-sm"
        >
          <p className="text-[11px] font-mono tracking-[0.14em] text-foreground-400 mb-2">LINK</p>
          <input
            autoFocus
            value={linkText}
            onChange={(e) => setLinkText(e.target.value)}
            placeholder="显示文字"
            className="w-full mb-2 text-[13px] px-2 py-1.5 bg-background-100 rounded-xs outline-none text-foreground-900"
          />
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                confirmLink();
              }
              if (e.key === 'Escape') setLinkOpen(false);
            }}
            placeholder="https://"
            className="w-full mb-2 text-[13px] px-2 py-1.5 bg-background-100 rounded-xs outline-none text-foreground-900 font-mono"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setLinkOpen(false)}
              className="text-[12px] text-foreground-500 cursor-pointer bg-transparent border-none"
            >
              取消
            </button>
            <button
              type="button"
              onClick={confirmLink}
              className="text-[12px] px-2.5 py-1 bg-primary-500 text-background-50 rounded-xs cursor-pointer border-none"
            >
              插入
            </button>
          </div>
        </div>
      )}

      {codeLangOpen && (
        <div
          ref={codeWrapRef}
          className="absolute z-30 top-full left-24 mt-1 w-56 p-3 bg-background-50 border border-background-200 rounded-xs shadow-sm"
        >
          <p className="text-[11px] font-mono tracking-[0.14em] text-foreground-400 mb-2">CODE</p>
          <input
            autoFocus
            value={codeLang}
            onChange={(e) => setCodeLang(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                confirmCodeBlock();
              }
              if (e.key === 'Escape') setCodeLangOpen(false);
            }}
            placeholder="语言（可选，如 ts / go）"
            className="w-full mb-2 text-[13px] px-2 py-1.5 bg-background-100 rounded-xs outline-none text-foreground-900 font-mono"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCodeLangOpen(false)}
              className="text-[12px] text-foreground-500 cursor-pointer bg-transparent border-none"
            >
              取消
            </button>
            <button
              type="button"
              onClick={confirmCodeBlock}
              className="text-[12px] px-2.5 py-1 bg-primary-500 text-background-50 rounded-xs cursor-pointer border-none"
            >
              插入
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Imperative helpers for MarkdownEditor keyboard shortcuts */
export function toolbarRunWrap(
  el: HTMLTextAreaElement,
  key: FormatKey,
): void {
  applyToTextarea(el, wrapFormat(snapshotOf(el), key));
}

export function toolbarRunLink(
  el: HTMLTextAreaElement,
  url: string,
  text?: string,
): void {
  applyToTextarea(el, insertLink(snapshotOf(el), url, text));
}
