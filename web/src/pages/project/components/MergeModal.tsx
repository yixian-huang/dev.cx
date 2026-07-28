import { useState, useEffect, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { DiscussEntry } from '@/lib/adapters/types';

interface Props {
  open: boolean;
  candidates: DiscussEntry[];
  onConfirm: (survivorId: string) => void;
  onCancel: () => void;
  error?: string;
}

export default function MergeModal({ open, candidates, onConfirm, onCancel, error }: Props) {
  const { t } = useTranslation();

  const defaultPick = candidates.length >= 2
    ? [...candidates].sort((a, b) => b.replies - a.replies)[0].id
    : '';
  const [picked, setPicked] = useState(defaultPick);

  useEffect(() => {
    if (candidates.length >= 2) {
      setPicked([...candidates].sort((a, b) => b.replies - a.replies)[0].id);
    }
  }, [candidates]);

  if (!open || candidates.length < 2) return null;

  const handleBackdrop = (e: MouseEvent) => {
    if (e.target === e.currentTarget) onCancel();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={handleBackdrop}
    >
      <div className="bg-background-50 w-full max-w-[520px] mx-4 p-6 rounded-md shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 flex items-center justify-center text-secondary-500">
              <i className="ri-git-merge-line text-[16px]"></i>
            </div>
            <h3 className="font-heading text-heading-sm text-foreground-950">
              {t('project.feedback.mergeTitle')}
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="w-7 h-7 flex items-center justify-center text-foreground-400 hover:text-foreground-700 transition-colors duration-200 cursor-pointer"
          >
            <i className="ri-close-line w-4 h-4 flex items-center justify-center"></i>
          </button>
        </div>

        <p className="text-body-sm text-foreground-600 mb-5">
          {t('project.feedback.mergeDescription')}
        </p>

        <div className="border border-background-200/50 rounded-md divide-y divide-background-200/40 overflow-hidden mb-6">
          {candidates.map((c) => (
            <label
              key={c.id}
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors duration-200 ${
                picked === c.id
                  ? 'bg-secondary-50'
                  : 'hover:bg-background-100/50'
              }`}
            >
              <input
                type="radio"
                name="mergeSurvivor"
                checked={picked === c.id}
                onChange={() => setPicked(c.id)}
                className="w-3.5 h-3.5 accent-secondary-500 cursor-pointer shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-body-sm text-foreground-900 truncate leading-snug">{c.title}</p>
                <p className="text-body-xs text-foreground-500 mt-0.5">
                  {c.author} · {c.replies} {t('discussion.replies')}
                </p>
              </div>
              {picked === c.id && (
                <span className="shrink-0 text-[11px] font-medium text-secondary-600 bg-secondary-50 px-2 py-0.5 rounded-xs">
                  {t('project.feedback.mergeConfirm')}
                </span>
              )}
            </label>
          ))}
        </div>

        {/* 内联错误行——spec §3 约定:非 401 写失败就地展示,不用 toast */}
        {error && <p className="text-[13px] text-primary-700 mb-3">{error}</p>}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-body-sm text-foreground-600 hover:text-foreground-900 transition-colors duration-200 whitespace-nowrap cursor-pointer"
          >
            {t('project.feedback.cancel')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(picked)}
            className="px-4 py-2 text-body-sm bg-secondary-500 text-background-50 rounded-md hover:bg-secondary-600 transition-colors duration-200 whitespace-nowrap cursor-pointer"
          >
            {t('project.feedback.mergeConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}