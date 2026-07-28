import { useTranslation } from 'react-i18next';
import { useState, useCallback } from 'react';
import ImageUpload, { type ImageUploadResult } from '@/components/feature/ImageUpload';

// 项目截图字段(网格 + 上传/URL 追加 + 排序/删除 + lightbox)——发布页与设置页共用,
// 只管本地数组,落库由父级的创建/保存流程负责(约定:上传不自动保存)。
// 预览统一 3:2 裁切,与详情页 ScreenshotStrip 的展示比例一致,编辑时看到的取景即最终取景。

interface ScreenshotGridFieldProps {
  screenshots: string[];
  onUpdate: (screenshots: string[]) => void;
}

export default function ScreenshotGridField({ screenshots, onUpdate }: ScreenshotGridFieldProps) {
  const { t } = useTranslation();
  const [newUrl, setNewUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);

  const addScreenshot = useCallback(() => {
    const trimmed = newUrl.trim();
    if (trimmed) {
      onUpdate([...screenshots, trimmed]);
      setNewUrl('');
      setAdding(false);
    }
  }, [newUrl, screenshots, onUpdate]);

  const handleUploaded = useCallback(
    (result: ImageUploadResult) => {
      onUpdate([...screenshots, result.url]);
      setAdding(false);
      setNewUrl('');
    },
    [screenshots, onUpdate],
  );

  const removeScreenshot = useCallback(
    (idx: number) => {
      onUpdate(screenshots.filter((_, i) => i !== idx));
      if (viewingIndex === idx) setViewingIndex(null);
    },
    [screenshots, onUpdate, viewingIndex],
  );

  const moveScreenshot = useCallback(
    (from: number, to: number) => {
      if (to < 0 || to >= screenshots.length) return;
      const next = [...screenshots];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      onUpdate(next);
    },
    [screenshots, onUpdate],
  );

  return (
    <div>
      {/* Lightbox */}
      {viewingIndex !== null && (
        <button
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center cursor-default"
          onClick={() => setViewingIndex(null)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setViewingIndex(null);
            }}
            className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-[20px]"></i>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (viewingIndex > 0) setViewingIndex(viewingIndex - 1);
            }}
            className={`absolute left-4 w-10 h-10 flex items-center justify-center rounded-full text-white transition-colors cursor-pointer ${
              viewingIndex > 0 ? 'hover:bg-white/10' : 'opacity-30 cursor-not-allowed'
            }`}
            disabled={viewingIndex === 0}
          >
            <i className="ri-arrow-left-s-line text-[24px]"></i>
          </button>
          <img
            src={screenshots[viewingIndex]}
            alt={`截图 ${viewingIndex + 1}`}
            className="max-w-[90vw] max-h-[85vh] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (viewingIndex < screenshots.length - 1) setViewingIndex(viewingIndex + 1);
            }}
            className={`absolute right-4 w-10 h-10 flex items-center justify-center rounded-full text-white transition-colors cursor-pointer ${
              viewingIndex < screenshots.length - 1 ? 'hover:bg-white/10' : 'opacity-30 cursor-not-allowed'
            }`}
            disabled={viewingIndex === screenshots.length - 1}
          >
            <i className="ri-arrow-right-s-line text-[24px]"></i>
          </button>
          <span className="absolute bottom-6 text-[13px] text-white/70 font-mono">
            {viewingIndex + 1} / {screenshots.length}
          </span>
        </button>
      )}

      {/* Grid */}
      {screenshots.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {screenshots.map((url, i) => (
            <div key={i} className="relative group/ss rounded-md overflow-hidden bg-background-200/40">
              <img
                src={url}
                alt={`截图 ${i + 1}`}
                className="w-full aspect-[3/2] object-cover cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setViewingIndex(i)}
              />
              {/* Hover actions */}
              <div className="absolute inset-0 bg-black/0 group-hover/ss:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover/ss:opacity-100">
                <button
                  onClick={() => moveScreenshot(i, i - 1)}
                  disabled={i === 0}
                  className={`w-7 h-7 flex items-center justify-center rounded-full bg-white/80 text-foreground-700 cursor-pointer ${
                    i === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white'
                  }`}
                  aria-label="左移"
                >
                  <i className="ri-arrow-left-line text-[13px]"></i>
                </button>
                <button
                  onClick={() => removeScreenshot(i)}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-white/80 text-red-500 hover:bg-white cursor-pointer"
                  aria-label="删除截图"
                >
                  <i className="ri-delete-bin-line text-[13px]"></i>
                </button>
                <button
                  onClick={() => moveScreenshot(i, i + 1)}
                  disabled={i === screenshots.length - 1}
                  className={`w-7 h-7 flex items-center justify-center rounded-full bg-white/80 text-foreground-700 cursor-pointer ${
                    i === screenshots.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white'
                  }`}
                  aria-label="右移"
                >
                  <i className="ri-arrow-right-line text-[13px]"></i>
                </button>
              </div>
              {/* Index badge */}
              <span className="absolute top-2 left-2 w-5 h-5 flex items-center justify-center rounded-full bg-black/50 text-white text-[10px] font-mono">
                {i + 1}
              </span>
            </div>
          ))}

          {/* Add card */}
          {adding ? (
            <div className="aspect-[3/2] rounded-md border-2 border-dashed border-primary-300 flex flex-col items-center justify-center gap-2 p-3">
              <input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder={t('project.screenshotUrlPlaceholder')}
                className="w-full text-[12px] text-foreground-900 bg-transparent placeholder:text-foreground-300 px-2 py-1 outline-none text-center"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addScreenshot();
                  if (e.key === 'Escape') {
                    setAdding(false);
                    setNewUrl('');
                  }
                }}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={addScreenshot}
                  className="text-[12px] text-primary-500 hover:text-primary-700 cursor-pointer"
                >
                  {t('project.add')}
                </button>
                <ImageUpload
                  onUploaded={handleUploaded}
                  className="text-[12px] text-foreground-400 hover:text-primary-700 transition-colors duration-150 cursor-pointer disabled:opacity-50"
                  label={t('project.uploadScreenshot')}
                >
                  {t('project.uploadScreenshot')}
                </ImageUpload>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="aspect-[3/2] rounded-md border-2 border-dashed border-background-300/60 hover:border-primary-300 flex items-center justify-center cursor-pointer transition-colors duration-200"
            >
              <i className="ri-add-line text-[24px] text-foreground-300 hover:text-primary-500 transition-colors"></i>
            </button>
          )}
        </div>
      ) : (
        <div className="text-center py-8 rounded-md border border-dashed border-background-300/60">
          <p className="text-[13px] text-foreground-400 mb-3">
            {t('project.noScreenshots')}
          </p>
          {adding ? (
            <div className="flex items-center gap-2 max-w-sm mx-auto">
              <input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder={t('project.screenshotUrlPlaceholder')}
                className="flex-1 text-[13px] text-foreground-900 bg-background-50 px-3 py-2 rounded-xs outline-none border border-primary-300"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addScreenshot();
                  if (e.key === 'Escape') {
                    setAdding(false);
                    setNewUrl('');
                  }
                }}
              />
              <button
                onClick={addScreenshot}
                className="inline-flex items-center px-3 py-2 text-[13px] font-medium bg-primary-500 text-background-50 hover:bg-primary-600 rounded-xs cursor-pointer whitespace-nowrap"
              >
                {t('project.add')}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => setAdding(true)}
                className="inline-flex items-center gap-1.5 text-[13px] text-primary-500 hover:text-primary-700 transition-colors duration-150 cursor-pointer"
              >
                <i className="ri-add-line text-[14px]"></i>
                {t('project.addScreenshot')}
              </button>
              <ImageUpload
                onUploaded={handleUploaded}
                className="inline-flex items-center gap-1.5 text-[13px] text-primary-500 hover:text-primary-700 transition-colors duration-150 cursor-pointer disabled:opacity-50"
                label={t('project.uploadScreenshot')}
              >
                <i className="ri-upload-2-line text-[14px]"></i>
                {t('project.uploadScreenshot')}
              </ImageUpload>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
