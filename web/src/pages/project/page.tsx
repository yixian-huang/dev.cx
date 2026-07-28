import { useTranslation } from 'react-i18next';
import { useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import PageShell from '@/components/feature/PageShell';
import TabSwitcher from '@/components/base/TabSwitcher';
import EmptyState from '@/components/base/EmptyState';
import ProjectHeader from './components/ProjectHeader';
import TimelineTab from './components/TimelineTab';
import DiscussTab from './components/DiscussTab';
import AboutTab from './components/AboutTab';
import { useApiData } from '@/lib/use-api-data';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { metaForRoute } from '@/lib/meta';
import { unwrap, type ApiProject, type ApiPost } from '@/lib/adapters/api-types';
import { adaptProject } from '@/lib/adapters/project';
import { adaptTimelineEntry, adaptFeedItem } from '@/lib/adapters/post';
import type { UIProject, TimelineEntry, FeedItem, DiscussEntry } from '@/lib/adapters/types';

type TabKey = 'timeline' | 'discuss' | 'about';

const tabLabels: Record<TabKey, string> = {
  timeline: 'project.timeline',
  discuss: 'project.discuss',
  about: 'project.about',
};

// /timeline 端点的响应信封——SSR 裸注入与客户端重取拿到的是同一个形状(都是
// {timeline:[...], discussions:[...]}),不像 project 分支那样两边不一致,故此处不需要 unwrap
// (参见 lib/adapters/api-types.ts 顶部关于 unwrap 的注释)。
interface ApiTimelinePayload {
  timeline: ApiPost[];
  discussions: ApiPost[];
}

// DiscussTab 的 prop 类型是 adapters/types.ts 的 DiscussEntry(带 mergedFrom/mergedInto/
// feedbackType 等合并溯源与反馈分类字段)——这些字段真实列表接口从不返回(postJSON 在
// timeline/discussions 场景关闭了 withMergedFrom,而"反馈分类"这个概念 API 里根本不存在)。
// 按仓库"不编造"的一贯做法,这里只搬运 adaptFeedItem 已经给出的字段,其余留空/不生成,
// 而不是编造合并溯源或反馈类型。DiscussTab 自身的 JSX/prop 结构不变,只是这层转换补上
// adaptFeedItem(冻结的适配器输出)到它现有 prop 形状之间的缺口。
function toDiscussEntry(item: FeedItem): DiscussEntry {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    author: item.authorHandle ? `@${item.authorHandle}` : '',
    replies: item.replyCount,
    time: item.time,
  };
}

export default function ProjectPage() {
  const { t } = useTranslation();
  const { id: slug } = useParams();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('timeline');
  // 合并成功后 bump 这个 token,让 useApiData 绕开"data 已存在则不重取"的守卫,重新拉取
  // timeline(合并会让被吸收的帖子从列表里消失,是服务端过滤的结果,不是本地能模拟出来的)。
  const [timelineRefresh, setTimelineRefresh] = useState(0);

  const { data: rawProject, loading: projectLoading } = useApiData<unknown>(
    'project', slug ? `/api/projects/${slug}` : null,
  );
  const { data: rawTimeline } = useApiData<ApiTimelinePayload>(
    'timeline', slug ? `/api/projects/${slug}/timeline` : null, timelineRefresh,
  );
  const apiProject = rawProject ? unwrap<ApiProject>(rawProject, 'project') : undefined;

  // SPA 导航同步标签页标题——复用 metaForRoute 保证与 SSR <title> 逐字一致。
  useDocumentTitle(apiProject ? metaForRoute(`/p/${slug}`, { project: apiProject }).title : undefined);

  const tabOptions = useMemo(
    () => (['timeline', 'discuss', 'about'] as TabKey[]).map((tab) => ({
      key: tab,
      label: t(tabLabels[tab]),
    })),
    [t]
  );

  const tabsWithCounts = useCallback(
    (project: UIProject) =>
      tabOptions.map((tab) => ({
        ...tab,
        count:
          tab.key === 'timeline'
            ? project.stats.timelineCount
            : tab.key === 'discuss'
              ? project.stats.discussCount
              : undefined,
      })),
    [tabOptions],
  );

  const handleMergeSuccess = useCallback(() => {
    setTimelineRefresh((n) => n + 1);
  }, []);

  // 取数中(没有 SSR 值、客户端重取还未回来):按头部结构给骨架,补拉完成后内容
  // 原位替换,不再是整页空白一次性撑开。
  if (!apiProject && projectLoading) {
    return (
      <PageShell pageEnter>
        <section className="pt-10 md:pt-11 animate-pulse" aria-hidden>
          <div className="h-[13px] w-40 rounded-xs bg-background-200/70 mb-3.5" />
          <div className="h-[30px] w-64 rounded-xs bg-background-200/70" />
          <div className="h-[15px] w-80 rounded-xs bg-background-200/50 mt-3" />
          <div className="flex items-center gap-3 mt-4">
            <div className="h-[20px] w-14 rounded-xs bg-background-200/70" />
            <div className="h-[20px] w-20 rounded-xs bg-background-200/50" />
          </div>
          <div className="flex gap-2.5 mt-[22px] mb-4">
            <div className="rounded-xs bg-background-200/50" style={{ width: 220, height: 147 }} />
            <div className="rounded-xs bg-background-200/40 hidden sm:block" style={{ width: 220, height: 147 }} />
          </div>
          <div className="h-px bg-foreground-200/35 mt-[22px]" />
        </section>
      </PageShell>
    );
  }
  // 确认为空(取到了、项目确实不存在——404 或悬挂引用):空态,不回落 mock 项目。
  if (!apiProject) {
    return (
      <PageShell pageEnter>
        <EmptyState message={t('notFound.title')} hint={t('notFound.deck')} />
      </PageShell>
    );
  }

  // isOwner 只能来自会话比对,且必须先确认 author.handle 非空——author 可能是悬挂引用(null),
  // 这时 `user?.handle === apiProject.author?.handle` 在未登录访客身上会退化成
  // `undefined === undefined` → true,误判成"我是所有者"。加上 handle 非空守卫堵住这个边角。
  const project: UIProject = adaptProject(apiProject, {
    isOwner: !!apiProject.author?.handle && user?.handle === apiProject.author?.handle,
  });

  const timelineList: TimelineEntry[] = rawTimeline ? rawTimeline.timeline.map(adaptTimelineEntry) : [];
  const discussList: DiscussEntry[] = rawTimeline
    ? rawTimeline.discussions.map(adaptFeedItem).map(toDiscussEntry)
    : [];

  return (
    <PageShell pageEnter>
      <ProjectHeader project={project} />

      <section className="pb-4">
        <TabSwitcher<TabKey>
          tabs={tabsWithCounts(project)}
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key)}
        />
      </section>

      {activeTab === 'timeline' && <TimelineTab entries={timelineList} />}
      {activeTab === 'discuss' && (
        <DiscussTab
          entries={discussList}
          isOwner={project.isOwner}
          projectId={project.id}
          onMergeSuccess={handleMergeSuccess}
        />
      )}
      {activeTab === 'about' && <AboutTab project={project} />}
    </PageShell>
  );
}
