import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import RichTextarea from '@/components/base/RichTextarea';

export type QuickStageKey = 'idea' | 'wip' | 'shipped' | 'paused';

export interface QuickProjectEntry {
  name: string;
  deck: string;
  stage: QuickStageKey;
  // 链接带 label——API 对 links 的 label/url 都要求非空(bad_link),快速创建也得给
  // label 输入,不能只收 URL 再塞空 label(C3 parked 修复)。
  link: { label: string; url: string };
}

interface Props {
  onCreated: (entry: QuickProjectEntry) => void;
  onCancel: () => void;
  // 创建请求进行中/失败态由父组件(compose/page.tsx)驱动——它才知道真实的 API 调用结果。
  // 失败时表单不清空、不折叠(C2 评审 Finding I5,写路径约定同 new-project/page.tsx)。
  creating?: boolean;
  error?: string;
}

// 阶段文案与发布页/设置页同一套 key(project.stage*),不再单独维护 compose.* 一份。
const stageOptions: { key: QuickStageKey; labelKey: string }[] = [
  { key: 'idea', labelKey: 'project.stageIdea' },
  { key: 'wip', labelKey: 'project.stageWIP' },
  { key: 'shipped', labelKey: 'project.stageShipped' },
  { key: 'paused', labelKey: 'project.stagePaused' },
];

export default function QuickProjectForm({ onCreated, onCancel, creating = false, error }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [deck, setDeck] = useState('');
  const [stage, setStage] = useState<QuickStageKey>('wip');
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  const [localError, setLocalError] = useState<string | undefined>(undefined);
  const canCreate = name.trim().length > 0;

  const handleCreate = () => {
    if (creating) return;
    if (!name.trim()) {
      setLocalError(t('project.err.nameRequired'));
      return;
    }
    setLocalError(undefined);
    onCreated({
      name: name.trim(),
      deck: deck.trim(),
      stage,
      link: { label: linkLabel.trim(), url: linkUrl.trim() },
    });
  };

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="pb-5">
        <p className="text-label text-foreground-400 tracking-[0.15em] uppercase">
          {t('me.quickProject', '快速创建项目')}
        </p>
        <p className="text-[13px] text-foreground-400 mt-1">
          {t('me.quickProjectDeck', '只需填项目名即可创建，剩余信息稍后再补')}
        </p>
      </div>

      <div className="space-y-5">
        {/* Name */}
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (localError) setLocalError(undefined);
          }}
          placeholder={t('onboarding.projectNamePlaceholder')}
          className="w-full font-heading text-heading-lg text-foreground-950 bg-background-100 placeholder:text-foreground-300 px-3 py-2.5 rounded-xs outline-none transition-colors duration-200"
        />

        {/* Deck */}
        <RichTextarea
          value={deck}
          onChange={setDeck}
          placeholder={t('onboarding.projectDeckPlaceholder')}
          rows={2}
          minHeight="72px"
        />

        {/* Stage + Link row */}
        <div className="flex items-start gap-6">
          {/* Stage */}
          <div className="flex-1 space-y-2">
            <p className="text-label text-foreground-500">{t('onboarding.projectStage')}</p>
            <div className="flex items-stretch gap-0">
              {stageOptions.map((opt) => {
                const isActive = stage === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setStage(opt.key)}
                    className={`flex-1 text-center px-3 py-1.5 text-sm transition-colors duration-200 rounded-xs whitespace-nowrap cursor-pointer ${
                      isActive
                        ? 'bg-background-100 text-foreground-950 font-medium'
                        : 'text-foreground-500 hover:text-foreground-800 hover:bg-background-100'
                    }`}
                  >
                    {t(opt.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Link:名称 + 地址两栏(同 new-project 链接行约定,label 缺失的链接不会被提交) */}
          <div className="flex-1 space-y-2">
            <p className="text-label text-foreground-500">{t('onboarding.projectLink')}</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
                placeholder={t('compose.linkLabelShort')}
                className="w-[35%] text-body-sm text-foreground-900 bg-background-100 placeholder:text-foreground-300 px-3 py-2 rounded-xs outline-none transition-colors duration-200"
              />
              <input
                type="text"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder={t('onboarding.projectLinkPlaceholder')}
                className="flex-1 text-body-sm text-foreground-900 bg-background-100 placeholder:text-foreground-300 px-3 py-2 rounded-xs outline-none transition-colors duration-200"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-6">
        {(error || localError) && (
          <span role="alert" className="text-[13px] font-medium text-primary-700 mr-auto">
            {localError || error}
          </span>
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={creating}
          className="px-4 py-2 text-sm text-foreground-500 hover:text-foreground-800 transition-colors duration-200 whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-transparent border-none"
        >
          {t('compose.cancel')}
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className={`inline-flex items-center gap-2 px-5 py-2 text-sm font-medium bg-primary-500 text-background-50 hover:bg-primary-600 transition-colors duration-200 rounded-xs whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
            !canCreate && !creating ? 'opacity-70' : ''
          }`}
        >
          {creating ? (
            <>
              <i className="ri-loader-4-line animate-spin text-[14px]"></i>
              {t('newProject.creating', '创建中...')}
            </>
          ) : (
            <>
              <i className="ri-add-line text-[14px]"></i>
              {t('me.quickProjectCreate', '创建项目')}
            </>
          )}
        </button>
      </div>
    </div>
  );
}