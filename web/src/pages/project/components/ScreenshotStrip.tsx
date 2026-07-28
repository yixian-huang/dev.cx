import { useState, useCallback, useEffect } from 'react';
import type { FC } from 'react';

interface Screenshot {
  thumb: string;
  full: string;
}

interface ScreenshotStripProps {
  screenshots: Screenshot[];
}

const ScreenshotStrip: FC<ScreenshotStripProps> = ({ screenshots }) => {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const open = useCallback((index: number) => setLightboxIndex(index), []);
  const close = useCallback(() => setLightboxIndex(null), []);

  const goPrev = useCallback(() => {
    setLightboxIndex((prev) => {
      if (prev === null) return null;
      return prev === 0 ? screenshots.length - 1 : prev - 1;
    });
  }, [screenshots.length]);

  const goNext = useCallback(() => {
    setLightboxIndex((prev) => {
      if (prev === null) return null;
      return prev === screenshots.length - 1 ? 0 : prev + 1;
    });
  }, [screenshots.length]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [lightboxIndex, close, goPrev, goNext]);

  // 无截图则不渲染该块——防御性兜底:目前唯一调用方(ProjectHeader)已经在调用点做了同样的判断,
  // 这里加一层是给以后可能出现的、忘记加判断的调用方兜底,不依赖调用方守规矩。放在所有 hook
  // 调用之后,避免 hooks 顺序随 screenshots 是否为空而改变。
  if (screenshots.length === 0) return null;

  return (
    <>
      {/* Horizontal filmstrip——220×147(3:2)+ 居中裁切,与编辑表单 ScreenshotGridField
          的预览取景一致:用户在表单里确认的构图就是详情页展示的构图(此前 220×124≈1.77:1
          顶部对齐,竖屏截图会被裁到只剩顶部一条)。 */}
      <div className="mb-4 -mx-1">
        <div className="flex gap-2.5 overflow-x-auto scrollbar-none px-1">
          {screenshots.map((shot, i) => (
            <button
              key={i}
              onClick={() => open(i)}
              className="flex-shrink-0 relative group cursor-pointer rounded-xs overflow-hidden border border-foreground-200/50 hover:border-foreground-300 transition-colors duration-200"
              style={{ width: 220, height: 147 }}
            >
              <img
                src={shot.thumb}
                alt={`Screenshot ${i + 1}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-foreground-950/0 group-hover:bg-foreground-950/8 transition-colors duration-200 flex items-center justify-center">
                <i className="ri-zoom-in-line text-background-50/0 group-hover:text-background-50/90 text-lg transition-all duration-200"></i>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Lightbox overlay */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-foreground-950/80 flex items-center justify-center"
          onClick={close}
        >
          {/* Close button */}
          <button
            onClick={close}
            className="absolute top-5 right-5 w-9 h-9 flex items-center justify-center rounded-full bg-background-50/20 hover:bg-background-50/30 text-background-50 transition-colors duration-200 cursor-pointer z-10"
          >
            <i className="ri-close-line text-lg"></i>
          </button>

          {/* Counter */}
          <span className="absolute top-5 left-5 text-[13px] text-background-50/60 font-mono z-10">
            {lightboxIndex + 1} / {screenshots.length}
          </span>

          {/* Prev arrow */}
          <button
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            className="absolute left-4 md:left-8 w-10 h-10 flex items-center justify-center rounded-full bg-background-50/20 hover:bg-background-50/30 text-background-50 transition-colors duration-200 cursor-pointer z-10"
          >
            <i className="ri-arrow-left-s-line text-xl"></i>
          </button>

          {/* Image */}
          <img
            src={screenshots[lightboxIndex].full}
            alt={`Screenshot ${lightboxIndex + 1}`}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Next arrow */}
          <button
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            className="absolute right-4 md:right-8 w-10 h-10 flex items-center justify-center rounded-full bg-background-50/20 hover:bg-background-50/30 text-background-50 transition-colors duration-200 cursor-pointer z-10"
          >
            <i className="ri-arrow-right-s-line text-xl"></i>
          </button>
        </div>
      )}
    </>
  );
};

export default ScreenshotStrip;