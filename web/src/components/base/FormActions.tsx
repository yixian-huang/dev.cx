import { type ReactNode } from 'react';

interface FormActionsProps {
  onPublish: () => void;
  canPublish: boolean;
  publishLabel: string;
  onSaveDraft?: () => void;
  saveDraftLabel?: string;
  extraActions?: ReactNode;
  className?: string;
}

export default function FormActions({
  onPublish,
  canPublish,
  publishLabel,
  onSaveDraft,
  saveDraftLabel,
  extraActions,
  className = '',
}: FormActionsProps) {
  return (
    <div className={`pt-6 pb-8 flex items-center gap-3 ${className}`}>
      {extraActions}
      {onSaveDraft && saveDraftLabel && (
        <button
          onClick={onSaveDraft}
          className="inline-flex items-center px-4 py-2 text-sm text-foreground-500 hover:text-foreground-800 transition-colors duration-200 whitespace-nowrap cursor-pointer"
        >
          {saveDraftLabel}
        </button>
      )}
      <button
        onClick={onPublish}
        disabled={!canPublish}
        className="inline-flex items-center px-5 py-2 text-sm font-medium bg-primary-500 text-background-50 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 rounded-xs whitespace-nowrap cursor-pointer"
      >
        {publishLabel}
      </button>
    </div>
  );
}