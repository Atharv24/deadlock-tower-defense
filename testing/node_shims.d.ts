// Ambient Node.js and `globalThis` declarations for `tsconfig.test.ts` (zero `@types/node` dependency).

declare namespace NodeJS {
  interface ProcessEnv {
    [key: string]: string | undefined
  }
  interface Process {
    readonly argv: string[]
    readonly execPath: string
    readonly cwd: () => string
    readonly env: ProcessEnv
    readonly platform: string
    exitCode?: number
    exit(code?: number): never
    on(event: string, listener: (...args: unknown[]) => void): this
  }
}

declare var process: NodeJS.Process

declare interface Buffer extends Uint8Array {
  toString(encoding?: string): string
}

declare var Buffer: {
  from(value: string | Uint8Array, encoding?: string): Buffer
  concat(list: readonly Uint8Array[]): Buffer
}

declare function setTimeout(handler: (...args: unknown[]) => void, timeoutMs?: number): unknown
declare function clearTimeout(id: unknown): void

declare class URL {
  constructor(input: string, base?: string | URL)
  href: string
  pathname: string
  protocol: string
}

declare module 'node:test' {
  export function describe(name: string, fn: () => void | Promise<void>): void
  export function it(name: string, fn: () => void | Promise<void>): void
  export function before(fn: () => void | Promise<void>): void
  export function beforeEach(fn: () => void | Promise<void>): void
  export function after(fn: () => void | Promise<void>): void
  export function afterEach(fn: () => void | Promise<void>): void
}

declare module 'node:assert/strict' {
  const assert: {
    (value: unknown, message?: string): asserts value
    ok(value: unknown, message?: string): asserts value
    equal<T>(actual: unknown, expected: T, message?: string): asserts actual is T
    notEqual(actual: unknown, expected: unknown, message?: string): void
    deepEqual(actual: unknown, expected: unknown, message?: string): void
    match(value: string, regexp: RegExp, message?: string): void
    doesNotMatch(value: string, regexp: RegExp, message?: string): void
    throws(fn: () => unknown, error?: unknown, message?: string): void
  }
  export = assert
}

declare module 'node:module' {
  export interface ResolveContext {
    parentURL?: string
    conditions: string[]
  }
  export interface ResolveResult {
    url: string
    shortCircuit?: boolean
    format?: string
  }
  export interface LoadContext {
    format?: string
    conditions: string[]
  }
  export interface LoadResult {
    format: string
    source: string | Uint8Array
    shortCircuit?: boolean
  }
  export interface RegisterHooksOptions {
    resolve?: (
      specifier: string,
      context: ResolveContext,
      nextResolve: (specifier: string, context?: ResolveContext) => ResolveResult,
    ) => ResolveResult
    load?: (
      url: string,
      context: LoadContext,
      nextLoad: (url: string, context?: LoadContext) => LoadResult,
    ) => LoadResult
  }
  export function registerHooks(hooks: RegisterHooksOptions): { deregister(): void }
}

declare module 'node:fs' {
  export interface Dirent {
    readonly name: string
    isDirectory(): boolean
    isFile(): boolean
  }
  export function existsSync(path: string): boolean
  export function readFileSync(path: string, encoding: 'utf8'): string
  export function readFileSync(path: string): Buffer
  export function writeFileSync(path: string, data: string | Uint8Array, encoding?: string): void
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void
  export function copyFileSync(src: string, dest: string): void
  export function unlinkSync(path: string): void
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void
  export function readdirSync(path: string): string[]
  export function readdirSync(path: string, options: { withFileTypes: true }): Dirent[]
  export function watch(
    filename: string,
    options: { recursive?: boolean },
    listener: (eventType: string, filename: string | null) => void,
  ): { close(): void }
}

declare module 'node:path' {
  export const sep: string
  export function join(...paths: string[]): string
  export function resolve(...paths: string[]): string
  export function dirname(p: string): string
  export function basename(p: string, ext?: string): string
  export function relative(from: string, to: string): string
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string
  export function pathToFileURL(path: string): URL
}

declare module 'node:child_process' {
  export interface SpawnSyncResult {
    readonly status: number | null
    readonly error?: Error
    readonly stdout?: string | Buffer
    readonly stderr?: string | Buffer
  }
  export function spawnSync(
    command: string,
    args?: readonly string[],
    options?: {
      cwd?: string
      env?: NodeJS.ProcessEnv
      stdio?: 'inherit' | 'pipe' | 'ignore'
      encoding?: 'utf8'
      shell?: boolean
    },
  ): SpawnSyncResult
  export function spawn(
    command: string,
    args?: readonly string[],
    options?: {
      cwd?: string
      env?: NodeJS.ProcessEnv
      stdio?: 'inherit' | 'pipe' | 'ignore'
      shell?: boolean
      detached?: boolean
      windowsHide?: boolean
    },
  ): {
    pid?: number
    kill(signal?: string): boolean
    unref?(): void
    on(event: 'exit' | 'error', cb: (...args: unknown[]) => void): void
  }
}
