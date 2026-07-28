import { useEffect, useState } from 'react';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/components/feature/Footer';
import MobileTabs from '@/components/feature/MobileTabs';
import SiteMasthead from './components/SiteMasthead';
import FocusWorks from './components/FocusWorks';
import DiscussionPreview from './components/DiscussionPreview';
import { useAuth } from '@/hooks/useAuth';
import { useApiData } from '@/lib/use-api-data';
import type { StatsEnvelope, ApiWeeklyIssue } from '@/lib/adapters/api-types';

const VISITED_KEY = 'devcx:visited';

export default function Home() {
  const { isLoggedIn } = useAuth();
  // 双态判定(画布 1b/4a):登录态或本地访问标记走紧凑刊头。SSR 只知道登录态;
  // 匿名回访者在 hydrate 后的 effect 里才切紧凑——首帧展示完整刊头是可接受的近似,
  // 换来 SSR/首帧标记一致(不在渲染期读 localStorage,避免 hydration 文本不匹配)。
  const [visited, setVisited] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(VISITED_KEY)) setVisited(true);
      else localStorage.setItem(VISITED_KEY, '1');
    } catch {
      /* storage 不可用(隐私模式等)——保持完整刊头 */
    }
  }, []);
  const compact = isLoggedIn || visited;

  // stats 只在页面层取一次(useApiData 的 SSR key 是 consume-once,两个子组件各取会有一个拿空),
  // 刊头 colophon 与 Focus 的「全部 n 个产品」共用。
  const { data: stats } = useApiData<StatsEnvelope>('stats', '/api/stats');
  // 上期周刊(latest 未发布时 404 → undefined,刊头该行不渲染)
  const { data: weeklyLatest } = useApiData<ApiWeeklyIssue | null>('weekly_latest', '/api/weekly/latest');

  return (
    <div className="min-h-screen bg-background-50">
      <Navbar />
      <main className="pt-14 pb-14 md:pb-0 page-enter">
        <SiteMasthead compact={compact} stats={stats} weekly={weeklyLatest ?? undefined} />
        <FocusWorks compact={compact} totalProducts={stats?.products} />
        <DiscussionPreview />
      </main>
      <Footer />
      <MobileTabs />
    </div>
  );
}
