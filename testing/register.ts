import fs from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createMockModlockEsmSource, mockHost } from './mock_modlock_host.ts'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MOCK_SOURCE = createMockModlockEsmSource()

// Ensure singleton mock host is bound before any test module imports `'modlock'`.
void mockHost

const ALIAS_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ['@base/', 'base/'],
  ['@engine/', 'engine/'],
  ['@ui/', 'ui/'],
  ['@components/', 'components/'],
  ['@testing/', 'testing/'],
]

const EXACT_ALIASES: Readonly<Record<string, string>> = {
  '@base': 'base/index.ts',
  '@engine': 'engine/index.ts',
  '@ui': 'ui/index.ts',
}

function resolveOnDisk(candidate: string): string | undefined {
  if (fs.existsSync(candidate) && !fs.existsSync(candidate + '/__dir_probe__')) {
    // Only return exact file if it is not a directory
    try {
      fs.readdirSync(candidate)
    } catch {
      return candidate
    }
  }
  for (const ext of ['.ts', '.tsx']) {
    const withExt = `${candidate}${ext}`
    if (fs.existsSync(withExt)) {
      return withExt
    }
  }
  const indexTs = path.join(candidate, 'index.ts')
  if (fs.existsSync(indexTs)) {
    return indexTs
  }
  return undefined
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'modlock') {
      return { url: 'modlock:mock', shortCircuit: true }
    }

    if (Object.prototype.hasOwnProperty.call(EXACT_ALIASES, specifier)) {
      const target = path.join(REPO_ROOT, EXACT_ALIASES[specifier])
      return { url: pathToFileURL(target).href, shortCircuit: true }
    }

    for (const [prefix, relDir] of ALIAS_PREFIXES) {
      if (specifier.startsWith(prefix)) {
        const sub = specifier.slice(prefix.length)
        const resolved = resolveOnDisk(path.join(REPO_ROOT, relDir, sub))
        if (resolved) {
          return { url: pathToFileURL(resolved).href, shortCircuit: true }
        }
      }
    }

    if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      context.parentURL?.startsWith('file://')
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL))
      const resolved = resolveOnDisk(path.resolve(parentDir, specifier))
      if (resolved) {
        return { url: pathToFileURL(resolved).href, shortCircuit: true }
      }
    }

    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url === 'modlock:mock') {
      return {
        format: 'module',
        source: MOCK_SOURCE,
        shortCircuit: true,
      }
    }
    return nextLoad(url, context)
  },
})
