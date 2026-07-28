import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import PageShell from '@/components/feature/PageShell';
import ProjectListItem from '@/components/feature/ProjectListItem';
import EmptyState from '@/components/base/EmptyState';
import LoginPrompt from '@/components/base/LoginPrompt';
import { useAuth } from '@/hooks/useAuth';
import { useApiData } from '@/lib/use-api-data';
import { unwrap, type ApiProject } from '@/lib/adapters/api-types';
import { adaptExploreProject } from '@/lib/adapters/project';

export default function MyProjectsPage() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  // me-projects 是这个页专属的客户端 key(不是 WorksTab 的 works:${handle},两处各自独立取数,
  // 互不复用),按当前会话的 handle 拉取"我的项目"列表。
  const { data: rawProjects, loading: projectsLoading } = useApiData<unknown>(
    'me-projects',
    user ? `/api/users/${user.handle}/projects` : null,
  );
  const apiProjects = rawProjects ? unwrap<ApiProject[]>(rawProjects, 'projects') : undefined;

  if (loading) {
    // 无现成骨架组件——留空(不展示 mock 项目)。
    return <PageShell>{null}</PageShell>;
  }

  if (!user) {
    return (
      <PageShell hideFooterCTA>
        <LoginPrompt
          title={t('me.loginRequiredTitle')}
          description={t('me.loginRequiredDesc')}
          loginLabel={t('login.submit')}
          registerLabel={t('login.registerSubmit')}
        />
      </PageShell>
    );
  }

  // 会话已就绪但项目列表还在取——同一个"取数中留空"约定(与 WorksTab.tsx 一致),避免
  // EmptyState("暂无项目")在真实列表到达前先闪一下。
  if (!apiProjects && projectsLoading) {
    return <PageShell>{null}</PageShell>;
  }

  const myProjects = apiProjects ? apiProjects.map(adaptExploreProject) : [];

  return (
    <PageShell>
      <header className="py-10 pb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <h1 className="font-heading text-display-lg text-foreground-950">
              {t('myProjects.title')}
            </h1>
            <span className="text-label text-foreground-400">
              {myProjects.length} {t('myProjects.count')}
            </span>
          </div>
          <Link
            to="/new-project"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary-500 text-background-50 hover:bg-primary-600 transition-colors duration-200 rounded-xs whitespace-nowrap cursor-pointer"
          >
            <i className="ri-add-line text-base w-4 h-4 flex items-center justify-center"></i>
            {t('newProject.create')}
          </Link>
        </div>
      </header>

      {myProjects.length === 0 ? (
        <EmptyState message={t('myProjects.empty')} />
      ) : (
        <div className="divide-y divide-background-200/50">
          {myProjects.map((proj, i) => (
            <ProjectListItem
              key={proj.id}
              index={i}
              id={proj.id}
              displayTitle={proj.displayTitle}
              authorHandle={proj.authorHandle}
              stage={proj.stage}
              updatedAt={proj.updatedAt}
              deck={proj.deck}
              latestThread={proj.latestThread}
              showDeck
              hidden={proj.hidden}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}