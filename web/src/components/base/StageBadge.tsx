import { useTranslation } from 'react-i18next';
import { STAGE_LABEL_KEY } from '@/lib/project-form';
import type { StageKey } from '@/lib/adapters/types';

// 阶段样式表只登记小写 StageKey;入参先归一小写再查表,任何历史大小写都不落 fallback。
const stageStyles: Record<string, string> = {
  idea: 'bg-secondary-100 text-secondary-800',
  wip: 'bg-accent-100 text-accent-800',
  shipped: 'bg-primary-100 text-primary-700',
  paused: 'bg-background-200 text-foreground-400',
};

interface StageBadgeProps {
  stage: string;
  className?: string;
}

// 阶段词是普通词汇不是外来语字标(与 SHOW/ASK 的 TypeLabel 不同),标签走 i18n
// (project.stage*,与表单/探索页筛选同一套键);未知值回落首字母大写原样,不编造。
export default function StageBadge({ stage, className = '' }: StageBadgeProps) {
  const { t } = useTranslation();
  const normalized = stage.toLowerCase();
  const style = stageStyles[normalized] || 'bg-secondary-50 text-secondary-700';
  const labelKey = STAGE_LABEL_KEY[normalized as StageKey];
  const label = labelKey ? t(labelKey) : normalized.charAt(0).toUpperCase() + normalized.slice(1);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium tracking-wide rounded-xs whitespace-nowrap ${style} ${className}`}>
      {label}
    </span>
  );
}
