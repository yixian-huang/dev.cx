import { useState, useCallback, useRef, useEffect } from 'react';
import Markdown from '@/components/base/Markdown';
import EditorToolbar from '@/components/base/EditorToolbar';
import ImageUpload, { type ImageUploadResult } from '@/components/feature/ImageUpload';

type EditorMode = 'write' | 'preview' | 'split';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: number;
}

export default function MarkdownEditor({
  value,
  onChange,
  placeholder = '开始写 Markdown...',
  minHeight = 320,
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<EditorMode>('write');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  /* ── Auto-grow textarea ── */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el || mode === 'preview') return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
  }, [value, mode, minHeight]);

  /* ── Sync scroll in split mode ── */
  const handleTextareaScroll = useCallback(() => {
    if (mode !== 'split') return;
    const ta = textareaRef.current;
    const pv = previewRef.current;
    if (!ta || !pv) return;
    const ratio = ta.scrollTop / (ta.scrollHeight - ta.clientHeight || 1);
    pv.scrollTop = ratio * (pv.scrollHeight - pv.clientHeight);
  }, [mode]);

  const handlePreviewScroll = useCallback(() => {
    if (mode !== 'split') return;
    const ta = textareaRef.current;
    const pv = previewRef.current;
    if (!ta || !pv) return;
    const ratio = pv.scrollTop / (pv.scrollHeight - pv.clientHeight || 1);
    ta.scrollTop = ratio * (ta.scrollHeight - ta.clientHeight);
  }, [mode]);

  /* ── Insert image markdown at cursor ──
     沿用 EditorToolbar 里 insertFormatting 同样的「原生 setter + dispatch input 事件」手法
     (它是模块内私有函数、未导出，这里不改 EditorToolbar.tsx——两处各自实现一份，避免把图片
     上传行为泄漏到复用同一个 EditorToolbar 的 RichTextarea 等其它场景)。光标 API 不可用时
     (理论上不会发生，因为按钮只在 write/split 模式下渲染，此时 textareaRef 必挂载)退化为
     追加到末尾，不丢已输入内容。 */
  const insertImageMarkdown = useCallback(
    (result: ImageUploadResult) => {
      const markdown = `![](${result.url})`;
      const el = textareaRef.current;
      if (!el) {
        onChange(`${value}${value.endsWith('\n') || !value ? '' : '\n'}${markdown}\n`);
        return;
      }
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const newValue = el.value.substring(0, start) + markdown + el.value.substring(end);
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      nativeInputValueSetter?.call(el, newValue);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(() => {
        const pos = start + markdown.length;
        el.setSelectionRange(pos, pos);
        el.focus();
      }, 0);
    },
    [value, onChange],
  );

  const modes: { key: EditorMode; label: string; icon: string }[] = [
    { key: 'write', label: '编辑', icon: 'ri-edit-line' },
    { key: 'preview', label: '预览', icon: 'ri-eye-line' },
    { key: 'split', label: '对照', icon: 'ri-layout-column-line' },
  ];

  return (
    <div className="w-full">
      {/* Mode tabs */}
      <div className="flex items-center gap-1 mb-3">
        {modes.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-xs transition-colors duration-200 cursor-pointer whitespace-nowrap ${
              mode === m.key
                ? 'bg-secondary-100 text-secondary-900 font-medium'
                : 'text-foreground-500 hover:text-foreground-800 hover:bg-background-100'
            }`}
          >
            <i className={`${m.icon} text-[13px]`}></i>
            {m.label}
          </button>
        ))}
        <div className="flex-1"></div>
        <span className="text-[11px] text-foreground-300 font-mono">{value.length} 字</span>
      </div>

      {/* Editor area */}
      {mode === 'write' && (
        <div className="border border-background-200/50 rounded-xs overflow-hidden focus-within:border-primary-300/50 transition-colors duration-200">
          <div className="flex items-center gap-0.5 px-2 pt-2 pb-1 border-b border-background-200/30">
            <EditorToolbar textareaRef={textareaRef} />
            <ImageUpload
              onUploaded={insertImageMarkdown}
              className="w-7 h-7 flex items-center justify-center rounded-xs text-foreground-400 hover:text-foreground-700 hover:bg-background-200/60 transition-colors duration-150 cursor-pointer disabled:opacity-50"
              label="插入图片"
            >
              <i className="ri-image-add-line text-[15px]"></i>
            </ImageUpload>
          </div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full text-[15px] leading-relaxed text-foreground-900 bg-background-100 placeholder:text-foreground-300 px-3 py-2.5 outline-none resize-none font-body"
            style={{ minHeight }}
          />
        </div>
      )}

      {mode === 'preview' && (
        <div
          className="prose-custom min-h-[320px] px-3 py-2.5 bg-background-100 rounded-xs border border-background-200/50 text-[14px] text-foreground-700 leading-relaxed"
          style={{ minHeight }}
        >
          {value.trim() ? (
            <Markdown>{value}</Markdown>
          ) : (
            <p className="text-[14px] text-foreground-300 italic">暂无内容 — 切换到「编辑」模式开始写作</p>
          )}
        </div>
      )}

      {mode === 'split' && (
        <div className="flex gap-4" style={{ minHeight }}>
          <div className="flex-1 flex flex-col min-w-0 border border-background-200/50 rounded-xs overflow-hidden focus-within:border-primary-300/50 transition-colors duration-200">
            <div className="flex items-center gap-0.5 px-2 pt-2 pb-1 border-b border-background-200/30">
              <EditorToolbar textareaRef={textareaRef} />
              <ImageUpload
                onUploaded={insertImageMarkdown}
                className="w-7 h-7 flex items-center justify-center rounded-xs text-foreground-400 hover:text-foreground-700 hover:bg-background-200/60 transition-colors duration-150 cursor-pointer disabled:opacity-50"
                label="插入图片"
              >
                <i className="ri-image-add-line text-[15px]"></i>
              </ImageUpload>
            </div>
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onScroll={handleTextareaScroll}
              placeholder={placeholder}
              className="w-full flex-1 text-[15px] leading-relaxed text-foreground-900 bg-background-100 placeholder:text-foreground-300 px-3 py-2.5 outline-none resize-none font-body"
              style={{ minHeight, height: minHeight }}
            />
          </div>
          <div className="w-px bg-background-200/40 shrink-0"></div>
          <div
            ref={previewRef}
            onScroll={handlePreviewScroll}
            className="flex-1 min-w-0 overflow-y-auto px-3 py-2.5 bg-background-100 rounded-xs border border-background-200/50 text-[14px] text-foreground-700 leading-relaxed"
            style={{ maxHeight: minHeight + 200 }}
          >
            {value.trim() ? (
              <Markdown>{value}</Markdown>
            ) : (
              <p className="text-[14px] text-foreground-300 italic">预览将在这里显示</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}