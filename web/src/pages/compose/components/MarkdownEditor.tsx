import { useState, useCallback, useRef, useEffect, type ClipboardEvent, type KeyboardEvent } from 'react';
import Markdown from '@/components/base/Markdown';
import EditorToolbar, { toolbarRunWrap } from '@/components/base/EditorToolbar';
import ImageUpload, { type ImageUploadResult } from '@/components/feature/ImageUpload';
import { deleteImage, uploadImage } from '@/lib/actions';
import {
  applyToTextarea,
  findImageAtSelection,
  indentSelection,
  insertImageMarkdown,
  insertLink,
  mdStats,
  removeImageAtSelection,
  snapshotOf,
} from '@/lib/md-textarea';

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
  placeholder = '开始写 Markdown… 支持 ⌘B / ⌘I / ⌘K，粘贴图片自动上传',
  minHeight = 320,
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<EditorMode>('write');
  const [selectionTick, setSelectionTick] = useState(0);
  const [pasteStatus, setPasteStatus] = useState<string | undefined>();
  const [imageAtCursor, setImageAtCursor] = useState(false);
  const [deletingImage, setDeletingImage] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const stats = mdStats(value);

  /* ── Auto-grow textarea ── */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el || mode === 'preview') return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
  }, [value, mode, minHeight]);

  const bumpSelection = useCallback(() => {
    setSelectionTick((n) => n + 1);
    const el = textareaRef.current;
    if (el) {
      setImageAtCursor(Boolean(findImageAtSelection(snapshotOf(el))));
    }
  }, []);

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

  const insertImageAtCursor = useCallback(
    (result: ImageUploadResult) => {
      const el = textareaRef.current;
      if (!el) {
        onChange(`${value}${value.endsWith('\n') || !value ? '' : '\n'}![](${result.url})\n`);
        return;
      }
      applyToTextarea(el, insertImageMarkdown(snapshotOf(el), result.url));
    },
    [value, onChange],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      const el = textareaRef.current;
      if (!el) return;
      const mod = e.metaKey || e.ctrlKey;

      if (mod && !e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toolbarRunWrap(el, 'bold');
        bumpSelection();
        return;
      }
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        toolbarRunWrap(el, 'italic');
        bumpSelection();
        return;
      }
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const selected = el.value.slice(el.selectionStart, el.selectionEnd);
        const url = window.prompt('链接 URL', 'https://');
        if (url === null || !url.trim()) return;
        const text =
          selected || window.prompt('显示文字（可空）', '链接文字') || '链接文字';
        applyToTextarea(el, insertLink(snapshotOf(el), url, text));
        bumpSelection();
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        applyToTextarea(el, indentSelection(snapshotOf(el), e.shiftKey));
        bumpSelection();
      }
    },
    [bumpSelection],
  );

  const handlePaste = useCallback(
    async (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length === 0) return;
      e.preventDefault();
      setPasteStatus('上传图片…');
      try {
        for (const file of files) {
          const result = await uploadImage(fetch, file);
          insertImageAtCursor(result);
        }
        setPasteStatus(undefined);
      } catch {
        setPasteStatus('图片上传失败');
        setTimeout(() => setPasteStatus(undefined), 2500);
      }
    },
    [insertImageAtCursor],
  );

  /** 删除光标处 Markdown 图片，并软删 img.li（失败仍移除正文，避免卡死）。 */
  const handleDeleteImageAtCursor = useCallback(async () => {
    const el = textareaRef.current;
    if (!el || deletingImage) return;
    const snap = snapshotOf(el);
    const hit = findImageAtSelection(snap);
    if (!hit) return;
    setDeletingImage(true);
    setPasteStatus('删除图床…');
    let remoteFailed = false;
    try {
      await deleteImage(fetch, { url: hit.url });
    } catch {
      // 图床删失败仍允许去掉正文引用（外链或 token 无 full scope）
      remoteFailed = true;
    }
    const next = removeImageAtSelection(snap);
    if (next) applyToTextarea(el, next);
    setImageAtCursor(false);
    if (remoteFailed) {
      setPasteStatus('图床删除失败，已从正文移除');
      setTimeout(() => setPasteStatus(undefined), 2500);
    } else {
      setPasteStatus(undefined);
    }
    setDeletingImage(false);
    bumpSelection();
  }, [deletingImage, bumpSelection]);

  const modes: { key: EditorMode; label: string; icon: string }[] = [
    { key: 'write', label: '编辑', icon: 'ri-edit-line' },
    { key: 'preview', label: '预览', icon: 'ri-eye-line' },
    { key: 'split', label: '对照', icon: 'ri-layout-column-line' },
  ];

  const toolbar = (
    <div className="flex items-center gap-0.5 px-2 pt-2 pb-1 border-b border-background-200/30">
      <EditorToolbar textareaRef={textareaRef} selectionTick={selectionTick} />
      <ImageUpload
        onUploaded={insertImageAtCursor}
        className="w-7 h-7 flex items-center justify-center rounded-xs text-foreground-400 hover:text-foreground-700 hover:bg-background-200/60 transition-colors duration-150 cursor-pointer disabled:opacity-50"
        label="插入图片"
      >
        <i className="ri-image-add-line text-[15px]"></i>
      </ImageUpload>
      {imageAtCursor && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void handleDeleteImageAtCursor()}
          disabled={deletingImage}
          title="从正文移除并删除图床文件"
          aria-label="删除图片"
          className="w-7 h-7 flex items-center justify-center rounded-xs text-accent-600 hover:bg-accent-100 transition-colors duration-150 cursor-pointer disabled:opacity-50"
        >
          <i className="ri-delete-bin-line text-[15px]"></i>
        </button>
      )}
    </div>
  );

  return (
    <div className="w-full">
      {/* Mode tabs */}
      <div className="flex items-center gap-1 mb-3">
        {modes.map((m) => (
          <button
            key={m.key}
            type="button"
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
        {pasteStatus && (
          <span className="text-[11px] text-primary-600 mr-2">{pasteStatus}</span>
        )}
        <span className="text-[11px] text-foreground-300 font-mono" title="字数 · 词数 · 约读时间">
          {stats.chars} 字 · {stats.words} 词 · ~{stats.minutes} 分钟
        </span>
      </div>

      {/* Editor area */}
      {mode === 'write' && (
        <div className="border border-background-200/50 rounded-xs overflow-hidden focus-within:border-primary-300/50 transition-colors duration-200">
          {toolbar}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onSelect={bumpSelection}
            onKeyUp={bumpSelection}
            onClick={bumpSelection}
            onPaste={(e) => void handlePaste(e)}
            placeholder={placeholder}
            className="w-full text-[15px] leading-relaxed text-foreground-900 bg-background-100 placeholder:text-foreground-300 px-3 py-2.5 outline-none resize-none font-body"
            style={{ minHeight }}
            spellCheck
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
            {toolbar}
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onScroll={handleTextareaScroll}
              onKeyDown={handleKeyDown}
              onSelect={bumpSelection}
              onKeyUp={bumpSelection}
              onClick={bumpSelection}
              onPaste={(e) => void handlePaste(e)}
              placeholder={placeholder}
              className="w-full flex-1 text-[15px] leading-relaxed text-foreground-900 bg-background-100 placeholder:text-foreground-300 px-3 py-2.5 outline-none resize-none font-body"
              style={{ minHeight, height: minHeight }}
              spellCheck
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
