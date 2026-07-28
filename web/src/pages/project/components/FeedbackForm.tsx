import { useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import FormAlert from '@/components/base/FormAlert';

interface Props {
  open: boolean;
  submitting: boolean;
  error?: string;
  onSubmit: (title: string, bodyMd: string) => void;
  onCancel: () => void;
}

// 项目页「发布反馈」弹层——点提交必有反馈,不静默 disabled。
export default function FeedbackForm({ open, submitting, error, onSubmit, onCancel }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const emailVerified = user?.emailVerified !== false;
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [localError, setLocalError] = useState<string | undefined>(undefined);

  if (!open) return null;

  const handleBackdrop = (e: MouseEvent) => {
    if (e.target === e.currentTarget) onCancel();
  };

  const handleSubmit = () => {
    if (submitting) return;
    setLocalError(undefined);
    if (!emailVerified) {
      setLocalError(t('compose.needEmailVerify'));
      return;
    }
    if (!title.trim()) {
      setLocalError(t('project.feedback.needTitle'));
      return;
    }
    if (!body.trim()) {
      setLocalError(t('project.feedback.needBody'));
      return;
    }
    onSubmit(title.trim(), body.trim());
  };

  const displayError = localError || error;

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
            type="button"
            onClick={onCancel}
            className="w-7 h-7 flex items-center justify-center text-foreground-400 hover:text-foreground-700 transition-colors duration-200 cursor-pointer bg-transparent border-none"
          >
            <i className="ri-close-line w-4 h-4 flex items-center justify-center"></i>
          </button>
        </div>

        {!emailVerified && (
          <FormAlert tone="info" className="mb-3">
            {t('compose.needEmailVerify')}
          </FormAlert>
        )}

        <div className="space-y-3 mb-2">
          <div>
            <label className="text-[11px] text-foreground-400 tracking-wider uppercase font-medium block mb-1">
              {t('project.feedback.titleLabel')} *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (localError) setLocalError(undefined);
              }}
              placeholder={t('project.feedback.titlePlaceholder')}
              className="w-full text-[14px] text-foreground-900 bg-background-50 px-3 py-2 rounded-xs outline-none border border-background-200/50 focus:border-primary-300 transition-colors"
            />
          </div>
          <div>
            <label className="text-[11px] text-foreground-400 tracking-wider uppercase font-medium block mb-1">
              {t('project.feedback.descriptionLabel')} *
            </label>
            <textarea
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                if (localError) setLocalError(undefined);
              }}
              rows={5}
              placeholder={t('project.feedback.descriptionPlaceholder')}
              className="w-full text-[14px] text-foreground-900 bg-background-50 px-3 py-2 rounded-xs outline-none border border-background-200/50 focus:border-primary-300 transition-colors resize-none"
            />
          </div>
        </div>

        {displayError && <FormAlert className="mt-2">{displayError}</FormAlert>}

        <div className="flex items-center justify-end gap-3 mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-body-sm text-foreground-600 hover:text-foreground-900 transition-colors duration-200 whitespace-nowrap cursor-pointer bg-transparent border-none"
          >
            {t('project.feedback.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 text-body-sm bg-primary-500 text-background-50 rounded-md hover:bg-primary-600 transition-colors duration-200 whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? t('project.feedback.submitting') : t('project.feedback.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
