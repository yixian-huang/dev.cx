import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import AutoImport from "unplugin-auto-import/vite";
// import { readdyJsxRuntimeProxyPlugin } from "./vite.jsx-runtime-proxy";

const base = process.env.BASE_PATH || "/";
const isPreview = process.env.IS_PREVIEW ? true : false;
//const proxyPlugins = isPreview ? [readdyJsxRuntimeProxyPlugin()] : [];

// Task 11 (image-upload.test.mjs) 需要用 vite.ssrLoadModule() 直接把 'react-dom/server'/'react'
// 当「无 importer 的顶层入口」加载（node:test 里独立断言 SSR 渲染不炸）。这两个包的 CJS 源码顶层用
// require(...)（react/index.js、react-dom/server.node.js 都是按 NODE_ENV 条件把 module.exports
// 整体指向另一文件，esbuild/cjs-module-lexer 都没法静态分析出具名导出）——Vite SSR 的 fetchModule
// 只在「有 importer」时才走 tryNodeResolve+externalize 快路径（见 vite/dist/node/chunks/node.js 的
// fetchModule 实现），顶层入口没有 importer，只能落到 transformRequest 把源码当 ESM 直接跑，于是撞上
// 裸露的 require。这里用 createRequire 在插件自己的 Node 进程里真的 require 一次，读出实际的具名导出
// 键名，生成一个转发 shim——比手写死一份 React 版本相关的导出列表更抗版本漂移。
// 只在 apply:'serve' + this.environment.name==='ssr' 下生效，且只在「无 importer 顶层入口」这条路径
// 触发（有 importer 的嵌套 import，例如 entry-server.tsx 的 `import ... from 'react-dom/server'`，走的
// 是 fetchModule 的 externalize 快路径，根本不经过这个 load 钩子）——对 `vite build`、生产 SSR 渲染、
// 其余全部嵌套 import 零影响，纯粹是给这一个测试文件铺路，不改变任何真实渲染路径的行为。
const nodeRequire = createRequire(import.meta.url);

function cjsInteropShim(specifier: string): string {
  const real = nodeRequire(specifier);
  const names = Object.keys(real).filter(
    (k) => k !== "default" && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k),
  );
  return [
    "import { createRequire } from 'node:module';",
    "const require = createRequire(import.meta.url);",
    `const m = require(${JSON.stringify(specifier)});`,
    "export default m;",
    ...names.map((k) => `export const ${k} = m[${JSON.stringify(k)}];`),
  ].join("\n");
}

function ssrBareEntryCjsInteropPlugin(): Plugin {
  const reactIndexRE = /[\\/]node_modules[\\/]react[\\/]index\.js$/;
  const reactDomServerRE = /[\\/]node_modules[\\/]react-dom[\\/]server\.node\.js$/;
  return {
    name: "ssr-bare-entry-cjs-interop",
    apply: "serve",
    enforce: "pre",
    load(id) {
      if (this.environment?.name !== "ssr") return null;
      if (reactDomServerRE.test(id)) return cjsInteropShim("react-dom/server");
      if (reactIndexRE.test(id)) return cjsInteropShim("react");
      return null;
    },
  };
}
// https://vite.dev/config/
export default defineConfig({
  define: {
    __BASE_PATH__: JSON.stringify(base),
    __IS_PREVIEW__: JSON.stringify(isPreview),
    __READDY_PROJECT_ID__: JSON.stringify(process.env.PROJECT_ID || ""),
    __READDY_VERSION_ID__: JSON.stringify(process.env.VERSION_ID || ""),
    __READDY_AI_DOMAIN__: JSON.stringify(process.env.READDY_AI_DOMAIN || ""),
  },
  plugins: [
    // ...proxyPlugins,
    ssrBareEntryCjsInteropPlugin(),
    react(),
    AutoImport({
      imports: [
        {
          react: [
            ["default", "React"],
            "useState",
            "useEffect",
            "useContext",
            "useReducer",
            "useCallback",
            "useMemo",
            "useRef",
            "useImperativeHandle",
            "useLayoutEffect",
            "useDebugValue",
            "useDeferredValue",
            "useId",
            "useInsertionEffect",
            "useSyncExternalStore",
            "useTransition",
            "startTransition",
            "lazy",
            "memo",
            "forwardRef",
            "createContext",
            "createElement",
            "cloneElement",
            "isValidElement",
          ],
        },
        {
          "react-router-dom": [
            "useNavigate",
            "useLocation",
            "useParams",
            "useSearchParams",
            "Link",
            "NavLink",
            "Navigate",
            "Outlet",
          ],
        },
        // React i18n
        {
          "react-i18next": ["useTranslation", "Trans"],
        },
      ],
      dts: true,
    }),
  ],
  base,
  build: {
    sourcemap: true,
    outDir: process.env.SSR_BUILD ? 'dist/server' : 'dist/client',
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    host: "0.0.0.0",
  },
});
