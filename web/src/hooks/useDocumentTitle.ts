import { useEffect } from 'react';

// SPA 导航时同步 document.title——SSR 只写首跳的 <title>,站内切页前一直是旧标题。
// undefined = 数据未就绪,先不动(保持上一个标题,等数据到了再设,避免闪 slug)。
export default function useDocumentTitle(title?: string) {
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);
}
