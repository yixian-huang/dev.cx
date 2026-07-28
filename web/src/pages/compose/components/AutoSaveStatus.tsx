import { useTranslation } from 'react-i18next';

interface AutoSaveStatusProps {
  lastSaved: Date | null;
}

export default function AutoSaveStatus({ lastSaved }: AutoSaveStatusProps) {
  const { t, i18n } = useTranslation();
  if (!lastSaved) return null;

  const timeStr = lastSaved.toLocaleTimeString(i18n.language === 'zh' ? 'zh-CN' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <span className="text-[12px] text-foreground-400 flex items-center gap-1.5">
      <i className="ri-time-line text-[11px]"></i>
      {t('compose.autoSaved', { time: timeStr })}
    </span>
  );
}