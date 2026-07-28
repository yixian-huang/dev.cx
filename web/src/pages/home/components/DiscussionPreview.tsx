import PostList from '@/components/feature/PostList';
import { useApiData } from '@/lib/use-api-data';
import { adaptFeedItem } from '@/lib/adapters/post';
import type { PostsEnvelope } from '@/lib/adapters/api-types';
import type { FeedItem } from '@/lib/adapters/types';

export default function DiscussionPreview() {
  // SSR 首屏用 server.mjs 的 discuss/ask 各取 8 条、服务端合并排序后的前 8 条(mergeByCreatedAt),
  // 落在同一个 'posts' key 下。但 path 之前传 null——SPA 从别处导航回 '/' 时(路由靠
  // key={location.pathname} 整页重挂载,不会重新触发 SSR)'posts' 这个 key 早被消费过,
  // 拿到的永远是 undefined,讨论区从此永久空白。这里给出一个诚实的客户端近似:直接打
  // /api/posts?limit=8 取"最新 8 条、不分类型",不再是 discuss/ask 各半的服务端合并结果——
  // 这个 SSR/客户端行为差异是裁定接受的近似(C2 评审 Finding I4),直到 B2 有专门的首页
  // 策展端点为止。
  const { data, loading } = useApiData<PostsEnvelope>('posts', '/api/posts?limit=8');
  const items: FeedItem[] = data ? data.posts.map(adaptFeedItem) : [];

  return (
    <section className="w-full bg-background-50">
      <div className="max-w-[720px] mx-auto px-6 py-12 md:py-16">
        <PostList showHeader items={items} loading={!data && loading} />
      </div>
    </section>
  );
}
