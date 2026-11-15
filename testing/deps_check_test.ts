import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { ALL_STANDARD_ENGINE_DEFINITIONS } from '@engine/modifier_definitions'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const IGNORED_DIRS = new Set(['build', 'node_modules', '.modlock', '.git'])

function collectSourceFiles(relRoot: string): string[] {
  const absRoot = path.join(REPO_ROOT, relRoot)
  if (!fs.existsSync(absRoot)) {
    return []
  }
  const results: string[] = []
  const stack: string[] = [absRoot]
  while (stack.length > 0) {
    const dir = stack.pop()!
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED_DIRS.has(entry.name)) {
        continue
      }
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        results.push(full)
      }
    }
  }
  return results.sort()
}

interface ParsedImport {
  readonly specifier: string
  readonly isTypeOnly: boolean
  readonly statement: string
}

function parseImports(source: string): ParsedImport[] {
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
  const out: ParsedImport[] = []

  const staticRe =
    /(?:^|\n)\s*(import|export)\s+(type\b)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g
  for (const m of stripped.matchAll(staticRe)) {
    const typeKeyword = Boolean(m[2])
    const body = m[3].trim()
    let allInlineTypes = false
    if (!typeKeyword && body.startsWith('{') && body.endsWith('}')) {
      const items = body
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      allInlineTypes =
        items.length > 0 && items.every((item) => /^type\s+/.test(item))
    }
    out.push({
      specifier: m[4],
      isTypeOnly: typeKeyword || allInlineTypes,
      statement: m[0].trim(),
    })
  }

  const dynRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  for (const m of stripped.matchAll(dynRe)) {
    out.push({
      specifier: m[1],
      isTypeOnly: false,
      statement: m[0].trim(),
    })
  }

  return out
}

function getLayerKey(relUnix: string): string {
  const parts = relUnix.split('/')
  if (parts[0] === 'components' || parts[0] === 'mods') {
    return `${parts[0]}/${parts[1]}`
  }
  return parts[0]
}

function validateSpecifier(
  relUnix: string,
  layerKey: string,
  isTestFile: boolean,
  imp: ParsedImport,
): string | undefined {
  const { specifier, isTypeOnly } = imp

  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const absFile = path.join(REPO_ROOT, relUnix)
    const resolvedRel = path
      .relative(REPO_ROOT, path.resolve(path.dirname(absFile), specifier))
      .replace(/\\/g, '/')
    const resolvedLayer = getLayerKey(resolvedRel)
    if (resolvedLayer !== layerKey) {
      return `cross-layer relative import "${specifier}" escapes ${layerKey} -> ${resolvedLayer}; use layer alias`
    }
    return undefined
  }

  if (
    isTestFile &&
    (specifier.startsWith('node:') ||
      specifier === '@testing' ||
      specifier.startsWith('@testing/') ||
      specifier === `@${layerKey}` ||
      specifier.startsWith(`@${layerKey}/`))
  ) {
    return undefined
  }

  if (layerKey === 'base') {
    if (specifier === 'modlock') {
      return isTypeOnly
        ? undefined
        : `base/ must use type-only imports from 'modlock', found runtime import "${imp.statement}"`
    }
    return `base/ cannot import "${specifier}"`
  }

  if (layerKey === 'engine') {
    if (
      specifier === 'modlock' ||
      specifier === '@base' ||
      specifier.startsWith('@base/')
    ) {
      return undefined
    }
    return `engine/ cannot import "${specifier}"`
  }

  if (layerKey === 'ui') {
    if (
      specifier === 'modlock' ||
      specifier === '@base' ||
      specifier.startsWith('@base/') ||
      specifier === '@engine' ||
      specifier.startsWith('@engine/') ||
      specifier === '@components/scores' ||
      specifier.startsWith('@components/scores/')
    ) {
      return undefined
    }
    return `ui/ cannot import "${specifier}" (only modlock, @base, @engine, @components/scores)`
  }

  if (layerKey.startsWith('components/')) {
    if (
      specifier === 'modlock' ||
      specifier === '@base' ||
      specifier.startsWith('@base/') ||
      specifier === '@engine' ||
      specifier.startsWith('@engine/')
    ) {
      return undefined
    }
    if (isTestFile && specifier.startsWith(`@${layerKey}`)) {
      return undefined
    }
    return `${layerKey}/ cannot import "${specifier}" (no @ui, mods, or sibling @components/*)`
  }

  if (layerKey.startsWith('mods/')) {
    if (
      specifier === 'modlock' ||
      specifier === '@base' ||
      specifier.startsWith('@base/') ||
      specifier === '@engine' ||
      specifier.startsWith('@engine/') ||
      specifier === '@ui' ||
      specifier.startsWith('@ui/') ||
      specifier.startsWith('@components/')
    ) {
      return undefined
    }
    return `${layerKey}/ cannot import "${specifier}"`
  }

  return undefined
}

describe('Chromium Architecture DEPS & Hygienes', () => {
  it('enforces the 5-layer DEPS dependency matrix and forbids cross-layer relative jumps', () => {
    const violations: string[] = []
    for (const rootDir of ['base', 'engine', 'ui', 'components', 'mods']) {
      for (const absFile of collectSourceFiles(rootDir)) {
        const relUnix = path.relative(REPO_ROOT, absFile).replace(/\\/g, '/')
        const layerKey = getLayerKey(relUnix)
        const isTestFile = /(?:_test|\.test)\.ts$/.test(relUnix)
        const imports = parseImports(fs.readFileSync(absFile, 'utf8'))
        for (const imp of imports) {
          const err = validateSpecifier(relUnix, layerKey, isTestFile, imp)
          if (err) {
            violations.push(`${relUnix}: ${err}`)
          }
        }
      }
    }
    assert.deepEqual(violations, [], `Architecture DEPS violations:\n${violations.join('\n')}`)
  })

  it('keeps mods/deadlock_td/mod.json definitions synchronized with ALL_STANDARD_ENGINE_DEFINITIONS', () => {
    const manifestPath = path.join(REPO_ROOT, 'mods', 'deadlock_td', 'mod.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      definitions?: unknown
    }
    assert.deepEqual(manifest.definitions, ALL_STANDARD_ENGINE_DEFINITIONS)
  })

  it('keeps all modular source, test, and tool files free of forbidden legacy packaging tokens', () => {
    const forbiddenTokens = ['vp' + 'k', 'pak' + '20', 'add' + 'on']
    const forbiddenRe = new RegExp(`(${forbiddenTokens.join('|')})`, 'i')
    const hits: string[] = []

    const files = [
      ...collectSourceFiles('base'),
      ...collectSourceFiles('engine'),
      ...collectSourceFiles('ui'),
      ...collectSourceFiles('components'),
      ...collectSourceFiles('mods'),
      ...collectSourceFiles('testing'),
      ...collectSourceFiles('tools'),
    ]

    for (const absFile of files) {
      if (!fs.existsSync(absFile)) continue
      const lines = fs.readFileSync(absFile, 'utf8').split(/\r?\n/)
      lines.forEach((line, idx) => {
        if (forbiddenRe.test(line)) {
          const relUnix = path.relative(REPO_ROOT, absFile).replace(/\\/g, '/')
          hits.push(`${relUnix}:${idx + 1}: ${line.trim()}`)
        }
      })
    }

    assert.deepEqual(hits, [], `Found forbidden packaging terms:\n${hits.join('\n')}`)
  })

  it('keeps cross-platform mod CLI wrapper scripts present at mod.cmd and tools/mod.sh', () => {
    assert.equal(fs.existsSync(path.join(REPO_ROOT, 'mod.cmd')), true, 'Missing root mod.cmd')
    assert.equal(
      fs.existsSync(path.join(REPO_ROOT, 'tools', 'mod.sh')),
      true,
      'Missing tools/mod.sh',
    )
  })
})
