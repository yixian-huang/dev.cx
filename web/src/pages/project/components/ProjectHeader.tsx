import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import type { UIProject } from '@/lib/adapters/types';
import StageBadge from '@/components/base/StageBadge';
import FollowButton from '@/components/feature/FollowButton';
import ScreenshotStrip from './ScreenshotStrip';

const linkLabelMap: Record<string, string> = {
  '演示': 'project.demo',
  '仓库': 'project.repo',
  '文档': 'project.docs',
};

const AUDIENCE_KEY: Record<string, string> = {
  end_users: 'project.audience.endUsers',
  developers: 'project.audience.developers',
  teams: 'project.audience.teams',
};

interface Props {
  project: UIProject;
}

export default function ProjectHeader({ project }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();

  // 画布 2b:「2024.03 立项」——创建年月,纯展示格式化。
  const foundedLabel = useMemo(() => {
    if (!project.createdAt) return null;
    const created = new Date(project.createdAt);
    if (Number.isNaN(created.getTime())) return null;
    return `${created.getFullYear()}.${String(created.getMonth() + 1).padStart(2, '0')}`;
  }, [project.createdAt]);

  return (
    <section className="pt-10 md:pt-11">
      {/* mono 路径行 */}
      <div className="font-mono text-[13px] text-foreground-500 mb-2.5">
        <Link to={`/@${project.author.handle}`} className="hover:text-primary-500 transition-colors duration-200">
          @{project.author.handle}
        </Link>
        <span className="text-foreground-300"> / </span>
        <span>{project.id}</span>
      </div>

      <h1 className="font-heading text-[24px] md:text-[28px] leading-[1.3] font-semibold text-foreground-950">
        {project.displayName}
      </h1>
      {project.tagline && (
        <p className="mt-2.5 text-[15px] leading-[1.8] text-foreground-700 max-w-[36em] line-clamp-2">{project.tagline}</p>
      )}

      {/* meta 行:阶段徽章 + 受众字标 + 求反馈朱砂点 + 更新时间 + 立项年月 */}
      <div className="flex items-center gap-3 mt-3.5 text-xs flex-wrap">
        <StageBadge stage={project.stage} />
        {project.audience.map((aud) => (
          <span
            key={aud}
            className="inline-flex px-2 py-0.5 text-[11px] font-medium rounded-xs bg-secondary-100 text-secondary-800 whitespace-nowrap"
          >
            {t('project.audienceFacing', { audience: t(AUDIENCE_KEY[aud]) })}
          </span>
        ))}
        {project.hasFeedbackRequest && (
          <span className="inline-flex items-center gap-[5px] text-accent-600 font-medium whitespace-nowrap">
            <span className="w-[5px] h-[5px] rounded-full bg-accent-500 animate-pulse-subtle" />
            {t('focus.feedback')}
          </span>
        )}
        <span className="text-foreground-400">{t('project.metaUpdated', { time: project.updatedAt })}</span>
        {foundedLabel && (
          <span className="text-foreground-400">· {t('project.metaFounded', { date: foundedLabel })}</span>
        )}
      </div>

      {/* Screenshots——有图走 filmstrip;没图时只对 owner 显示补图引导(访客不看空占位,
          区块随内容消失),owner 补上图,两类产品页的头部才会真正一致 */}
      {project.screenshots && project.screenshots.length > 0 ? (
        <div className="mt-[22px]">
          <ScreenshotStrip screenshots={project.screenshots} />
        </div>
      ) : project.isOwner && isLoggedIn ? (
        <div className="mt-[22px] mb-4">
          <Link
            to={`/p/${project.id}/settings`}
            className="flex items-center justify-center gap-2 h-[88px] rounded-xs border border-dashed border-foreground-200/60 text-[13px] text-foreground-400 hover:text-primary-500 hover:border-primary-300 transition-colors duration-200"
          >
            <i className="ri-image-add-line text-[15px]"></i>
            {t('project.addScreenshotsNudge')}
          </Link>
        </div>
      ) : null}

      {/* mono 链接行 + 动作区;「写进度」是本页唯一实底 CTA */}
      <div className="flex items-center justify-between gap-3 mt-[22px] pb-6 border-b border-foreground-200/35 flex-wrap">
        <div className="flex items-center gap-[18px] flex-wrap font-mono text-[13px]">
          {project.links.map((link) => {
            const labelKey = linkLabelMap[link.label];
            return (
              <a
                key={`${link.label}-${link.url}`}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground-700 hover:text-primary-500 transition-colors duration-200 whitespace-nowrap"
              >
                {labelKey ? t(labelKey) : link.label} ↗
              </a>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {!project.isOwner && (
            <FollowButton
              kind="project"
              targetId={project.id}
              initialFollowing={project.viewerFollowing}
              followLabel={t('project.follow')}
              followingLabel={t('project.following')}
            />
          )}
          {project.isOwner && isLoggedIn && (
            <>
              <button
                onClick={() => navigate(`/compose?type=show&project=${project.id}&locked=1`)}
                className="inline-flex items-center px-3.5 py-1.5 text-[13px] text-foreground-600 hover:text-foreground-900 transition-colors duration-200 whitespace-nowrap cursor-pointer bg-transparent border-none"
              >
                {t('project.postShow')}
              </button>
              <Link
                to={`/p/${project.id}/settings`}
                className="inline-flex items-center px-2 py-1.5 text-[13px] text-foreground-500 hover:text-foreground-800 transition-colors duration-200 whitespace-nowrap"
                aria-label={t('project.editProject')}
              >
                <i className="ri-settings-3-line text-[14px]"></i>
              </Link>
              <button
                onClick={() => navigate(`/compose?type=build&project=${project.id}&locked=1`)}
                className="inline-flex items-center px-3.5 py-1.5 text-[13px] font-medium bg-primary-500 text-background-50 hover:bg-primary-600 transition-colors duration-200 rounded-xs whitespace-nowrap cursor-pointer"
              >
                {t('project.writeProgress')}
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
