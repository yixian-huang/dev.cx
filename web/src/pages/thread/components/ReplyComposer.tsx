import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import RichTextarea from '@/components/base/RichTextarea';
import FormAlert from '@/components/base/FormAlert';
import { useAuth } from '@/hooks/useAuth';

interface ReplyComposerProps {
  // 返回值(或其 resolve 值)表示是否发送成功——失败时 composer 保留草稿、不折叠。
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
  const { user } = useAuth();
  const emailVerified = user?.emailVerified !== false;
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState('');
  const [localError, setLocalError] = useState<string | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (replyToFloor !== undefined) {
      setExpanded(true);
    }
  }, [replyToFloor]);

  // 展开后滚入视口(短帖 dock 在文档末尾时,否则发布钮会在折线外/被底栏挡住)
  useEffect(() => {
    if (!expanded) return;
    const id = window.requestAnimationFrame(() => {
      shellRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
    return () => window.cancelAnimationFrame(id);
  }, [expanded, docked]);

  // 父级 API 错误到达时清本地空内容提示,避免叠两句
  useEffect(() => {
    if (error) setLocalError(undefined);
  }, [error]);

  const handleSend = async () => {
    if (sending) return;
    setLocalError(undefined);
    if (!emailVerified) {
      setLocalError(t('compose.needEmailVerify'));
      return;
    }
    if (!text.trim()) {
      setLocalError(t('thread.needBody'));
      return;
    }
    setSending(true);
    let ok = false;
    try {
      ok = await onSend(text);
    } catch {
      ok = false;
    } finally {
      setSending(false);
    }
    if (!ok) return;
    setText('');
    setExpanded(false);
    setLocalError(undefined);
    if (onCancelReply) onCancelReply();
  };

  const handleCancel = () => {
    setExpanded(false);
    setText('');
    setLocalError(undefined);
    if (onCancelReply) onCancelReply();
  };

  const placeholder = replyToAuthor
    ? `${t('thread.replyTo', { floor: replyToFloor ?? 0 })} @${replyToAuthor}`
    : t('thread.replyPlaceholder');

  // 未 dock 时 fixed 贴底。底栏在 <lg 或触控预览下可见(见 index.css .mobile-tabs-*),
  // 必须抬高,否则「发布回复」会落在底栏之下;lg 与桌面 pointer 下底栏隐藏 → bottom-0。
  const shellClass = docked
    ? 'relative w-full pt-4 pb-20 lg:pb-6'
    : 'fixed left-0 right-0 z-[90] px-6 pt-2 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-0 pb-3 lg:pb-4';

  if (!isLoggedIn) {
    return (
      <div ref={shellRef} className={shellClass}>
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

  if (!expanded) {
    return (
      <div ref={shellRef} className={shellClass}>
        <div className="max-w-[640px] mx-auto space-y-2">
          {!emailVerified && (
            <FormAlert tone="info">{t('compose.needEmailVerify')}</FormAlert>
          )}
          <button
            type="button"
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

  const displayError = localError || error;

  return (
    <div
      ref={shellRef}
      className={
        docked
          ? 'relative w-full pt-4 pb-20 lg:pb-6'
          : 'fixed left-0 right-0 z-[90] px-6 pt-2 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-0 pb-3 lg:pb-6'
      }
    >
      <div className="max-w-[640px] mx-auto">
        <div className="bg-background-50 border border-background-200/70 rounded-md overflow-hidden">
          {replyToAuthor && (
            <div className="flex items-center justify-between px-4 py-2 bg-background-100/70 border-b border-background-200/40">
              <span className="text-[12px] text-foreground-500">
                {t('thread.replyTo', { floor: replyToFloor ?? 0 })}{' '}
                <span className="font-medium text-foreground-700">@{replyToAuthor}</span>
              </span>
              <button
                type="button"
                onClick={handleCancel}
                className="text-foreground-400 hover:text-foreground-600 transition-colors duration-200 cursor-pointer bg-transparent border-none"
              >
                <i className="ri-close-line text-[15px]"></i>
              </button>
            </div>
          )}

          <div className="p-4">
            {!emailVerified && (
              <FormAlert tone="info" className="mb-3">
                {t('compose.needEmailVerify')}
              </FormAlert>
            )}
            <RichTextarea
              value={text}
              onChange={(v) => {
                setText(v);
                if (localError) setLocalError(undefined);
              }}
              placeholder={placeholder}
              rows={4}
              minHeight="120px"
              className="border-none bg-transparent"
              toolbarClassName="border-none px-0 pt-0"
            />

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-background-200/40">
              <button
                type="button"
                onClick={handleCancel}
                className="inline-flex items-center px-3 py-1.5 text-[13px] text-foreground-500 hover:text-foreground-700 transition-colors duration-200 cursor-pointer whitespace-nowrap bg-transparent border-none"
              >
                {t('thread.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={sending}
                className={`inline-flex items-center px-4 py-1.5 text-[13px] font-medium bg-primary-500 text-background-50 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 rounded-xs whitespace-nowrap cursor-pointer ${
                  !text.trim() && !sending ? 'opacity-70' : ''
                }`}
              >
                {sending ? t('thread.sending') : t('thread.sendReply')}
              </button>
            </div>

            {displayError && <FormAlert className="mt-2">{displayError}</FormAlert>}
          </div>
        </div>
      </div>
    </div>
  );
}
