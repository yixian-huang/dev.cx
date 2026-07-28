import { useTranslation } from 'react-i18next';
import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PageShell from '@/components/feature/PageShell';
import ProjectFormFields from '@/components/feature/ProjectFormFields';
import { createClient, type ApiError } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-errors';
import { createProject } from '@/lib/actions';
import {
  type ProjectDraft,
  type DraftErrors,
  type FieldError,
  emptyDraft,
  slugStem,
  validateSlug,
  validateDraft,
  hasErrors,
  draftToPayload,
} from '@/lib/project-form';

// 发布页 = 共享 ProjectFormFields + 创建壳。字段、顺序、文案、校验与设置页
// (project/settings)完全一致;slug 是可编辑字段:随名称实时派生预填(用户手改后
// 停止跟随),不再无条件加随机后缀——URL 即档案的一部分,所见即最终地址。

const NO_ERRORS: DraftErrors = {};

export default function NewProjectPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [draft, setDraft] = useState<ProjectDraft>(emptyDraft);
  const [slug, setSlug] = useState('');
  // 用户手动编辑过 slug 后,名称变更不再覆盖它
  const [slugTouched, setSlugTouched] = useState(false);
  // 服务端回弹的 slug 错误(slug_taken/slug_invalid)——展示在字段下方,不落底部通用槽
  const [slugServerError, setSlugServerError] = useState<FieldError | undefined>(undefined);
  // 首次提交前不亮错——只在用户点过「创建」后才逐字段展示
  const [showErrors, setShowErrors] = useState(false);
  const [creating, setCreating] = useState(false);
  // 非 401 的写失败内联展示(spec §3 约定),不吞、不用 toast;失败时保留表单内容不清空,
  // 用户可以直接改改重试。
  const [createError, setCreateError] = useState<string | undefined>(undefined);

  const errors = useMemo(() => validateDraft(draft), [draft]);
  const slugError = slugServerError ?? validateSlug(slug);

  const handleChange = useCallback((patch: Partial<ProjectDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    if (patch.name !== undefined) {
      setSlugTouched((touched) => {
        if (!touched) {
          setSlug(slugStem(patch.name ?? ''));
          setSlugServerError(undefined);
        }
        return touched;
      });
    }
    setCreateError(undefined);
  }, []);

  const handleSlugChange = useCallback((v: string) => {
    setSlugTouched(true);
    setSlug(v.toLowerCase().trim());
    setSlugServerError(undefined);
  }, []);

  // 成功即 navigate('/p/'+slug),失败内联展示、401 转登录。
  const handleCreate = useCallback(async () => {
    if (hasErrors(errors) || validateSlug(slug)) {
      setShowErrors(true);
      return;
    }
    setCreateError(undefined);
    setCreating(true);
    try {
      const client = createClient({ baseURL: '' });
      const result = await createProject(client, {
        slug,
        ...draftToPayload(draft),
      });
      navigate(`/p/${result.slug}`);
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 401) {
        navigate('/login');
        return;
      }
      if (e.code === 'slug_taken' || e.code === 'slug_invalid') {
        setShowErrors(true);
        setSlugServerError({ key: e.code === 'slug_taken' ? 'project.err.slugTaken' : 'project.err.slugInvalid' });
        return;
      }
      setCreateError(apiErrorMessage(e));
    } finally {
      setCreating(false);
    }
  }, [draft, slug, errors, navigate]);

  const canCreate = draft.name.trim().length > 0;

  return (
    <PageShell pageEnter>
      {/* Header */}
      <header className="pt-10 pb-6">
        <h1 className="font-heading text-[28px] font-semibold text-foreground-950 leading-[1.3]">
          {t('newProject.title')}
        </h1>
        <p className="text-[13px] text-foreground-400 mt-1.5">{t('newProject.deck')}</p>
      </header>

      <ProjectFormFields
        draft={draft}
        errors={showErrors ? errors : NO_ERRORS}
        onChange={handleChange}
        slugField={{
          value: slug,
          onChange: handleSlugChange,
          error: showErrors ? slugError : slugServerError,
        }}
      />

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 mt-10 pt-5 border-t border-foreground-200/35 pb-16">
        {createError && <span className="text-[13px] text-primary-700 mr-auto">{createError}</span>}
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-1.5 text-[14px] text-foreground-500 hover:text-foreground-800 transition-colors duration-200 whitespace-nowrap cursor-pointer bg-transparent border-none"
        >
          {t('newProject.cancel')}
        </button>
        <button
          onClick={handleCreate}
          disabled={!canCreate || creating}
          className="inline-flex items-center gap-2 px-5 py-1.5 text-[14px] font-medium bg-primary-500 text-background-50 hover:bg-primary-600 transition-colors duration-200 rounded-xs whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {creating ? t('newProject.creating') : t('newProject.create')}
        </button>
      </div>
    </PageShell>
  );
}
