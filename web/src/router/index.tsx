import { useNavigate, type NavigateFunction } from "react-router-dom";
import { useRoutes } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import routes from "./config";
import { metaForRoute, canonicalPath } from "@/lib/meta";

// 实体页(项目/帖子/主页/周刊)的标题依赖各自的数据,由页面内的 useDocumentTitle 设置;
// 这里只接管其余静态路由。若由本层统一设置,父组件 effect 晚于子组件执行,会用 slug
// 兜底标题覆盖掉实体页刚设好的真实标题。
function isEntityPath(pathname: string): boolean {
  return /^\/(p|t|weekly)\//.test(pathname) || pathname.startsWith("/@");
}

let navigateResolver: (navigate: ReturnType<typeof useNavigate>) => void;

declare global {
  interface Window {
    REACT_APP_NAVIGATE: ReturnType<typeof useNavigate>;
  }
}

export const navigatePromise = new Promise<NavigateFunction>((resolve) => {
  navigateResolver = resolve;
});

export function AppRoutes() {
  const element = useRoutes(routes);
  const navigate = useNavigate();
  const location = useLocation();

  const [overlayVisible, setOverlayVisible] = useState(false);
  const isFirstRender = useRef(true);

  useEffect(() => {
    window.REACT_APP_NAVIGATE = navigate;
    navigateResolver(window.REACT_APP_NAVIGATE);
  }, []);

  useEffect(() => {
    if (!isEntityPath(location.pathname)) {
      document.title = metaForRoute(canonicalPath(location.pathname), {}).title;
    }
  }, [location.pathname]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      window.scrollTo(0, 0);
      return;
    }

    setOverlayVisible(true);
    window.scrollTo({ top: 0, behavior: "instant" as const });

    const hideTimer = setTimeout(() => setOverlayVisible(false), 180);
    return () => clearTimeout(hideTimer);
  }, [location.pathname]);

  return (
    <>
      <div
        className={`page-transition-overlay ${overlayVisible ? "active" : ""}`}
        aria-hidden="true"
      />
      {/* key={location.pathname}:除了驱动上面的进场动画,这个 key 还是
          src/lib/use-api-data.ts 的 useApiData 能安全地"只在 path 变化时重取,否则信任已有
          data"这条守卫成立的唯一原因——每次导航到新路径都整页重挂载,该 hook 的 state 回到
          初始值,不会展示上一个路径留下的陈旧数据。改这个 key 的粒度(比如换成只 key 到路由
          段)会让线程页 slug、profile 页 handle 等所有靠 path 变化触发重取的页面开始展示
          陈旧数据,且没有任何测试会失败提示——见 use-api-data.ts 同名注释。 */}
      <div key={location.pathname} className="page-transition-enter">
        {element}
      </div>
    </>
  );
}