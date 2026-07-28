import { useEffect, useRef, useState } from 'react'
import { createClient, type ApiError } from './api'
import { useSSRData } from './ssr-data'

// consumed 这套 Set 只有浏览器语义下才有意义:避免 SPA 导航回同一路由时复用陈旧的 SSR 值。
// SSR 渲染时这个模块只会被 import 一次(server.mjs 单次 import;vite.ssrLoadModule 也缓存实例;
// 生产环境更是整个进程只 import 一次的 bundle)——如果服务端也走这套"每个 key 只消费一次"的
// 语义,第一个请求消费掉某 key 后,同一进程生命周期内后续请求(哪怕渲染的是完全不同的数据,
// 比如另一个 project slug)都会命中"已消费"分支,SSR 预取对该 key 是静默、永久失效的。
// 因此:服务端每次渲染都直接吃 ssrValue,完全不碰这个 Set;每请求重置这个 Set 本身也不安全
// (Node 可并发处理请求,模块状态是进程级共享的,重置会跟别的请求的渲染打架)。
const consumed = new Set<string>()
export function __resetSSRConsumption() {
  consumed.clear()
}
export function __takeSSRValue(key: string, ssrValue: unknown): boolean {
  if (ssrValue === undefined || consumed.has(key)) return false
  consumed.add(key)
  return true
}

// 纯决策函数——hook 与测试共用,是否应该把 ssrValue 当作初始数据用:
// - isServer=true(SSR 渲染):ssrValue 有定义就直接用,不碰 consumed Set(见上方注释)。
// - isServer=false(浏览器):每个 key 的生命周期内只消费一次,交给 __takeSSRValue 的 Set 语义
//   (避免同路由再次挂载时复用上次导航留下的陈旧值)。
export function resolveInitialState(key: string, ssrValue: unknown, isServer: boolean): boolean {
  if (ssrValue === undefined) return false
  if (isServer) return true
  return __takeSSRValue(key, ssrValue)
}

export async function clientFetch<T>(baseURL: string, path: string): Promise<T> {
  return createClient({ baseURL }).get<T>(path)
}

const isServer = typeof window === 'undefined'

// refreshToken(可选,默认 0):bump 它(如 setRefreshN(n+1))强制客户端重取,
// 即便 data 已存在——用于写操作后刷新只读列表(如线程回复区)。
export function useApiData<T>(key: string, path: string | null, refreshToken = 0) {
  const ssrValue = useSSRData<T>(key)
  const [state, setState] = useState<{ data: T | undefined; loading: boolean; error: ApiError | null }>(() => {
    if (resolveInitialState(key, ssrValue, isServer)) return { data: ssrValue, loading: false, error: null }
    return { data: undefined, loading: path !== null, error: null }
  })
  // 记录上次见过的 refreshToken:只有它变化时才允许绕开"data 已存在则不重取"的守卫。
  const lastRefreshToken = useRef(refreshToken)
  // 下面这条 effect 的 deps 里虽然带着 path,但守卫是 `state.data !== undefined && !refreshed`——
  // 同一个组件实例如果只是 path 变了(比如 /t/a 导航到 /t/b 但组件没被卸载重挂载),
  // state.data 早就非 undefined 了,guard 会拦下重取,页面会静止展示上一个 path 的陈旧数据。
  // 这套写法之所以安全,唯一原因是 src/router/index.tsx 的 <div key={location.pathname}>
  // 让每次路径变化都整页重挂载——组件树被销毁重建,这个 hook 的 useState 初始值重新跑一遍,
  // state.data 回到 undefined,上面的 guard 天然不会挡路。这两处是一对——router 那边的 key
  // 一旦被去掉或换成别的粒度(比如只 key 到路由段而非完整 pathname),所有靠 path 变化触发
  // 重取的页面(线程页 slug、profile 页 handle 等)都会开始展示陈旧数据而不是报错,不会有
  // 任何测试信号提示这件事——见 src/router/index.tsx 同名注释。
  useEffect(() => {
    const refreshed = refreshToken !== lastRefreshToken.current
    lastRefreshToken.current = refreshToken
    if (path === null || (state.data !== undefined && !refreshed)) return
    let alive = true
    clientFetch<T>('', path)
      .then((d) => {
        if (alive) setState({ data: d, loading: false, error: null })
      })
      .catch((e) => {
        if (alive) setState({ data: undefined, loading: false, error: e as ApiError })
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, refreshToken])
  return state
}
