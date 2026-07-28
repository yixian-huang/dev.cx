import { useCallback, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { uploadImage } from '@/lib/actions';
import { apiErrorMessage, type ApiErrorLike } from '@/lib/api-errors';

export interface ImageUploadResult {
  url: string;
  thumbnail_url: string;
}

interface ImageUploadProps {
  onUploaded: (result: ImageUploadResult) => void;
  accept?: string;
  // 外部写入态叠加(例如 /me 头像在 upload 成功后还要等 updateProfile PATCH 完成)——
  // 组件自身的 uploading 状态只覆盖「上传」这一步,调用方可以再传 disabled 顶住后续写入窗口。
  disabled?: boolean;
  // 样式/文案都从调用方就近抄,不在组件里发明新按钮词汇——三处接线点(工具条图标位/截图卡片/
  // 头像操作行)长得完全不同,默认值只兜底裸渲染(SSR 测试用)。
  className?: string;
  children?: ReactNode;
  label?: string;
}

type Status = 'idle' | 'uploading' | 'error';

const DEFAULT_BUTTON_CLASS =
  'inline-flex items-center gap-1.5 text-[13px] text-primary-500 hover:text-primary-700 transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

export default function ImageUpload({
  onUploaded,
  accept = 'image/*',
  disabled = false,
  className = DEFAULT_BUTTON_CLASS,
  children,
  label = '上传图片',
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | undefined>(undefined);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // 允许连续选中同一个文件也能再次触发 onChange。
      e.target.value = '';
      if (!file) return;
      setStatus('uploading');
      setError(undefined);
      try {
        // 浏览器侧走全局 fetch(不带 img.li token,见 actions.uploadImage 的 credentials:'include'
        // 约定);第一参数化只是为了让 actions 层可以脱离 DOM 直接单测。
        const result = await uploadImage(fetch, file);
        setStatus('idle');
        onUploaded(result);
      } catch (err) {
        setStatus('error');
        setError(apiErrorMessage(err as ApiErrorLike));
      }
    },
    [onUploaded],
  );

  const busy = status === 'uploading';

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || busy}
        title={label}
        aria-label={label}
        className={className}
      >
        {busy ? '上传中…' : (children ?? (
          <>
            <i className="ri-upload-2-line text-[14px]"></i>
            {label}
          </>
        ))}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
      />
      {/* 401 也走这条兜底文案——组件不持有 router,是否跳转登录由调用页自行决定(见三处接线的
          各自 401 约定),这里只保证"永远给用户一句可读的话",不吞错误。 */}
      {error && <span className="text-[13px] text-primary-700">{error}</span>}
    </>
  );
}
