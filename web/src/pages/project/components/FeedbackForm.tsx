import { useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  submitting: boolean;
  error?: string;
  onSubmit: (title: string, bodyMd: string) => void;
  onCancel: () => void;
}

// 项目页「发布反馈」的极简提交表单——project.feedback.submitTitle/titleLabel/descriptionLabel
// 等文案键在两套 locale 里早就存在但此前从未被消费,说明这个表单本就该存在,只是没接上。
// 外观照抄同目录 MergeModal 的弹层壳(遮罩层 + 居中卡片 + 关闭按钮),不新造一套视觉语言。
export default function FeedbackForm({ open, submitting, error, onSubmit, onCancel }: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  if (!open) return null;

  const canSubmit = title.trim().length > 0 && body.trim().length > 0 && !submitting;

  const handleBackdrop = (e: MouseEvent) => {
    if (e.target === e.currentTarget) onCancel();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={handleBackdrop}
    >
      <div className="bg-background-50 w-full max-w-[480px] mx-4 p-6 rounded-md shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-heading text-heading-sm text-foreground-950">
            {t('project.feedback.submitTitle')}
          </h3>
          <button
            onClick={onCancel}
            className="w-7 h-7 flex items-center justify-center text-foreground-400 hover:text-foreground-700 transition-colors duration-200 cursor-pointer"
          >
            <i className="ri-close-line w-4 h-4 flex items-center justify-center"></i>
          </button>
        </div>

        <div className="space-y-3 mb-2">
          <div>
            <label className="text-[11px] text-foreground-400 tracking-wider uppercase font-medium block mb-1">
              {t('project.feedback.titleLabel')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('project.feedback.titlePlaceholder')}
              className="w-full text-[14px] text-foreground-900 bg-background-50 px-3 py-2 rounded-xs outline-none border border-background-200/50 focus:border-primary-300 transition-colors"
            />
          </div>
          <div>
            <label className="text-[11px] text-foreground-400 tracking-wider uppercase font-medium block mb-1">
              {t('project.feedback.descriptionLabel')}
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder={t('project.feedback.descriptionPlaceholder')}
              className="w-full text-[14px] text-foreground-900 bg-background-50 px-3 py-2 rounded-xs outline-none border border-background-200/50 focus:border-primary-300 transition-colors resize-none"
            />
          </div>
        </div>

        {/* 内联错误行——spec §3 约定:非 401 写失败就地展示,不用 toast */}
        {error && <p className="text-[13px] text-primary-700 mt-2">{error}</p>}

        <div className="flex items-center justify-end gap-3 mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-body-sm text-foreground-600 hover:text-foreground-900 transition-colors duration-200 whitespace-nowrap cursor-pointer"
          >
            {t('project.feedback.cancel')}
          </button>
          <button
            type="button"
            onClick={() => canSubmit && onSubmit(title.trim(), body.trim())}
            disabled={!canSubmit}
            className="px-4 py-2 text-body-sm bg-primary-500 text-background-50 rounded-md hover:bg-primary-600 transition-colors duration-200 whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? t('project.feedback.submitting') : t('project.feedback.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
