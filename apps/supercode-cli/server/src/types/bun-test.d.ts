// apps/supercode-cli/server/src/types/bun-test.d.ts
// Ambient module declaration for `bun:test` so the TypeScript language
// service can resolve imports from the test files. Bun ships its own
// types at runtime; this file is only there to satisfy `tsc` / IDEs in
// projects that don't install `bun-types`.
declare module "bun:test" {
  type TestFn = () => void | Promise<void>

  export const describe: (name: string, fn: () => void | Promise<void>) => void
  export const test: (name: string, fn?: TestFn) => void
  export const it: (name: string, fn?: TestFn) => void
  // Loosely-typed expect so any matcher in any test file resolves.
  // Tests still rely on runtime behavior — this is purely a TS shim.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const expect: any
  export const beforeEach: (fn: TestFn) => void
  export const afterEach: (fn: TestFn) => void
  export const beforeAll: (fn: TestFn) => void
  export const afterAll: (fn: TestFn) => void

  export interface Mock<T extends (...args: any[]) => any = (...args: any[]) => any> {
    (...args: Parameters<T>): ReturnType<T>
    mock: {
      calls: Parameters<T>[]
      results: { type: "return" | "throw"; value: any }[]
      implementation: T | undefined
    }
    mockImplementation: (impl: T) => Mock<T>
    mockReturnValue: (value: ReturnType<T>) => Mock<T>
    mockResolvedValue: (value: Awaited<ReturnType<T>>) => Mock<T>
    mockResolvedValueOnce: (value: Awaited<ReturnType<T>>) => Mock<T>
    mockRejectedValue: (err: unknown) => Mock<T>
    mockRejectedValueOnce: (err: unknown) => Mock<T>
    mockReset: () => Mock<T>
    mockRestore: () => void
    mockClear: () => Mock<T>
  }

  export function mock<T extends (...args: any[]) => any>(impl?: T): Mock<T>
  export function mock(): Mock<() => void>

  export function spyOn<T extends object, K extends keyof T>(
    obj: T,
    method: K,
  ): Mock<T[K] extends (...args: any[]) => any ? T[K] : never>

  export const jest: {
    fn: typeof mock
    spyOn: typeof spyOn
  }

  // bun:test exposes a global `mock.module` for module mocking.
  export const module: {
    (specifier: string, factory: () => unknown): void
    (specifier: string): { (factory: () => unknown): void }
  }
}
