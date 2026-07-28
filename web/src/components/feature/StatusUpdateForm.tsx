import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import RichTextarea from '@/components/base/RichTextarea';

interface Props {
  initialValue: string;
  onSubmit: (value: string) => void;
  onCancel?: () => void;
  submitting?: boolean;
}

// 三框合一(做了/卡点/下步 → 单框):API 只有一个 weekly_status 文本字段,提交时三段本来
// 就被合并成纯文本——三分栏是表单强加的仪式感,让「更新状态」看起来像交周报。placeholder
// 保留三段提示,想按那个结构写的人照写,不想的人一句话也行。
export default function StatusUpdateForm({
  initialValue,
  onSubmit,
  onCancel,
  submitting = false,
}: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const showActions = !!onCancel;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="w-5 h-5 flex items-center justify-center rounded-md bg-primary-100 text-primary-600">
            <i className="ri-pulse-line text-[13px]"></i>
          </span>
          <span className="text-[13px] text-foreground-500">
            {t('me.status.fieldLabel')}
          </span>
        </div>
        <RichTextarea
          value={value}
          onChange={setValue}
          placeholder={t('me.status.placeholder')}
          rows={5}
          minHeight="150px"
        />
      </div>

      {/* Actions — only shown in standalone mode (when onCancel is provided) */}
      {showActions && (
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 text-sm text-foreground-500 hover:text-foreground-800 transition-colors duration-200 whitespace-nowrap cursor-pointer disabled:opacity-40"
          >
            {t('compose.cancel')}
          </button>
          <button
            onClick={() => onSubmit(value)}
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium bg-primary-500 text-background-50 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 rounded-xs whitespace-nowrap cursor-pointer"
          >
            {submitting ? (
              <>
                <i className="ri-loader-4-line animate-spin text-[14px]"></i>
                {t('me.status.saving', '保存中...')}
              </>
            ) : (
              <>
                <i className="ri-check-line text-[14px]"></i>
                {t('me.status.save', '更新状态')}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
