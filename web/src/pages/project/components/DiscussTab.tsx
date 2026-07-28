import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import TypeLabel from '@/components/base/TypeLabel';
import type { DiscussEntry } from '@/lib/adapters/types';
import { createClient, type ApiError } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-errors';
import { mergePost, submitFeedback } from '@/lib/actions';
import MergeModal from './MergeModal';
import FeedbackForm from './FeedbackForm';

// 之前直接 import 自一个已删除的静态数据文件里的 discussEntries 数组做全局查找——这在真实
// 数据下是个潜藏 bug:被合并的子项永远来自当前传入的 entries prop,不是某个模块级常量。
// 删除那份静态数据时一并修成"在调用方传入的完整列表里查找",而不是随手指回一个不存在的模块。
function getMergedChildren(all: DiscussEntry[], parentId: string): DiscussEntry[] {
  return all.filter((d) => d.mergedInto === parentId);
}

type FilterKey = 'all' | 'feedback';

interface Props {
  entries: DiscussEntry[];
  isOwner: boolean;
  projectId: string;
  onMergeSuccess?: () => void;
}

export default function DiscussTab({ entries, isOwner, projectId, onMergeSuccess }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<'newest' | 'replies'>('newest');
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeCandidates, setMergeCandidates] = useState<DiscussEntry[]>([]);
  const [localMerged, setLocalMerged] = useState<Record<string, string[]>>({});
  // 非 401 的写失败要内联呈现(spec §3 约定,Task 7 先例),不能静默吞掉——合并/反馈提交都要有
  // 各自的错误槽位,分开放是因为它们各自的弹层是独立打开/关闭的。
  const [mergeError, setMergeError] = useState<string | undefined>(undefined);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | undefined>(undefined);

  const baseVisible = useMemo(() => entries.filter((e) => !e.mergedInto), [entries]);

  const filtered = useMemo(() => {
    if (filter === 'feedback') return baseVisible.filter((e) => e.feedbackType);
    return baseVisible;
  }, [baseVisible, filter]);

  const visibleEntries = useMemo(() => {
    const mergedIds = new Set(Object.keys(localMerged).flatMap((k) => localMerged[k]));
    let list = filtered.filter((e) => !mergedIds.has(e.id));
    list = list.map((e) => {
      if (localMerged[e.id]) {
        return { ...e, mergedFrom: [...(e.mergedFrom || []), ...localMerged[e.id]] };
      }
      return e;
    });
    return list;
  }, [filtered, localMerged]);

  const sorted = useMemo(() => {
    const list = [...visibleEntries];
    if (sort === 'replies') list.sort((a, b) => b.replies - a.replies);
    return list;
  }, [sort, visibleEntries]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const enterMergeMode = useCallback(() => { setMergeMode(true); setSelectedIds(new Set()); }, []);
  const cancelMerge = useCallback(() => { setMergeMode(false); setSelectedIds(new Set()); }, []);

  const confirmMergeSelection = useCallback(() => {
    if (selectedIds.size < 2) return;
    const candidates = visibleEntries.filter((e) => selectedIds.has(e.id));
    const leafCandidates: DiscussEntry[] = [];
    const seenIds = new Set<string>();
    candidates.forEach((c) => {
      if (c.mergedFrom) {
        c.mergedFrom.forEach((childId) => {
          const child = entries.find((d) => d.id === childId);
          if (child && !seenIds.has(child.id)) { leafCandidates.push(child); seenIds.add(child.id); }
        });
      }
      if (!seenIds.has(c.id)) { leafCandidates.push(c); seenIds.add(c.id); }
    });
    setMergeCandidates(leafCandidates);
    setMergeModalOpen(true);
  }, [selectedIds, visibleEntries, entries]);

  // 合并确认先打真实接口(每个被吸收帖各发一次 POST .../merge),成功后才做原有的本地乐观更新
  // (立即隐藏被吸收项,不等 timeline 刷新回来的网络往返)——失败则保留选择、弹层不关,内联报错,
  // 不做本地状态改写(不能让 UI 显示"已合并"而后端其实没变)。
  const handleMergeConfirm = useCallback(async (survivorId: string) => {
    const absorbed = mergeCandidates.filter((c) => c.id !== survivorId).map((c) => c.id);
    setMergeError(undefined);
    try {
      const client = createClient({ baseURL: '' });
      await Promise.all(absorbed.map((dupSlug) => mergePost(client, dupSlug, survivorId)));
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 401) {
        navigate('/login');
        return;
      }
      setMergeError(apiErrorMessage(e));
      return;
    }
    setLocalMerged((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => { next[key] = next[key].filter((id) => !absorbed.includes(id)); });
      const existing = next[survivorId] || [];
      next[survivorId] = [...new Set([...existing, ...absorbed])];
      return next;
    });
    setMergeMode(false); setSelectedIds(new Set()); setMergeModalOpen(false);
    onMergeSuccess?.();
  }, [mergeCandidates, navigate, onMergeSuccess]);

  const canMerge = mergeMode && selectedIds.size >= 2;

  const handlePostFeedback = useCallback(() => {
    setFeedbackError(undefined);
    setFeedbackOpen(true);
  }, []);

  const handleFeedbackCancel = useCallback(() => {
    setFeedbackOpen(false);
    setFeedbackError(undefined);
  }, []);

  // submitFeedback 成功返回新建讨论帖的 slug——直接跳过去,不留在项目页展示"已提交"态
  // (对齐 Task 8 约定:成功即 navigate,不是弹一个成功提示)。
  const handleFeedbackSubmit = useCallback(async (title: string, bodyMd: string) => {
    setFeedbackError(undefined);
    setFeedbackSubmitting(true);
    try {
      const client = createClient({ baseURL: '' });
      const { slug } = await submitFeedback(client, projectId, { title, body_md: bodyMd });
      navigate(`/t/${slug}`);
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 401) {
        navigate('/login');
        return;
      }
      setFeedbackError(apiErrorMessage(e));
    } finally {
      setFeedbackSubmitting(false);
    }
  }, [projectId, navigate]);

  return (
    <section className="py-6">
      {/* Filter bar */}
      <div className="flex items-center justify-between mb-1 pb-4 border-b border-background-200/50 flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap text-[13px]">
          {/* Filter pills */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded-xs transition-colors duration-200 whitespace-nowrap cursor-pointer ${
                filter === 'all' ? 'text-foreground-950 font-medium bg-background-200/60' : 'text-foreground-400 hover:text-foreground-700'
              }`}
            >
              {t('project.discuss.filterAll')}
            </button>
            <button
              onClick={() => setFilter('feedback')}
              className={`px-2.5 py-1 rounded-xs transition-colors duration-200 whitespace-nowrap cursor-pointer ${
                filter === 'feedback' ? 'text-foreground-950 font-medium bg-background-200/60' : 'text-foreground-400 hover:text-foreground-700'
              }`}
            >
              {t('project.discuss.filterFeedback')}
            </button>
          </div>

          <span className="text-foreground-200 select-none">|</span>

          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setSort('newest')}
              className={`px-2.5 py-1 rounded-xs transition-colors duration-200 whitespace-nowrap cursor-pointer ${
                sort === 'newest' ? 'text-foreground-950 font-medium bg-background-200/60' : 'text-foreground-400 hover:text-foreground-700'
              }`}
            >
              {t('project.feedback.sortNewest')}
            </button>
            <button
              onClick={() => setSort('replies')}
              className={`px-2.5 py-1 rounded-xs transition-colors duration-200 whitespace-nowrap cursor-pointer ${
                sort === 'replies' ? 'text-foreground-950 font-medium bg-background-200/60' : 'text-foreground-400 hover:text-foreground-700'
              }`}
            >
              {t('project.feedback.sortReplies')}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handlePostFeedback}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-[13px] bg-primary-500 text-background-50 rounded-xs hover:bg-primary-600 transition-colors duration-200 whitespace-nowrap cursor-pointer"
          >
            <i className="ri-feedback-line text-[12px]"></i>
            {t('project.feedback.postFeedback')}
          </button>

          {isOwner && (
            <>
              {mergeMode ? (
                <>
                  <button
                    onClick={cancelMerge}
                    className="px-3 py-1.5 text-[13px] text-foreground-500 hover:text-foreground-800 transition-colors duration-200 whitespace-nowrap cursor-pointer"
                  >
                    {t('project.feedback.cancel')}
                  </button>
                  <button
                    onClick={confirmMergeSelection}
                    disabled={!canMerge}
                    className={`px-3 py-1.5 text-[13px] rounded-xs transition-colors duration-200 whitespace-nowrap cursor-pointer ${
                      canMerge ? 'bg-primary-500 text-background-50 hover:bg-primary-600' : 'bg-background-200 text-foreground-400 cursor-not-allowed'
                    }`}
                  >
                    {t('project.feedback.mergeSelected')} {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
                  </button>
                </>
              ) : (
                <button
                  onClick={enterMergeMode}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-[13px] bg-secondary-500 text-background-50 rounded-xs hover:bg-secondary-600 transition-colors duration-200 whitespace-nowrap cursor-pointer"
                >
                  <i className="ri-git-merge-line text-[12px]"></i>
                  {t('project.feedback.merge')}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {mergeMode && (
        <div className="mb-3 px-3 py-2 bg-secondary-50 text-[13px] text-secondary-700 rounded-md">
          {t('project.feedback.mergeHint')}
        </div>
      )}

      {/* List——空列表给空态,不让筛选条下面是 0 高度的虚空 */}
      {sorted.length === 0 && (
        <p className="py-10 text-center text-[13px] text-foreground-400">
          {filter === 'feedback' ? t('project.feedback.emptyHint') : t('project.discussEmpty')}
        </p>
      )}
      <div className="divide-y divide-background-200/40">
        {sorted.map((item) => (
          <DiscussRow
            key={item.id}
            item={item}
            allEntries={entries}
            mergeMode={mergeMode}
            selected={selectedIds.has(item.id)}
            onToggle={() => toggleSelect(item.id)}
            onClick={() => navigate(`/t/${item.id}`)}
            t={t}
          />
        ))}
      </div>

      <MergeModal
        open={mergeModalOpen}
        candidates={mergeCandidates}
        onConfirm={handleMergeConfirm}
        onCancel={() => { setMergeModalOpen(false); setMergeError(undefined); }}
        error={mergeError}
      />

      <FeedbackForm
        open={feedbackOpen}
        submitting={feedbackSubmitting}
        error={feedbackError}
        onSubmit={handleFeedbackSubmit}
        onCancel={handleFeedbackCancel}
      />
    </section>
  );
}

function DiscussRow({
  item,
  allEntries,
  mergeMode,
  selected,
  onToggle,
  onClick,
  t,
}: {
  item: DiscussEntry;
  allEntries: DiscussEntry[];
  mergeMode: boolean;
  selected: boolean;
  onToggle: () => void;
  onClick: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const mergedCount = item.mergedFrom ? item.mergedFrom.length : 0;
  const mergedChildren = item.mergedFrom ? getMergedChildren(allEntries, item.id) : [];

  return (
    <div
      className={`group py-3.5 -mx-2 px-2 rounded-md transition-colors duration-200 ${
        mergeMode ? 'cursor-pointer hover:bg-background-100/60' : 'hover:bg-background-100/50'
      }`}
      onClick={mergeMode ? onToggle : undefined}
    >
      <div className="flex items-start gap-2.5">
        {/* Merge checkbox (mergeMode only) */}
        {mergeMode && (
          <div className="shrink-0 mt-0.5">
            <div
              className={`w-4 h-4 rounded-sm border-2 flex items-center justify-center transition-colors duration-150 ${
                selected ? 'bg-secondary-500 border-secondary-500' : 'border-background-300'
              }`}
            >
              {selected && (
                <i className="ri-check-line text-background-50 text-[10px]"></i>
              )}
            </div>
          </div>
        )}

        {/* Type badge */}
        <div className="shrink-0 mt-0.5">
          <TypeLabel type={item.type} className="text-[10px] tracking-[0.15em] font-medium"
          ></TypeLabel>
        </div>

        <div className="flex-1 min-w-0">
          {/* Line 1: title + merge count + reply count */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={(e) => {
                if (mergeMode) { e.stopPropagation(); onToggle(); }
                else { e.stopPropagation(); onClick(); }
              }}
              className="font-heading text-[15px] font-medium text-foreground-800 leading-snug truncate min-w-0 group-hover:text-primary-500 transition-colors duration-200 cursor-pointer text-left"
            >
              {item.title}
            </button>

            {mergedCount > 0 && (
              <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-xs bg-secondary-50 text-secondary-700 font-medium whitespace-nowrap">
                {t('project.feedback.mergedFromCount', { count: mergedCount })}
              </span>
            )}

            <span className="shrink-0 ml-auto text-[12px] text-foreground-400 font-mono tabular-nums">
              {item.replies}
            </span>
          </div>

          {/* Line 2: author · time */}
          <div className="mt-1 flex items-center gap-0 text-[12px] text-foreground-400">
            <span className="inline-block w-[88px] text-foreground-500 truncate">{item.author}</span>
            <span className="text-foreground-200">&middot;</span>
            <span className="inline-block w-[72px]">{item.time}</span>

            {/* Merged children preview — collapsible on hover */}
            {mergedChildren.length > 0 && (
              <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <span className="text-[11px] text-foreground-400">
                  {t('project.feedback.mergedFrom')} {mergedChildren.length}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}