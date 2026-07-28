import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import StageBadge from '@/components/base/StageBadge';
import type { LatestThread, StageKey } from '@/lib/adapters/types';

interface ProjectListItemProps {
  index: number;
  id: string;
  displayTitle: string;
  authorHandle: string;
  stage: StageKey;
  updatedAt: string;
  /** 热门排序态:mono 编号转 accent 色(画布 3a)。 */
  trending?: boolean;
  /** B2:近 7 天回复热度(reply_count_7d);>0 时右列显示「n 回复 · 时间」。 */
  replyCount?: number;
  deck?: string;
  latestThread?: LatestThread;
  showDeck?: boolean;
}

// 杂志目录行(画布 3a):mono 双位编号列 + serif 17px 标题 + dot leaders + mono 右列,
// 最新讨论用 ↳ 缩进(左侧 accent 色条是自家反模式,已废弃)。
export default function ProjectListItem({
  index,
  id,
  displayTitle,
  authorHandle,
  stage,
  updatedAt,
  trending = false,
  replyCount = 0,
  deck,
  latestThread,
  showDeck = false,
}: ProjectListItemProps) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-4 py-[22px] border-b border-background-100 last:border-b-0">
      <span
        className={`shrink-0 w-[34px] text-right font-mono text-sm ${
          trending ? 'text-accent-500' : 'text-foreground-300'
        }`}
      >
        {String(index + 1).padStart(2, '0')}
      </span>

      <div className="flex-1 min-w-0">
        {/* 标题行:serif 标题 + dot leaders + mono 右列(B2:n 回复 = 近 7 天热度)。 */}
        <div className="flex items-baseline min-w-0">
          <Link to={`/p/${id}`} className="min-w-0 truncate font-heading text-[17px] leading-[1.5] font-medium text-foreground-950 hover:text-primary-500 transition-colors duration-200">
            {displayTitle}
          </Link>
          <span className="dot-leaders" />
          <span className="shrink-0 font-mono text-xs text-foreground-500">
            {replyCount > 0 ? `${replyCount} ${t('postList.replies')} · ${updatedAt}` : updatedAt}
          </span>
        </div>

        {/* 署名行 */}
        <div className="flex items-center gap-2.5 mt-1.5 text-xs">
          <Link
            to={`/@${authorHandle}`}
            className="font-mono text-foreground-500 hover:text-primary-500 transition-colors duration-200"
          >
            @{authorHandle}
          </Link>
          <StageBadge stage={stage} className="!text-[10px] !px-[7px] !py-[1px]" />
        </div>

        {showDeck && deck && (
          <p className="text-[13px] text-foreground-600 mt-2 line-clamp-2 leading-relaxed">{deck}</p>
        )}

        {/* 最新讨论 ↳ 行 */}
        {latestThread && (
          <Link to={`/t/${latestThread.id}`} className="block mt-2 text-[13px] text-foreground-500 hover:text-primary-500 transition-colors duration-200 truncate">
            <span className="font-mono text-foreground-400">↳</span> {latestThread.title}
          </Link>
        )}
      </div>
    </div>
  );
}
