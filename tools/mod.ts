import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MODLOCK_BIN = path.join(
  REPO_ROOT,
  'tools',
  process.platform === 'win32' ? 'modlock.exe' : 'modlock',
)
const DEFAULT_DEADLOCK_DIR = 'D:\\SteamLibrary\\steamapps\\common\\Deadlock'
const FALLBACK_DEADLOCK_DIR = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Deadlock'
const SHARED_LAYER_DIRS = ['base', 'engine', 'ui', 'components'] as const

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildGameInfoMarkerRegex(marker: string, global = false): RegExp {
  const escaped = escapeRegExp(marker)
  return new RegExp(
    `[ \\t]*\\/\\/[ \\t]*${escaped} BEGIN\\r?\\n[\\s\\S]*?[ \\t]*\\/\\/[ \\t]*${escaped} END(?:\\r?\\n|$)`,
    global ? 'g' : '',
  )
}

export function extractGameInfoMarkerBlock(content: string, marker: string): string | undefined {
  const match = buildGameInfoMarkerRegex(marker).exec(content)
  return match?.[0]
}

export function removeGameInfoMarkerBlock(content: string, marker: string): string {
  return content.replace(buildGameInfoMarkerRegex(marker, true), '')
}

export function prepareGameInfoForModlock(content: string): {
  readonly content: string
  readonly savedHyperlineBlock: string | undefined
  readonly changed: boolean
} {
  const savedHyperlineBlock = extractGameInfoMarkerBlock(content, 'HYPERLINE STARTUP')
  let prepared = removeGameInfoMarkerBlock(content, 'MODLOCK DEV')
  prepared = removeGameInfoMarkerBlock(prepared, 'HYPERLINE STARTUP')
  return {
    content: prepared,
    savedHyperlineBlock,
    changed: prepared !== content,
  }
}

export function finalizeGameInfoAfterModlock(
  content: string,
  savedHyperlineBlock: string | undefined,
): {
  readonly content: string
  readonly changed: boolean
} {
  const cleaned = removeGameInfoMarkerBlock(content, 'MODLOCK DEV')
  const restored = restoreHyperlineStartupBlock(cleaned, savedHyperlineBlock)
  return {
    content: restored.content,
    changed: restored.content !== content,
  }
}

export function parseTasklistCsvHasImage(csvOutput: string, imageName: string): boolean {
  const needle = imageName.toLowerCase()
  for (const rawLine of csvOutput.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const match = /^"([^"]+)"/.exec(line)
    if (match?.[1]?.toLowerCase() === needle) {
      return true
    }
  }
  return false
}

export function resolveHyperlineExecutablePath(
  env: NodeJS.ProcessEnv,
  queryRunningPath?: () => string | undefined,
): string | undefined {
  const localAppDataPath = env.LOCALAPPDATA
    ? path.join(env.LOCALAPPDATA, 'Programs', 'Hyperline', 'hyperline.exe')
    : undefined
  if (localAppDataPath && fs.existsSync(localAppDataPath)) {
    return localAppDataPath
  }
  const queried = queryRunningPath?.()?.trim()
  if (queried && fs.existsSync(queried)) {
    return queried
  }
  return undefined
}

export function restoreHyperlineStartupBlock(
  content: string,
  savedBlock: string | undefined,
): {
  readonly content: string
  readonly changed: boolean
} {
  if (!savedBlock || extractGameInfoMarkerBlock(content, 'HYPERLINE STARTUP') !== undefined) {
    return { content, changed: false }
  }
  const searchPathsMatch = /\bSearchPaths\b\s*\{/.exec(content)
  if (!searchPathsMatch) {
    return { content, changed: false }
  }
  const searchStart = searchPathsMatch.index + searchPathsMatch[0].length
  const searchTail = content.slice(searchStart)
  const writeLineMatch =
    /^[ \t]*Write[ \t]+citadel[ \t]*(?:\r?\n|$)/im.exec(searchTail) ??
    /^[ \t]*Write[ \t]+"citadel"[ \t]*(?:\r?\n|$)/im.exec(searchTail)
  if (!writeLineMatch) {
    return { content, changed: false }
  }
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const insertAt = searchStart + writeLineMatch.index + writeLineMatch[0].length
  const needsLeadingEol = insertAt > 0 && !/\r?\n$/.test(content.slice(0, insertAt))
  const normalizedBlock = /\r?\n$/.test(savedBlock) ? savedBlock : `${savedBlock}${eol}`
  const updated =
    content.slice(0, insertAt) +
    (needsLeadingEol ? eol : '') +
    normalizedBlock +
    content.slice(insertAt)
  return { content: updated, changed: updated !== content }
}

export function resolveDeadlockGameInfoPath(env: NodeJS.ProcessEnv): string | undefined {
  const candidates = [env.DEADLOCK_DIR, DEFAULT_DEADLOCK_DIR, FALLBACK_DEADLOCK_DIR]
  const seen = new Set<string>()
  for (const dir of candidates) {
    if (!dir) continue
    const normalizedDir = path.resolve(dir)
    if (seen.has(normalizedDir)) continue
    seen.add(normalizedDir)
    const candidate = path.join(normalizedDir, 'game', 'citadel', 'gameinfo.gi')
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  return undefined
}
const TEST_ROOT_DIRS = [...SHARED_LAYER_DIRS, 'mods', 'testing'] as const
const IGNORED_SCAN_DIRS = new Set(['build', 'node_modules', '.modlock', '.git'])

const VALUE_TAKING_FLAGS = new Set([
  '--port',
  '--arg',
  '--ui-port',
  '--ui-relay',
  '--preview-port',
  '--to',
  '--origin',
  '--out',
  '--notes',
])

interface ParsedArgs {
  readonly flags: string[]
  readonly positionals: string[]
}

function parseFlagsAndPositionals(args: readonly string[]): ParsedArgs {
  const flags: string[] = []
  const positionals: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg.startsWith('-')) {
      flags.push(arg)
      if (!arg.includes('=') && VALUE_TAKING_FLAGS.has(arg) && i + 1 < args.length) {
        flags.push(args[++i])
      }
      continue
    }
    positionals.push(arg)
  }
  return { flags, positionals }
}

function buildChildEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  if (!env.DEADLOCK_DIR && fs.existsSync(DEFAULT_DEADLOCK_DIR)) {
    env.DEADLOCK_DIR = DEFAULT_DEADLOCK_DIR
  }
  return env
}

interface ModMetadata {
  readonly dirName: string
  readonly relDir: string
  readonly slug: string
  readonly name: string
  readonly version: string
  readonly map: string
}

function listAvailableMods(): string[] {
  const modsRoot = path.join(REPO_ROOT, 'mods')
  if (!fs.existsSync(modsRoot)) {
    return []
  }
  const slugs: string[] = []
  for (const entry of fs.readdirSync(modsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (fs.existsSync(path.join(modsRoot, entry.name, 'mod.json'))) {
      slugs.push(entry.name)
    }
  }
  return slugs.sort()
}

function listAvailableModMetadata(): ModMetadata[] {
  return listAvailableMods().map((dirName) => {
    const relDir = `mods/${dirName}`
    const manifestPath = path.join(REPO_ROOT, relDir, 'mod.json')
    try {
      const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
        slug?: string
        name?: string
        version?: string
        map?: string
      }
      return {
        dirName,
        relDir,
        slug: typeof parsed.slug === 'string' && parsed.slug ? parsed.slug : dirName.replace(/_/g, '-'),
        name: typeof parsed.name === 'string' && parsed.name ? parsed.name : dirName,
        version: typeof parsed.version === 'string' && parsed.version ? parsed.version : '-',
        map: typeof parsed.map === 'string' && parsed.map ? parsed.map : '-',
      }
    } catch {
      return {
        dirName,
        relDir,
        slug: dirName.replace(/_/g, '-'),
        name: dirName,
        version: '-',
        map: '-',
      }
    }
  })
}

function resolveModRelDir(input: string): string {
  const normalized = input.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  const needle = normalized.startsWith('mods/') ? normalized.slice('mods/'.length) : normalized
  if (!needle || needle.includes('/')) {
    throw new Error(`Invalid mod selector "${input}". Expected <slug> or mods/<slug>.`)
  }
  const mods = listAvailableModMetadata()
  if (mods.length === 0) {
    throw new Error('No mods found under mods/*/mod.json.')
  }

  const exactDir = mods.find((m) => m.dirName === needle)
  if (exactDir) return exactDir.relDir

  const underscoreNeedle = needle.replace(/-/g, '_')
  const normalizedDir = mods.find((m) => m.dirName === underscoreNeedle)
  if (normalizedDir) return normalizedDir.relDir

  const hyphenNeedle = needle.replace(/_/g, '-')
  const exactSlug = mods.find((m) => m.slug === needle || m.slug === hyphenNeedle)
  if (exactSlug) return exactSlug.relDir

  const shorthandMatches = mods.filter(
    (m) =>
      m.dirName.endsWith(`_${underscoreNeedle}`) || m.dirName.startsWith(`${underscoreNeedle}_`),
  )
  if (shorthandMatches.length === 1) {
    return shorthandMatches[0].relDir
  }
  if (shorthandMatches.length > 1) {
    throw new Error(
      `Ambiguous mod selector "${input}" matched: ${shorthandMatches.map((m) => m.dirName).join(', ')}`,
    )
  }

  throw new Error(
    `Mod "${input}" not found under mods/. Available mods: ${mods.map((m) => m.dirName).join(', ')}`,
  )
}

function tryResolveModRelDir(input: string): string | undefined {
  try {
    return resolveModRelDir(input)
  } catch {
    return undefined
  }
}

function resolveDefaultOrExplicitMod(
  positionals: readonly string[],
  cmdName: 'dev' | 'play' | 'probe' | 'publish',
): string {
  if (positionals[0]) {
    return resolveModRelDir(positionals[0])
  }
  const mods = listAvailableMods()
  if (mods.length === 0) {
    throw new Error('No mods found under mods/*/mod.json.')
  }
  if (mods.length === 1) {
    return `mods/${mods[0]}`
  }
  if (cmdName === 'probe' && mods.includes('deadlock_td')) {
    return 'mods/deadlock_td'
  }
  throw new Error(
    `Multiple mods found (${mods.join(', ')}). Specify one with ".\\mod ${cmdName} <mod>" (run ".\\mod list" for details).`,
  )
}

function expandConvenienceFlags(flags: readonly string[]): string[] {
  const expanded: string[] = []
  let sawCheats = false
  let hasArgDev = false

  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i]
    if (flag === '--cheats') {
      sawCheats = true
      continue
    }
    if (flag === '--arg' && flags[i + 1]?.toLowerCase() === 'dev') {
      hasArgDev = true
    } else if (flag.toLowerCase() === '--arg=dev') {
      hasArgDev = true
    }
    expanded.push(flag)
  }

  if (sawCheats && !hasArgDev) {
    expanded.push('--arg', 'dev')
  }
  return expanded
}

function runModlockSync(args: readonly string[]): number {
  if (!fs.existsSync(MODLOCK_BIN)) {
    console.error(`Modlock binary not found at ${MODLOCK_BIN}`)
    return 1
  }
  const res = spawnSync(MODLOCK_BIN, args, {
    cwd: REPO_ROOT,
    env: buildChildEnv(),
    stdio: 'inherit',
  })
  if (res.error) {
    console.error(`Failed to launch modlock: ${res.error.message}`)
    return 1
  }
  return res.status ?? 1
}

function cmdBuild(rawArgs: readonly string[]): number {
  const { flags, positionals } = parseFlagsAndPositionals(rawArgs)
  const wantAll = flags.includes('--all') || positionals.length === 0
  const modlockFlags = flags.filter((f) => f !== '--all')

  const targets = wantAll
    ? listAvailableMods().map((slug) => `mods/${slug}`)
    : positionals.map(resolveModRelDir)

  if (targets.length === 0) {
    console.error('No mods found under mods/*/mod.json.')
    return 1
  }

  for (const modRelDir of targets) {
    console.log(`\n=== Building ${modRelDir} ===`)
    const status = runModlockSync(['build', ...modlockFlags, modRelDir])
    if (status !== 0) {
      return status
    }
  }
  return 0
}

function collectTestFiles(relDir: string, out: string[]): void {
  const absDir = path.join(REPO_ROOT, relDir)
  if (!fs.existsSync(absDir)) {
    return
  }
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    if (IGNORED_SCAN_DIRS.has(entry.name)) {
      continue
    }
    const relChild = `${relDir}/${entry.name}`
    if (entry.isDirectory()) {
      collectTestFiles(relChild, out)
    } else if (entry.name.endsWith('_test.ts') || entry.name.endsWith('.test.ts')) {
      out.push(relChild)
    }
  }
}

function findTsgoBinary(): string | undefined {
  if (process.env.TSGO_PATH && fs.existsSync(process.env.TSGO_PATH)) {
    return process.env.TSGO_PATH
  }
  const exeName = process.platform === 'win32' ? 'tsgo.exe' : 'tsgo'
  const localTool = path.join(REPO_ROOT, 'tools', exeName)
  if (fs.existsSync(localTool)) {
    return localTool
  }

  const cacheRoots: string[] = []
  if (process.env.LOCALAPPDATA) {
    cacheRoots.push(path.join(process.env.LOCALAPPDATA, 'modlock', 'npm', '@typescript'))
  }
  if (process.env.USERPROFILE) {
    cacheRoots.push(path.join(process.env.USERPROFILE, '.cache', 'modlock', 'npm', '@typescript'))
  }
  if (process.env.HOME) {
    cacheRoots.push(path.join(process.env.HOME, '.cache', 'modlock', 'npm', '@typescript'))
  }

  for (const root of cacheRoots) {
    if (!fs.existsSync(root)) continue
    const dirs = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith('native-preview-'))
      .map((d) => d.name)
      .sort((a, b) => b.localeCompare(a))
    for (const dir of dirs) {
      const candidate = path.join(root, dir, 'lib', exeName)
      if (fs.existsSync(candidate)) {
        return candidate
      }
    }
  }
  return undefined
}

function runTypecheck(projectFile: string, env: NodeJS.ProcessEnv): number {
  const tsgo = findTsgoBinary()
  if (tsgo) {
    console.log(`\n=== Typechecking ${projectFile} (${path.basename(tsgo)}) ===`)
    const res = spawnSync(tsgo, ['--project', projectFile, '--pretty', 'false'], {
      cwd: REPO_ROOT,
      env,
      stdio: 'inherit',
    })
    if (res.error) {
      console.error(`Failed to run tsgo on ${projectFile}: ${res.error.message}`)
      return 1
    }
    return res.status ?? 1
  }

  console.log(`\n=== Typechecking ${projectFile} (tsc fallback) ===`)
  const res = spawnSync('tsc', ['--noEmit', '-p', projectFile], {
    cwd: REPO_ROOT,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (res.error) {
    console.error(`Failed to run tsc on ${projectFile}: ${res.error.message}`)
    return 1
  }
  return res.status ?? 1
}

function cmdTest(rawArgs: readonly string[]): number {
  const { positionals } = parseFlagsAndPositionals(rawArgs)
  const pattern = positionals[0]?.toLowerCase()
  const env = buildChildEnv()

  // Ensure ambient Modlock SDK types exist for tsconfig.json / tsconfig.test.json checks.
  const sdkTypesPath = path.join(
    REPO_ROOT,
    'mods',
    'deadlock_td',
    'node_modules',
    'modlock',
    'index.d.ts',
  )
  if (!fs.existsSync(sdkTypesPath)) {
    const mods = listAvailableMods()
    const target = mods.includes('deadlock_td') ? 'mods/deadlock_td' : `mods/${mods[0]}`
    if (mods.length > 0) {
      console.log(`Bootstrapping Modlock types via ${target}...`)
      const buildStatus = runModlockSync(['build', target])
      if (buildStatus !== 0) {
        return buildStatus
      }
    }
  }

  const allTests: string[] = []
  for (const rootDir of TEST_ROOT_DIRS) {
    collectTestFiles(rootDir, allTests)
  }
  allTests.sort()

  const selected = pattern
    ? allTests.filter((t) => t.toLowerCase().includes(pattern))
    : allTests
  if (selected.length === 0) {
    console.error(
      pattern
        ? `No test files matched pattern "${positionals[0]}".`
        : 'No *_test.ts files found.',
    )
    return 1
  }

  console.log(`=== Running ${selected.length} test suite(s) ===`)
  const testRes = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--import', './testing/register.ts', '--test', ...selected],
    {
      cwd: REPO_ROOT,
      env,
      stdio: 'inherit',
    },
  )
  if (testRes.error) {
    console.error(`Failed to run Node test runner: ${testRes.error.message}`)
    return 1
  }
  if ((testRes.status ?? 1) !== 0) {
    return testRes.status ?? 1
  }

  const cfgStatus = runTypecheck('tsconfig.json', env)
  if (cfgStatus !== 0) {
    return cfgStatus
  }
  return runTypecheck('tsconfig.test.json', env)
}

function cmdList(): number {
  const mods = listAvailableModMetadata()
  if (mods.length === 0) {
    console.log('No mods found under mods/*/mod.json.')
    return 0
  }

  const colDir = Math.max(4, ...mods.map((m) => m.dirName.length))
  const colSlug = Math.max(4, ...mods.map((m) => m.slug.length))
  const colVer = Math.max(7, ...mods.map((m) => m.version.length))
  const colMap = Math.max(3, ...mods.map((m) => m.map.length))

  console.log(
    `${'DIR'.padEnd(colDir)}  ${'SLUG'.padEnd(colSlug)}  ${'VERSION'.padEnd(colVer)}  ${'MAP'.padEnd(colMap)}  NAME`,
  )
  console.log(
    `${'-'.repeat(colDir)}  ${'-'.repeat(colSlug)}  ${'-'.repeat(colVer)}  ${'-'.repeat(colMap)}  ----`,
  )
  for (const m of mods) {
    console.log(
      `${m.dirName.padEnd(colDir)}  ${m.slug.padEnd(colSlug)}  ${m.version.padEnd(colVer)}  ${m.map.padEnd(colMap)}  ${m.name}`,
    )
  }
  return 0
}

function cmdProbe(rawArgs: readonly string[]): number {
  const { flags, positionals } = parseFlagsAndPositionals(rawArgs)
  const modRelDir = resolveDefaultOrExplicitMod(positionals, 'probe')
  return runModlockSync([
    'dev',
    '--watch=false',
    '--no-game',
    '--arg',
    'probe',
    ...flags,
    modRelDir,
  ])
}

interface PausedHyperlineState {
  readonly wasRunning: boolean
  readonly executablePath: string | undefined
}

function sleepSyncMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function isWindowsProcessRunning(imageName: string): boolean {
  const res = spawnSync(
    'tasklist',
    ['/FI', `IMAGENAME eq ${imageName}`, '/FO', 'CSV', '/NH'],
    { encoding: 'utf8', stdio: 'pipe' },
  )
  return typeof res.stdout === 'string' && parseTasklistCsvHasImage(res.stdout, imageName)
}

function queryRunningHyperlineExeFromCim(): string | undefined {
  const res = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      "(Get-CimInstance Win32_Process -Filter \"Name='hyperline.exe'\" | Select-Object -First 1).ExecutablePath",
    ],
    { encoding: 'utf8', stdio: 'pipe' },
  )
  if (res.error || typeof res.stdout !== 'string') {
    return undefined
  }
  const trimmed = res.stdout.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function pauseHyperlineDesktopForModlock(env: NodeJS.ProcessEnv): PausedHyperlineState {
  const desktopRunning = isWindowsProcessRunning('hyperline.exe')
  const coreRunning = isWindowsProcessRunning('hyperline-core.exe')
  if (!desktopRunning && !coreRunning) {
    return { wasRunning: false, executablePath: undefined }
  }

  const executablePath = resolveHyperlineExecutablePath(env, queryRunningHyperlineExeFromCim)
  console.log(
    '[mod] Pausing Hyperline Desktop while Modlock owns Deadlock client UI (will resume in background on exit)...',
  )
  spawnSync('taskkill', ['/IM', 'hyperline.exe', '/T', '/F'], { stdio: 'ignore' })
  spawnSync('taskkill', ['/IM', 'hyperline-core.exe', '/T', '/F'], { stdio: 'ignore' })

  for (let i = 0; i < 15; i++) {
    if (!isWindowsProcessRunning('hyperline.exe') && !isWindowsProcessRunning('hyperline-core.exe')) {
      break
    }
    sleepSyncMs(100)
  }

  return { wasRunning: true, executablePath }
}

function resumeHyperlineDesktopAfterModlock(executablePath: string, env: NodeJS.ProcessEnv): void {
  for (let i = 0; i < 15; i++) {
    if (!isWindowsProcessRunning('deadlock.exe')) {
      break
    }
    sleepSyncMs(100)
  }
  if (isWindowsProcessRunning('deadlock.exe')) {
    console.log('[mod] Left Hyperline Desktop paused because Deadlock is still open.')
    return
  }
  try {
    const resumed = spawn(executablePath, ['--background'], {
      cwd: path.dirname(executablePath),
      env,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    resumed.unref?.()
    console.log('[mod] Resumed Hyperline Desktop in background.')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`Warning: failed to resume Hyperline Desktop: ${msg}`)
  }
}

function runWatchedModlockSubcommand(subcommand: 'dev' | 'play', rawArgs: readonly string[]): number {
  if (!fs.existsSync(MODLOCK_BIN)) {
    console.error(`Modlock binary not found at ${MODLOCK_BIN}`)
    process.exit(1)
  }
  const { flags, positionals } = parseFlagsAndPositionals(rawArgs)
  const expandedFlags = expandConvenienceFlags(flags)
  const modRelDir = resolveDefaultOrExplicitMod(positionals, subcommand)
  const watchDisabled = expandedFlags.includes('--watch=false')
  const triggerFile = path.join(REPO_ROOT, modRelDir, '_watch_trigger.txt')
  const childEnv = buildChildEnv()
  const mountsClientUi =
    !expandedFlags.includes('--no-game') && !expandedFlags.includes('--sandbox')

  const pausedHyperline =
    mountsClientUi && process.platform === 'win32'
      ? pauseHyperlineDesktopForModlock(childEnv)
      : { wasRunning: false, executablePath: undefined }

  let gameInfoPath = mountsClientUi ? resolveDeadlockGameInfoPath(childEnv) : undefined
  let savedHyperlineBlock: string | undefined

  if (gameInfoPath) {
    try {
      const rawGameInfo = fs.readFileSync(gameInfoPath, 'utf8')
      const prepared = prepareGameInfoForModlock(rawGameInfo)
      savedHyperlineBlock = prepared.savedHyperlineBlock
      if (prepared.changed) {
        fs.writeFileSync(gameInfoPath, prepared.content, 'utf8')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`Warning: failed pre-flight cleanup on ${gameInfoPath}: ${msg}`)
      gameInfoPath = undefined
      savedHyperlineBlock = undefined
    }
  }

  const watchers: Array<{ close(): void }> = []
  let debounceTimer: unknown
  let forceKillTimer: unknown
  let isTearingDown = false
  let watchersStopped = false
  let finalized = false
  let sigintCount = 0

  const stopWatchers = () => {
    isTearingDown = true
    if (watchersStopped) return
    watchersStopped = true
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer)
      debounceTimer = undefined
    }
    for (const w of watchers) {
      try {
        w.close()
      } catch {
        // Ignore watcher teardown error
      }
    }
    watchers.length = 0
    try {
      fs.rmSync(triggerFile, { force: true })
    } catch {
      // Ignore cleanup error
    }
  }

  const finalizeSession = (allowProcessSpawn: boolean) => {
    stopWatchers()
    if (forceKillTimer !== undefined) {
      clearTimeout(forceKillTimer)
      forceKillTimer = undefined
    }
    if (finalized) return
    finalized = true
    if (gameInfoPath) {
      try {
        const curGameInfo = fs.readFileSync(gameInfoPath, 'utf8')
        const restored = finalizeGameInfoAfterModlock(curGameInfo, savedHyperlineBlock)
        if (restored.changed) {
          fs.writeFileSync(gameInfoPath, restored.content, 'utf8')
        }
      } catch {
        // Ignore best-effort teardown restore errors
      }
    }
    if (allowProcessSpawn && pausedHyperline.wasRunning && pausedHyperline.executablePath) {
      resumeHyperlineDesktopAfterModlock(pausedHyperline.executablePath, childEnv)
    }
  }

  if (!watchDisabled) {
    const scheduleReloadTrigger = () => {
      if (isTearingDown) return
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer)
      }
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined
        if (isTearingDown) return
        try {
          fs.writeFileSync(triggerFile, `// reload trigger ${Date.now()}\n`, 'utf8')
        } catch {
          // Ignore transient write error during shutdown
        }
      }, 150)
    }

    for (const layerDir of SHARED_LAYER_DIRS) {
      const absLayer = path.join(REPO_ROOT, layerDir)
      if (!fs.existsSync(absLayer)) continue
      const watcher = fs.watch(absLayer, { recursive: true }, (_event, filename) => {
        if (filename && filename.endsWith('_test.ts')) return
        scheduleReloadTrigger()
      })
      watchers.push(watcher)
    }
  }

  const child = spawn(MODLOCK_BIN, [subcommand, ...expandedFlags, modRelDir], {
    cwd: REPO_ROOT,
    env: childEnv,
    stdio: 'inherit',
  })

  process.on('exit', () => finalizeSession(false))
  process.on('SIGINT', () => {
    sigintCount += 1
    stopWatchers()
    if (sigintCount === 1) {
      if (process.platform !== 'win32') {
        try {
          child.kill('SIGINT')
        } catch {
          // Ignore
        }
      }
      forceKillTimer = setTimeout(() => {
        try {
          child.kill()
        } catch {
          // Ignore
        }
      }, 8000)
      ;(forceKillTimer as { unref?: () => void }).unref?.()
      return
    }
    try {
      child.kill()
    } catch {
      // Ignore
    }
  })

  const handleTerminationSignal = (signal: 'SIGTERM' | 'SIGHUP') => {
    stopWatchers()
    try {
      if (process.platform !== 'win32') {
        child.kill(signal)
      } else {
        child.kill()
      }
    } catch {
      // Ignore
    }
  }
  process.on('SIGTERM', () => handleTerminationSignal('SIGTERM'))
  process.on('SIGHUP', () => handleTerminationSignal('SIGHUP'))

  child.on('exit', (code) => {
    finalizeSession(true)
    process.exit(sigintCount > 0 ? 130 : typeof code === 'number' ? code : 1)
  })
  child.on('error', (err) => {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`Failed to launch modlock ${subcommand}: ${msg}`)
    finalizeSession(true)
    process.exit(1)
  })

  return 0
}

function cmdPublish(rawArgs: readonly string[]): number {
  const { flags, positionals } = parseFlagsAndPositionals(rawArgs)
  const modRelDir = resolveDefaultOrExplicitMod(positionals, 'publish')
  return runModlockSync(['publish', ...flags, modRelDir])
}

function toDisplayName(slug: string): string {
  return slug
    .split('_')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

function cmdNew(rawArgs: readonly string[]): number {
  const { positionals } = parseFlagsAndPositionals(rawArgs)
  const slug = positionals[0]?.trim().replace(/-/g, '_')
  if (!slug || !/^[a-z][a-z0-9_]*$/.test(slug)) {
    console.error(
      'Usage: .\\mod new <slug>  (lowercase letters, numbers, and underscores/hyphens only, e.g. arena_brawl)',
    )
    return 1
  }
  const modDir = path.join(REPO_ROOT, 'mods', slug)
  if (fs.existsSync(modDir)) {
    console.error(`Directory already exists: mods/${slug}`)
    return 1
  }

  fs.mkdirSync(modDir, { recursive: true })
  const displayName = toDisplayName(slug)
  const hyphenSlug = slug.replace(/_/g, '-')

  const manifest = {
    slug: hyphenSlug,
    name: displayName,
    version: '0.1.0',
    description: `${displayName} custom Deadlock game mode built on the shared workspace layers.`,
    language: 'LANGUAGE_TYPESCRIPT',
    map: 'dl_midtown',
    definitions: [],
    settings: [],
    metrics: [],
  }
  fs.writeFileSync(path.join(modDir, 'mod.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8')

  const tsconfig = {
    extends: '../../tsconfig.base.json',
    compilerOptions: {
      paths: {
        modlock: ['./node_modules/modlock/index.d.ts'],
        'modlock/*': ['./node_modules/modlock/*'],
        '@base': ['../../base/index.ts'],
        '@base/*': ['../../base/*'],
        '@engine': ['../../engine/index.ts'],
        '@engine/*': ['../../engine/*'],
        '@ui': ['../../ui/index.ts'],
        '@ui/*': ['../../ui/*'],
        '@components/*': ['../../components/*'],
      },
    },
    exclude: ['build', 'node_modules', '**/*_test.ts', '**/*.test.ts'],
  }
  fs.writeFileSync(
    path.join(modDir, 'tsconfig.json'),
    JSON.stringify(tsconfig, null, 2) + '\n',
    'utf8',
  )

  const starterMain = `import { log, onInit, onPlayerJoined, toast } from 'modlock'

import { formatMatchClock } from '@base'

onInit(() => {
  log('${displayName} initialized')
})

onPlayerJoined((ev) => {
  toast(ev.player, '${displayName} ready (' + formatMatchClock(0) + ')')
})
`
  fs.writeFileSync(path.join(modDir, 'main.ts'), starterMain, 'utf8')
  console.log(`Created new mod workspace at mods/${slug}`)
  console.log(`Next steps:`)
  console.log(`  .\\mod build ${slug}`)
  console.log(`  .\\mod ${slug}`)
  return 0
}

function printUsage(): void {
  const mods = listAvailableMods()
  console.log(`Usage:
  PowerShell / CMD:  .\\mod <command|mod> [args]
  Git Bash / POSIX:  ./tools/mod.sh <command|mod> [args]

Commands:
  list, ls                           List all mods under mods/*/mod.json
  dev [<mod>] [--cheats] [...flags]  Run modlock dev with shared-layer watch relay
  play [<mod>] [--lobby|--host]      Run modlock play with shared-layer watch relay
  build [<mod>|--all] [--release]    Build one mod or every mod under mods/
  test [<pattern>]                   Run Node unit/integration tests + tsgo typechecks
  probe [<mod>]                      Run headless Modlock Probe self-test
  publish [<mod>] [...flags]         Run modlock publish for mods/<mod>
  new <slug>                         Scaffold a new mod under mods/<slug>

Shorthand:
  .\\mod <mod> [--cheats] [...flags] Same as .\\mod dev <mod> ... (e.g. .\\mod td --cheats)
  --cheats                           Convenience alias for --arg dev (dev & play)
  Available mods:                    ${mods.join(', ') || '(none)'}`)
}

function main(): void {
  const [, , command, ...rest] = process.argv
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printUsage()
    process.exit(0)
  }

  try {
    let code = 0
    switch (command) {
      case 'list':
      case 'ls':
        code = cmdList()
        break
      case 'build':
        code = cmdBuild(rest)
        break
      case 'test':
        code = cmdTest(rest)
        break
      case 'probe':
        code = cmdProbe(rest)
        break
      case 'dev':
        runWatchedModlockSubcommand('dev', rest)
        return
      case 'play':
        runWatchedModlockSubcommand('play', rest)
        return
      case 'publish':
        code = cmdPublish(rest)
        break
      case 'new':
        code = cmdNew(rest)
        break
      default: {
        if (tryResolveModRelDir(command)) {
          runWatchedModlockSubcommand('dev', [command, ...rest])
          return
        }
        console.error(`Unknown command or mod: ${command}`)
        printUsage()
        code = 1
      }
    }
    process.exit(code)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(msg)
    process.exit(1)
  }
}

const isDirectCliEntry =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectCliEntry) {
  main()
}
