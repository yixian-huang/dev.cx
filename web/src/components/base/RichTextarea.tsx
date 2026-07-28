import { useRef, useCallback, type ChangeEvent } from 'react';
import EditorToolbar from '@/components/base/EditorToolbar';

interface RichTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  toolbarClassName?: string;
  minHeight?: string;
}

export default function RichTextarea({
  value,
  onChange,
  placeholder = '',
  rows = 4,
  className = '',
  toolbarClassName = '',
  minHeight,
}: RichTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  return (
    <div className={`bg-background-100 rounded-xs border border-background-200/50 focus-within:border-primary-300/50 transition-colors duration-200 overflow-hidden ${className}`}>
      <EditorToolbar
        textareaRef={textareaRef}
        className={`px-2 pt-2 pb-1 border-b border-background-200/30 ${toolbarClassName}`}
      />
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        rows={rows}
        style={minHeight ? { minHeight } : undefined}
        className="w-full bg-transparent text-[14px] leading-relaxed text-foreground-900 placeholder:text-foreground-300 px-3 py-2.5 outline-none resize-none"
      />
    </div>
  );
}