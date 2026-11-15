import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  extractGameInfoMarkerBlock,
  finalizeGameInfoAfterModlock,
  parseTasklistCsvHasImage,
  prepareGameInfoForModlock,
  removeGameInfoMarkerBlock,
  resolveHyperlineExecutablePath,
  restoreHyperlineStartupBlock,
} from '../tools/mod.ts'

const SAMPLE_HYPERLINE_CRLF =
  '\t\t\t// HYPERLINE STARTUP BEGIN\r\n' +
  '\t\t\tGame\t\t\tcitadel/hyperline/abcdef01\r\n' +
  '\t\t\tMod\t\t\t"citadel"\r\n' +
  '\t\t\tWrite\t\t\t"citadel"\r\n' +
  '\t\t\t// HYPERLINE STARTUP END\r\n'

const SAMPLE_HYPERLINE_PANORAMA_CRLF =
  '\t\t\t// HYPERLINE PANORAMA BEGIN\r\n' +
  '\t\t\tGame\t\t\tcitadel/hyperline/99999999\r\n' +
  '\t\t\t// HYPERLINE PANORAMA END\r\n'

const SAMPLE_MODLOCK_CRLF =
  '\t\t\t// MODLOCK DEV BEGIN\r\n' +
  '\t\t\tGame\t\t\tcitadel/modlock_dev/61e9450b1e9aa99a\r\n' +
  '\t\t\tMod\t\t\t"citadel"\r\n' +
  '\t\t\tWrite\t\t\t"citadel"\r\n' +
  '\t\t\t// MODLOCK DEV END\r\n'

function makeSearchPathsDoc(body: string, eol: '\r\n' | '\n'): string {
  return [
    '\tFileSystem',
    '\t{',
    '\t\tSearchPaths',
    '\t\t{',
    '\t\t\tMod\t\t\t\tcitadel',
    '\t\t\tWrite\t\t\t\tcitadel',
    body.replace(/\r?\n$/, ''),
    '\t\t\tGame\t\t\t\tcitadel/mods',
    '\t\t\tGame\t\t\t\tcitadel',
    '\t\t\tGame\t\t\t\tcore',
    '\t\t}',
    '\t}',
  ]
    .filter((line) => line.length > 0)
    .join(eol) + eol
}

describe('Mod CLI Wrapper — gameinfo.gi & Hyperline Lifecycle Helpers', () => {
  it('extracts and strips stale MODLOCK DEV and HYPERLINE STARTUP blocks cleanly (CRLF & LF)', () => {
    const combinedCrlf = makeSearchPathsDoc(
      `${SAMPLE_HYPERLINE_CRLF}${SAMPLE_MODLOCK_CRLF}`,
      '\r\n',
    )
    assert.equal(
      extractGameInfoMarkerBlock(combinedCrlf, 'HYPERLINE STARTUP'),
      SAMPLE_HYPERLINE_CRLF,
    )
    assert.equal(
      extractGameInfoMarkerBlock(combinedCrlf, 'MODLOCK DEV'),
      SAMPLE_MODLOCK_CRLF,
    )

    let stripped = removeGameInfoMarkerBlock(combinedCrlf, 'MODLOCK DEV')
    stripped = removeGameInfoMarkerBlock(stripped, 'HYPERLINE STARTUP')
    assert.equal(stripped, makeSearchPathsDoc('', '\r\n'))

    const combinedLf = combinedCrlf.replace(/\r\n/g, '\n')
    let strippedLf = removeGameInfoMarkerBlock(combinedLf, 'MODLOCK DEV')
    strippedLf = removeGameInfoMarkerBlock(strippedLf, 'HYPERLINE STARTUP')
    assert.equal(strippedLf, makeSearchPathsDoc('', '\n'))
  })

  it('prepares gameinfo.gi by removing MODLOCK DEV & HYPERLINE STARTUP while keeping HYPERLINE PANORAMA, then restores cleanly on finalize', () => {
    const initialCrlf = makeSearchPathsDoc(
      `${SAMPLE_HYPERLINE_CRLF}${SAMPLE_MODLOCK_CRLF}${SAMPLE_HYPERLINE_PANORAMA_CRLF}`,
      '\r\n',
    )
    const preparedCrlf = prepareGameInfoForModlock(initialCrlf)
    assert.equal(preparedCrlf.changed, true)
    assert.equal(preparedCrlf.savedHyperlineBlock, SAMPLE_HYPERLINE_CRLF)
    assert.equal(preparedCrlf.content, makeSearchPathsDoc(SAMPLE_HYPERLINE_PANORAMA_CRLF, '\r\n'))

    // Simulate modlock mounting MODLOCK DEV at the top during the session, then finalize.
    const duringRunCrlf = makeSearchPathsDoc(
      `${SAMPLE_MODLOCK_CRLF}${SAMPLE_HYPERLINE_PANORAMA_CRLF}`,
      '\r\n',
    )
    const finalizedCrlf = finalizeGameInfoAfterModlock(
      duringRunCrlf,
      preparedCrlf.savedHyperlineBlock,
    )
    assert.equal(finalizedCrlf.changed, true)
    assert.equal(
      finalizedCrlf.content,
      makeSearchPathsDoc(`${SAMPLE_HYPERLINE_CRLF}${SAMPLE_HYPERLINE_PANORAMA_CRLF}`, '\r\n'),
    )

    const idempotent = finalizeGameInfoAfterModlock(
      finalizedCrlf.content,
      preparedCrlf.savedHyperlineBlock,
    )
    assert.equal(idempotent.changed, false)
    assert.equal(idempotent.content, finalizedCrlf.content)

    // Verify LF endings as well.
    const initialLf = initialCrlf.replace(/\r\n/g, '\n')
    const preparedLf = prepareGameInfoForModlock(initialLf)
    assert.equal(preparedLf.changed, true)
    assert.equal(preparedLf.savedHyperlineBlock, SAMPLE_HYPERLINE_CRLF.replace(/\r\n/g, '\n'))
    const finalizedLf = finalizeGameInfoAfterModlock(
      preparedLf.content,
      preparedLf.savedHyperlineBlock,
    )
    assert.equal(finalizedLf.changed, true)
    assert.equal(
      finalizedLf.content,
      makeSearchPathsDoc(
        `${SAMPLE_HYPERLINE_CRLF.replace(/\r\n/g, '\n')}${SAMPLE_HYPERLINE_PANORAMA_CRLF.replace(/\r\n/g, '\n')}`,
        '\n',
      ),
    )
  })

  it('restores saved HYPERLINE STARTUP block below Write citadel on exit and skips if already present', () => {
    const cleanCrlf = makeSearchPathsDoc('', '\r\n')
    const restored = restoreHyperlineStartupBlock(cleanCrlf, SAMPLE_HYPERLINE_CRLF)
    assert.equal(restored.changed, true)
    assert.equal(restored.content, makeSearchPathsDoc(SAMPLE_HYPERLINE_CRLF, '\r\n'))

    const alreadyPresent = restoreHyperlineStartupBlock(
      restored.content,
      SAMPLE_HYPERLINE_CRLF,
    )
    assert.equal(alreadyPresent.changed, false)
    assert.equal(alreadyPresent.content, restored.content)

    const cleanLf = makeSearchPathsDoc('', '\n')
    const sampleHyperlineLf = SAMPLE_HYPERLINE_CRLF.replace(/\r\n/g, '\n').replace(/\n$/, '')
    const restoredLf = restoreHyperlineStartupBlock(cleanLf, sampleHyperlineLf)
    assert.equal(restoredLf.changed, true)
    assert.equal(
      restoredLf.content,
      makeSearchPathsDoc(sampleHyperlineLf, '\n'),
    )
  })

  it('parses Windows tasklist CSV output accurately by exact image name', () => {
    assert.equal(
      parseTasklistCsvHasImage(
        '"Hyperline.exe","1608","Console","1","142,300 K"\r\n',
        'hyperline.exe',
      ),
      true,
    )
    assert.equal(
      parseTasklistCsvHasImage(
        'INFO: No tasks are running which match the specified criteria.\r\n',
        'hyperline.exe',
      ),
      false,
    )
    assert.equal(parseTasklistCsvHasImage('', 'hyperline.exe'), false)
    assert.equal(
      parseTasklistCsvHasImage(
        '"hyperline-core.exe","30920","Console","1","45,100 K"\r\n',
        'hyperline.exe',
      ),
      false,
    )
  })

  it('resolves Hyperline executable path from LOCALAPPDATA or running fallback query', () => {
    const tmpRoot = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '_tmp_mod_cli_hyperline_path',
    )
    try {
      const localAppDataExe = path.join(tmpRoot, 'local', 'Programs', 'Hyperline', 'hyperline.exe')
      const fallbackExe = path.join(tmpRoot, 'custom', 'hyperline.exe')
      fs.mkdirSync(path.dirname(localAppDataExe), { recursive: true })
      fs.mkdirSync(path.dirname(fallbackExe), { recursive: true })
      fs.writeFileSync(localAppDataExe, 'stub', 'utf8')
      fs.writeFileSync(fallbackExe, 'stub', 'utf8')

      let fallbackCalled = false
      assert.equal(
        resolveHyperlineExecutablePath(
          { LOCALAPPDATA: path.join(tmpRoot, 'local') },
          () => {
            fallbackCalled = true
            return fallbackExe
          },
        ),
        localAppDataExe,
      )
      assert.equal(fallbackCalled, false)

      assert.equal(
        resolveHyperlineExecutablePath(
          { LOCALAPPDATA: path.join(tmpRoot, 'missing') },
          () => `  ${fallbackExe}  \r\n`,
        ),
        fallbackExe,
      )

      assert.equal(
        resolveHyperlineExecutablePath(
          { LOCALAPPDATA: path.join(tmpRoot, 'missing') },
          () => path.join(tmpRoot, 'missing', 'hyperline.exe'),
        ),
        undefined,
      )
      assert.equal(resolveHyperlineExecutablePath({}), undefined)
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true })
    }
  })
})
