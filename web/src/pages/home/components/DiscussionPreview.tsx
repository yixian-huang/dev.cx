import PostList from '@/components/feature/PostList';
import { useApiData } from '@/lib/use-api-data';
import { adaptFeedItem } from '@/lib/adapters/post';
import type { PostsEnvelope } from '@/lib/adapters/api-types';
import type { FeedItem } from '@/lib/adapters/types';

export default function DiscussionPreview() {
  // SSR(server.mjs home)与客户端重取共用同一路径 /api/posts?limit=8(全类型最新 8 条)。
  // 必须同源:SSR 若注入空信封,useApiData 会把它当有效 data 且不再客户端补取。
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
