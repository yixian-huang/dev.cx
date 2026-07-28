import { createContext, useContext, type ReactNode } from 'react'

export type SSRData = Record<string, unknown>

const Ctx = createContext<SSRData>({})

export function SSRDataProvider({ value, children }: { value: SSRData; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSSRData<T = unknown>(key: string): T | undefined {
  return useContext(Ctx)[key] as T | undefined
}
