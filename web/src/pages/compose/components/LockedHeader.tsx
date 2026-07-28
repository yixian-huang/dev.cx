import { useTranslation } from 'react-i18next';

export type LockedKind = 'feedback' | 'build' | 'show';

// 锁定入口的文案按来源分流(C3:此前只有 feedback 一种文案,发布进展/分享成果入口
// 复用它会驴唇不对马嘴):feedback=项目页「提交反馈」,build=「写进度」,show=「分享成果」。
const COPY: Record<LockedKind, { title: string; deck: string }> = {
  feedback: { title: 'project.feedback.lockedTitle', deck: 'project.feedback.lockedDeck' },
  build: { title: 'compose.lockedBuildTitle', deck: 'compose.lockedBuildDeck' },
  show: { title: 'compose.lockedShowTitle', deck: 'compose.lockedShowDeck' },
};

interface LockedHeaderProps {
  kind: LockedKind;
  projectName: string;
}

export default function LockedHeader({ kind, projectName }: LockedHeaderProps) {
  const { t } = useTranslation();
  const copy = COPY[kind];

  return (
    <div className="pt-6">
      <div className="px-5 py-4 bg-background-100 rounded-xs">
        <span className="block text-[15px] font-medium text-foreground-950">{t(copy.title)}</span>
        <span className="block text-[12px] text-foreground-400 mt-0.5">
          {t(copy.deck, { project: projectName })}
        </span>
      </div>
    </div>
  );
}
