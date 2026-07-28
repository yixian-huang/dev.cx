import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import TypeLabel from '@/components/base/TypeLabel';
import type { BaseThread } from '@/lib/adapters/types';

interface ThreadHeaderProps {
  thread: BaseThread;
}

// 画布 6a:类型行扩展为 `SHOW · 产品名 · 演示 ↗ · 仓库 ↗`——原 ProductReference 的
// pill 链接并入此行(该组件已废弃);头像方形 2px。
export default function ThreadHeader({ thread }: ThreadHeaderProps) {
  const { t } = useTranslation();
  const hasProject = 'project' in thread && thread.project;
  const links = 'links' in thread && thread.links ? thread.links : [];

  return (
    <header className="pt-7 pb-5">
      {/* 类型 + 产品 + 外链 — mono 一行 */}
      <div className="flex items-center gap-2.5 mb-3 flex-wrap font-mono text-[12px]">
        <TypeLabel type={thread.type} className="!text-[11px] font-medium tracking-[0.15em] shrink-0" />
        {hasProject && (
          <>
            <span className="text-foreground-300">·</span>
            <Link
              to={`/p/${thread.project!.slug}`}
              className="text-foreground-600 hover:text-primary-500 transition-colors duration-200 truncate max-w-[240px]"
            >
              {thread.project!.name}
            </Link>
          </>
        )}
        {links.map((link) => (
          <span key={`${link.label}-${link.url}`} className="flex items-center gap-2.5">
            <span className="text-foreground-300">·</span>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground-600 hover:text-primary-500 transition-colors duration-200 whitespace-nowrap"
            >
              {link.label} ↗
            </a>
          </span>
        ))}
      </div>

      {/* 标题 */}
      <h1 className="font-heading text-display-lg font-semibold text-foreground-950 leading-tight mb-3">
        {thread.title}
      </h1>

      {/* 作者行:方形头像 + 名字 + mono @handle + 时间 + 已编辑 + 编辑 */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <Link to={`/@${thread.author.handle}`} className="shrink-0">
          <img
            src={thread.author.avatar}
            alt={thread.author.name}
            className="w-6 h-6 rounded-xs object-cover bg-background-100"
          />
        </Link>
        <div className="flex items-center gap-2 text-[13px] text-foreground-500 flex-wrap">
          <Link
            to={`/@${thread.author.handle}`}
            className="font-medium text-foreground-800 hover:text-primary-500 transition-colors duration-200"
          >
            {thread.author.name}
          </Link>
          <span className="font-mono text-foreground-400">@{thread.author.handle}</span>
          <span className="text-foreground-300">·</span>
          <span>{thread.formattedTime}</span>
          {thread.edited && (
            <>
              <span className="text-foreground-300">·</span>
              <span className="text-foreground-400">{t('thread.edited')}</span>
            </>
          )}
          {thread.canEdit && (
            <>
              <span className="text-foreground-300">·</span>
              <Link
                to={`/compose?edit=${encodeURIComponent(thread.id)}`}
                className="text-primary-600 hover:text-primary-700 transition-colors duration-200"
              >
                {t('thread.edit')}
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="mt-5 border-t border-foreground-200/30"></div>
    </header>
  );
}
