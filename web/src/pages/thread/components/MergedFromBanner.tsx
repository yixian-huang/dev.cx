import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { BaseThread } from '@/lib/adapters/types';

interface Props {
  mergeInfo: NonNullable<BaseThread['mergeInfo']>;
}

// 画布 6a:可收起 MERGED 框——头行 mono `MERGED` + 「合并了 n 条相关讨论 · @操作者 · 时间」,
// 展开后每条 ↳ 缩进 + 原作者 mono 署名。默认收起。
export default function MergedFromBanner({ mergeInfo }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const mergedFrom = mergeInfo.mergedFrom;
  if (!mergedFrom || mergedFrom.length === 0) return null;

  return (
    <div className="mb-6 bg-background-100 rounded-xs">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left cursor-pointer bg-transparent border-none"
      >
        <span className="font-mono text-[10px] font-medium tracking-[0.14em] text-secondary-600">MERGED</span>
        <span className="text-[13px] text-foreground-700">
          {t('thread.mergedFromBanner', { count: mergedFrom.length })}
        </span>
        {(mergeInfo.mergedBy || mergeInfo.mergedAt) && (
          <span className="text-[12px] text-foreground-400">
            {mergeInfo.mergedBy && <>· <span className="font-mono">{mergeInfo.mergedBy}</span> </>}
            {mergeInfo.mergedAt && <>· {mergeInfo.mergedAt}</>}
          </span>
        )}
        <span className="ml-auto text-foreground-400 text-[13px]">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-3 flex flex-col gap-1.5">
          {mergedFrom.map((m) => (
            <Link
              key={m.id}
              to={`/t/${m.id}`}
              className="flex items-baseline gap-2 min-w-0 text-[13px] text-foreground-700 hover:text-primary-500 transition-colors duration-200"
            >
              <span className="font-mono text-foreground-400 shrink-0">↳</span>
              <span className="truncate min-w-0 flex-1">{m.title}</span>
              <span className="shrink-0 font-mono text-[12px] text-foreground-400">{m.author}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
