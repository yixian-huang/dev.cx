import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import RichTextarea from '@/components/base/RichTextarea';

interface ReplyComposerProps {
  // 返回值(或其 resolve 值)表示是否发送成功——失败(如 400 too_long/404 not_found)时
  // composer 保留草稿、不折叠,让用户能看着错误提示改完重发,而不是静默吞掉后清空文本框。
  onSend: (text: string) => boolean | Promise<boolean>;
  replyToFloor?: number;
  replyToAuthor?: string;
  onCancelReply?: () => void;
  docked: boolean;
  isLoggedIn: boolean;
  error?: string;
}

export default function ReplyComposer({
  onSend,
  replyToFloor,
  replyToAuthor,
  onCancelReply,
  docked,
  isLoggedIn,
  error,
}: ReplyComposerProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState('');

  // Expand when replyToFloor is set
  useEffect(() => {
    if (replyToFloor !== undefined) {
      setExpanded(true);
    }
  }, [replyToFloor]);

  const handleSend = async () => {
    if (!text.trim()) return;
    // onSend 的契约是"返回/resolve 是否成功",但调用方的 catch 分支不保证覆盖所有情况
    // (目前的实现总是自己 try/catch 后返回 false,但这里不该假设未来所有调用方都这样做)——
    // 一个意外的 throw 不该变成未捕获的 rejection,当作失败处理,草稿保留、不折叠。
    let ok = false;
    try {
      ok = await onSend(text);
    } catch {
      ok = false;
    }
    if (!ok) return;
    setText('');
    setExpanded(false);
    if (onCancelReply) onCancelReply();
  };

  const handleCancel = () => {
    setExpanded(false);
    setText('');
    if (onCancelReply) onCancelReply();
  };

  const placeholder = replyToAuthor
    ? `${t('thread.replyTo', { floor: replyToFloor ?? 0 })} @${replyToAuthor}`
    : t('thread.replyPlaceholder');

  // Floating bar — unauthenticated collapsed state
  if (!isLoggedIn) {
    return (
      <div
        className={
          docked
            ? 'relative w-full pt-4 pb-6'
            : 'fixed bottom-0 left-0 right-0 z-40 px-6 pb-4 pt-2'
        }
      >
        <div className="max-w-[640px] mx-auto">
          <Link
            to="/login"
            className="w-full flex items-center gap-3 px-4 py-3 bg-background-50 border border-background-200/70 hover:border-primary-300/60 rounded-md transition-all duration-200 cursor-pointer text-left"
          >
            <div className="w-7 h-7 rounded-xs bg-secondary-100 flex items-center justify-center shrink-0">
              <i className="ri-login-box-line text-secondary-500 text-[15px]"></i>
            </div>
            <span className="text-[14px] text-foreground-500 flex-1">
              {t('thread.replyLoginHint')}
            </span>
            <span className="text-[13px] text-primary-600 font-medium">
              {t('nav.login')}
            </span>
          </Link>
        </div>
      </div>
    );
  }

  // Floating bar (collapsed state)
  if (!expanded) {
    return (
      <div
        className={
          docked
            ? 'relative w-full pt-4 pb-6'
            : 'fixed bottom-0 left-0 right-0 z-40 px-6 pb-4 pt-2'
        }
      >
        <div className="max-w-[640px] mx-auto">
          {/* 常驻回复条(画布 6a):bg-100 输入面 + 墨色发布按钮 */}
          <button
            onClick={() => setExpanded(true)}
            className="w-full flex items-center gap-3 px-4 py-3 bg-background-100 rounded-xs transition-colors duration-200 cursor-pointer text-left border-none"
          >
            <span className="text-[14px] text-foreground-400 flex-1">
              {t('thread.composerCollapsed')}
            </span>
            <span className="shrink-0 inline-flex items-center px-3.5 py-1.5 text-[13px] font-medium bg-primary-500 text-background-50 rounded-xs whitespace-nowrap">
              {t('thread.sendReply')}
            </span>
          </button>
        </div>
      </div>
    );
  }

  // Expanded state
  return (
    <div
      className={
        docked
          ? 'relative w-full pt-4 pb-6'
          : 'fixed bottom-0 left-0 right-0 z-40 px-6 pb-6 pt-2'
      }
    >
      <div className="max-w-[640px] mx-auto">
        <div className="bg-background-50 border border-background-200/70 rounded-md overflow-hidden">
          {/* Reply context bar */}
          {replyToAuthor && (
            <div className="flex items-center justify-between px-4 py-2 bg-background-100/70 border-b border-background-200/40">
              <span className="text-[12px] text-foreground-500">
                {t('thread.replyTo', { floor: replyToFloor ?? 0 })}{' '}
                <span className="font-medium text-foreground-700">@{replyToAuthor}</span>
              </span>
              <button
                onClick={handleCancel}
                className="text-foreground-400 hover:text-foreground-600 transition-colors duration-200 cursor-pointer"
              >
                <i className="ri-close-line text-[15px]"></i>
              </button>
            </div>
          )}

          {/* RichTextarea */}
          <div className="p-4">
            <RichTextarea
              value={text}
              onChange={setText}
              placeholder={placeholder}
              rows={4}
              minHeight="120px"
              className="border-none bg-transparent"
              toolbarClassName="border-none px-0 pt-0"
            />

            {/* Action bar */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-background-200/40">
              <button
                onClick={handleCancel}
                className="inline-flex items-center px-3 py-1.5 text-[13px] text-foreground-500 hover:text-foreground-700 transition-colors duration-200 cursor-pointer whitespace-nowrap"
              >
                {t('thread.cancel')}
              </button>
              <button
                onClick={handleSend}
                disabled={!text.trim()}
                className="inline-flex items-center px-4 py-1.5 text-[13px] font-medium bg-primary-500 text-background-50 hover:bg-primary-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-200 rounded-xs whitespace-nowrap cursor-pointer"
              >
                {t('thread.sendReply')}
              </button>
            </div>

            {/* Inline send error — reuses login page's error color/size, no toast */}
            {error && <p className="mt-2 text-[13px] text-primary-700">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}