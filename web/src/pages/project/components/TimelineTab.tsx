import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TimelineEntry } from '@/lib/adapters/types';
import TypeLabel from '@/components/base/TypeLabel';
import EmptyState from '@/components/base/EmptyState';

interface Props {
  entries: TimelineEntry[];
}

// 画布 2b:近期条目放 bg-100 整段色带(非卡片),更早的条目回到纸面;
// 日期列 mono 52px(月.日 / 年两行),行内 = mono 类型字标 + serif 16px 标题 + 摘录。
export default function TimelineTab({ entries }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const recentEntries = entries.filter((e) => e.isRecent);
  const olderEntries = entries.filter((e) => !e.isRecent);

  // 两段都空时给空态,不渲染 0 高度(默认 tab,空产品第一屏不能是一片虚空)
  if (entries.length === 0) {
    return <EmptyState message={t('project.timelineEmpty')} hint={t('project.timelineEmptyHint')} />;
  }

  return (
    <>
      {recentEntries.length > 0 && (
        <section className="chapter-band -mx-6 px-6 py-3.5">
          <div className="flex flex-col">
            {recentEntries.map((entry, i) => (
              <TimelineRow
                key={entry.id}
                entry={entry}
                divider={i > 0}
                onClick={() => navigate(`/t/${entry.id}`)}
              />
            ))}
          </div>
        </section>
      )}

      {olderEntries.length > 0 && (
        <section className="py-2.5">
          <div className="flex flex-col">
            {olderEntries.map((entry, i) => (
              <TimelineRow
                key={entry.id}
                entry={entry}
                divider={i > 0}
                onClick={() => navigate(`/t/${entry.id}`)}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function TimelineRow({
  entry,
  divider,
  onClick,
}: {
  entry: TimelineEntry;
  divider: boolean;
  onClick: () => void;
}) {
  const monthDay = entry.date.slice(5).replace('-', '.');
  const year = entry.date.slice(0, 4);

  return (
    <article
      className={`group flex gap-[18px] py-4 cursor-pointer ${divider ? 'border-t border-foreground-200/30' : ''}`}
      onClick={onClick}
    >
      {/* 日期列 */}
      <div className="shrink-0 w-[52px]">
        <span className="font-mono text-[13px] text-foreground-500 block">{monthDay}</span>
        <span className="font-mono text-[10px] text-foreground-400 block">{year}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5 mb-1">
          <TypeLabel type={entry.type} className="!text-[10px] font-medium tracking-[0.14em]" />
          <h3 className="font-heading text-base leading-[1.5] font-medium text-foreground-950 group-hover:text-primary-500 transition-colors duration-200">
            {entry.title}
          </h3>
        </div>
        {entry.excerpt && (
          <p className="text-[13px] leading-[1.7] text-foreground-700">{entry.excerpt}</p>
        )}
      </div>
    </article>
  );
}
