import { useCallback, type RefObject } from 'react';

interface ToolbarAction {
  key: string;
  icon: string;
  label: string;
  prefix: string;
  suffix: string;
  multiline?: boolean;
}

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  { key: 'bold', icon: 'ri-bold', label: '加粗', prefix: '**', suffix: '**' },
  { key: 'italic', icon: 'ri-italic', label: '斜体', prefix: '*', suffix: '*' },
  { key: 'strike', icon: 'ri-strikethrough', label: '删除线', prefix: '~~', suffix: '~~' },
  { key: 'code', icon: 'ri-code-line', label: '行内代码', prefix: '`', suffix: '`' },
  { key: 'link', icon: 'ri-link', label: '链接', prefix: '[', suffix: '](url)' },
  { key: 'heading', icon: 'ri-heading', label: '标题', prefix: '\n## ', suffix: '', multiline: true },
  { key: 'ul', icon: 'ri-list-unordered', label: '无序列表', prefix: '\n- ', suffix: '', multiline: true },
  { key: 'ol', icon: 'ri-list-ordered', label: '有序列表', prefix: '\n1. ', suffix: '', multiline: true },
  { key: 'quote', icon: 'ri-double-quotes-l', label: '引用', prefix: '\n> ', suffix: '', multiline: true },
  { key: 'codeblock', icon: 'ri-terminal-box-line', label: '代码块', prefix: '\n```\n', suffix: '\n```\n', multiline: true },
  { key: 'divider', icon: 'ri-separator', label: '分割线', prefix: '\n---\n', suffix: '', multiline: true },
];

function insertFormatting(
  textarea: HTMLTextAreaElement,
  prefix: string,
  suffix: string,
) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const selectedText = value.substring(start, end);

  const before = value.substring(0, start);
  const after = value.substring(end);

  const newValue = before + prefix + selectedText + suffix + after;

  // Need to dispatch event so React controlled state updates
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value',
  )?.set;
  nativeInputValueSetter?.call(textarea, newValue);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));

  // Restore cursor position
  setTimeout(() => {
    const newCursorPos = selectedText
      ? start + prefix.length + selectedText.length + suffix.length
      : start + prefix.length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);
    textarea.focus();
  }, 0);
}

interface EditorToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  className?: string;
}

export { TOOLBAR_ACTIONS };
export type { ToolbarAction };

export default function EditorToolbar({ textareaRef, className = '' }: EditorToolbarProps) {
  const handleAction = useCallback(
    (action: ToolbarAction) => {
      const el = textareaRef.current;
      if (!el) return;
      insertFormatting(el, action.prefix, action.suffix);
    },
    [textareaRef],
  );

  return (
    <div className={`flex items-center flex-wrap gap-0.5 ${className}`}>
      {TOOLBAR_ACTIONS.map((action) => (
        <button
          key={action.key}
          type="button"
          onClick={() => handleAction(action)}
          title={action.label}
          className="w-7 h-7 flex items-center justify-center rounded-xs text-foreground-400 hover:text-foreground-700 hover:bg-background-200/60 transition-colors duration-150 cursor-pointer"
          aria-label={action.label}
        >
          <i className={`${action.icon} text-[15px]`}></i>
        </button>
      ))}
    </div>
  );
}