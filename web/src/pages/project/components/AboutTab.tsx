import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { UIProject } from '@/lib/adapters/types';
import Markdown from '@/components/base/Markdown';
import { isTechTag } from '@/lib/project-form';

interface Props {
  project: UIProject;
}

export default function AboutTab({ project }: Props) {
  const { t } = useTranslation();

  return (
    <section className="py-6 space-y-6">
      {/* Description */}
      <div className="bg-background-100/50 rounded-lg p-5 -mx-2">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-6 h-6 flex items-center justify-center rounded-xs bg-primary-100 text-primary-600">
            <i className="ri-file-text-line text-[13px]"></i>
          </span>
          <span className="text-[12px] font-medium text-foreground-500 tracking-wide">{t('project.about')}</span>
        </div>
        {/* description_md 在设置页用 MarkdownEditor 编辑——这里必须真渲染,不能整段塞 <p>。
            为空时给空态文案(owner 附补写入口),不留只有标题的空壳卡片 */}
        {project.description.trim() ? (
          <div className="text-[15px] text-foreground-800 leading-relaxed">
            <Markdown>{project.description}</Markdown>
          </div>
        ) : (
          <p className="text-[13px] text-foreground-400">
            {t('project.noDescription')}
            {project.isOwner && (
              <Link
                to={`/p/${project.id}/settings`}
                className="ml-2 text-primary-500 hover:text-primary-700 transition-colors duration-150"
              >
                {t('project.writeDescription')}
              </Link>
            )}
          </p>
        )}
      </div>

      {/* Tags——为空则整块不渲染,不留光杆标题 */}
      {project.tags.length > 0 && (
        <div className="-mx-2 px-2">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 flex items-center justify-center rounded-xs bg-secondary-100 text-secondary-600">
              <i className="ri-price-tag-3-line text-[13px]"></i>
            </span>
            <span className="text-[12px] font-medium text-foreground-500 tracking-wide">{t('project.tags')}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {project.tags.map((tag) => (
              <span
                key={tag}
                className={`inline-flex items-center px-2.5 py-1 text-[12px] bg-background-100 text-foreground-700 rounded-xs hover:bg-background-200 transition-colors duration-200 ${
                  isTechTag(tag) ? 'font-mono' : ''
                }`}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Author */}
      <div className="bg-background-100/50 rounded-lg p-5 -mx-2">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-6 h-6 flex items-center justify-center rounded-xs bg-accent-100 text-accent-600">
            <i className="ri-user-line text-[13px]"></i>
          </span>
          <span className="text-[12px] font-medium text-foreground-500 tracking-wide">{t('project.createdBy')}</span>
        </div>
        <Link
          to={`/@${project.author.handle}`}
          className="inline-flex items-center gap-2.5 group"
        >
          {/* 无头像时中性占位块,不渲染破图(ProfileHero 同款约定) */}
          {project.author.avatar ? (
            <img
              src={project.author.avatar}
              alt={project.author.name}
              className="w-8 h-8 rounded-xs object-cover bg-background-200"
            />
          ) : (
            <span className="w-8 h-8 rounded-xs bg-background-100 border border-foreground-200/50 flex items-center justify-center text-foreground-300">
              <i className="ri-user-3-line text-[15px]"></i>
            </span>
          )}
          <div>
            <span className="block text-[14px] font-medium text-foreground-800 group-hover:text-primary-500 transition-colors duration-200">
              {project.author.name}
            </span>
            <span className="block font-mono text-[12px] text-foreground-400">@{project.author.handle}</span>
          </div>
        </Link>
      </div>

      {/* Public URL */}
      <div className="-mx-2 px-2 pt-2 border-t border-background-200/50">
        <p className="text-[12px] text-foreground-400">
          {t('project.publicUrl')}:{' '}
          {/* id = slug(adaptProject 的映射);此前误用展示名,名称带空格/中文时 URL 是错的 */}
          <span className="font-mono text-foreground-600">
            dev.cx/p/{project.id}
          </span>
        </p>
      </div>
    </section>
  );
}