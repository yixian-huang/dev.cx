import { useAuth } from '@/hooks/useAuth';
import { useApiData } from '@/lib/use-api-data';
import { unwrap, type ApiProject } from '@/lib/adapters/api-types';

export interface ProjectOption {
  id: string;
  name: string;
  slug: string;
  stage: string;
}

// 接 GET /api/users/:handle/projects(与 me/projects/page.tsx 同一端点、同一"我的产品"
// 语义)。原先住在 compose/components/ProjectSelector.tsx,合并编辑器(2f)落地后选择器
// 收进编辑器类型行,hook 独立成文件供 compose 相关组件共用。
export function useMyProjects(): ProjectOption[] {
  const { user } = useAuth();
  const { data } = useApiData<unknown>(
    'my-projects-compose',
    user ? `/api/users/${user.handle}/projects` : null,
  );
  const apiProjects = data ? unwrap<ApiProject[]>(data, 'projects') : undefined;
  return (apiProjects ?? []).map((p) => ({ id: p.slug, name: p.name, slug: p.slug, stage: p.stage }));
}
