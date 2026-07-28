import { Link } from 'react-router-dom';

// Quiet 行的 mono stage 字标配色(画布 1b/2c:WIP=accent-800、SHIPPED=primary-700、
// IDEA=fg-500;paused 顺同一逻辑落最弱的 fg-400)。
const QUIET_STAGE_COLOR: Record<string, string> = {
  wip: 'text-accent-800',
  shipped: 'text-primary-700',
  idea: 'text-foreground-500',
  paused: 'text-foreground-400',
};

interface QuietProjectRowProps {
  id: string;
  title: string;
  stage: string;
  time: string;
  /** 热门序号(02…);首页 Focus Quiet 行可选,Works 页可省略。 */
  index?: number;
}

/** Quiet 产品行(画布 1b Focus / 2c Works 共用):serif 16px 标题 + dot leaders +
 *  mono 大写 stage 字标 + 右对齐时间;行自带 border-t,容器给最后一行补 border-b。 */
export default function QuietProjectRow({ id, title, stage, time, index }: QuietProjectRowProps) {
  return (
    <Link
      to={`/p/${id}`}
      className="ink-row group flex items-baseline py-[14px] -mx-2 px-2 border-t border-foreground-200/30 rounded-xs"
    >
      {typeof index === 'number' && (
        <span
          className="shrink-0 w-7 font-mono text-[11px] font-medium tracking-[0.06em] text-foreground-300 group-hover:text-accent-500/80 transition-colors duration-200"
          aria-hidden
        >
          {String(index).padStart(2, '0')}
        </span>
      )}
      <span className="font-heading text-base font-medium text-foreground-900 group-hover:text-primary-500 transition-colors duration-200 truncate">
        {title}
      </span>
      <span className="dot-leaders" />
      <span
        className={`shrink-0 font-mono text-[10px] font-medium tracking-[0.12em] uppercase mr-3.5 ${
          QUIET_STAGE_COLOR[stage.toLowerCase()] ?? 'text-foreground-500'
        }`}
      >
        {stage}
      </span>
      <span className="shrink-0 text-xs text-foreground-400 w-[56px] text-right tabular-nums">{time}</span>
    </Link>
  );
}
