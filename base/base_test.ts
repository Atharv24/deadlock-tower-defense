import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  canExecuteDevCommand,
  canPlayerRestartActiveMatch,
  clamp,
  computeAimAngles,
  DEV_COMMAND_NAMES,
  distance3D,
  EMPTY_SERVER_SHUTDOWN_DELAY_SECONDS,
  type EmptyServerWatchState,
  evaluateEmptyServerShutdown,
  flatDistance2D,
  formatMatchClock,
  formatSoulsCount,
  formatTomeCountDisplay,
  hasClockSteppedBackward,
  isLocalDevModeArgs,
  parseSlashCommandLine,
  runTimerSafely,
  worldMoveToDriveAxes,
} from '@base'

describe('Base Layer — Math, Format, Commands, Clock & Shutdown Watch', () => {
  it('parses Team Chat and All-Chat slash commands cleanly', () => {
    assert.deepEqual(parseSlashCommandLine('/boss'), { name: 'boss', args: '' })
    assert.deepEqual(parseSlashCommandLine('  /BOON   2  '), {
      name: 'boon',
      args: '2',
    })
    assert.deepEqual(parseSlashCommandLine('/hero Seven'), {
      name: 'hero',
      args: 'Seven',
    })
    assert.equal(parseSlashCommandLine('hello team'), undefined)
    assert.equal(parseSlashCommandLine('/'), undefined)
    assert.equal(parseSlashCommandLine('/   '), undefined)
  })

  it('auto-resets hosted server to idle after 3s flush grace and auto-quits only in local --arg dev mode (#33, v0.7.5)', () => {
    assert.equal(EMPTY_SERVER_SHUTDOWN_DELAY_SECONDS, 3)

    const state: EmptyServerWatchState = {
      hasSeenHuman: false,
      emptySinceSeconds: undefined,
      quitIssued: false,
    }

    // Cold server startup (0..60s before first human joins) must NEVER trigger quit or reset
    const coldCheck = evaluateEmptyServerShutdown(state, 0, 60, false)
    assert.equal(coldCheck.shouldQuit, false)
    assert.equal(coldCheck.shouldResetMatch, false)
    assert.equal(coldCheck.nextState.hasSeenHuman, false)

    // First human joins at t=65s
    const joined = evaluateEmptyServerShutdown(coldCheck.nextState, 1, 65, false)
    assert.equal(joined.shouldQuit, false)
    assert.equal(joined.shouldResetMatch, false)
    assert.equal(joined.nextState.hasSeenHuman, true)
    assert.equal(joined.nextState.emptySinceSeconds, undefined)

    // Probe mode bypasses shutdown & reset
    const probeCheck = evaluateEmptyServerShutdown(joined.nextState, 0, 100, true)
    assert.equal(probeCheck.shouldQuit, false)
    assert.equal(probeCheck.shouldResetMatch, false)

    // 1. Hosted mode (allowProcessQuit=false, default): waits 3s flush grace, then emits shouldResetMatch=true ONCE without calling quit!
    const disconnectStart = evaluateEmptyServerShutdown(joined.nextState, 0, 100, false)
    assert.equal(disconnectStart.shouldQuit, false)
    assert.equal(disconnectStart.shouldResetMatch, false)
    assert.equal(disconnectStart.nextState.emptySinceSeconds, 100)

    const beforeGrace = evaluateEmptyServerShutdown(disconnectStart.nextState, 0, 102.9, false)
    assert.equal(beforeGrace.shouldQuit, false)
    assert.equal(beforeGrace.shouldResetMatch, false)

    const afterGraceHosted = evaluateEmptyServerShutdown(beforeGrace.nextState, 0, 103, false)
    assert.equal(afterGraceHosted.shouldQuit, false)
    assert.equal(afterGraceHosted.shouldResetMatch, true)
    assert.equal(afterGraceHosted.nextState.hasSeenHuman, false)
    assert.equal(afterGraceHosted.nextState.emptySinceSeconds, undefined)
    assert.equal(afterGraceHosted.nextState.quitIssued, false)

    // Subsequent empty ticks stay idle at Wave 0 without looping reset or quit
    const afterHostedReset = evaluateEmptyServerShutdown(
      afterGraceHosted.nextState,
      0,
      104,
      false,
    )
    assert.equal(afterHostedReset.shouldQuit, false)
    assert.equal(afterHostedReset.shouldResetMatch, false)
    assert.equal(afterHostedReset.nextState.hasSeenHuman, false)

    // Explicit 0s custom delay also works immediately (hosted -> reset, local dev -> quit)
    const zeroDelayHosted = evaluateEmptyServerShutdown(joined.nextState, 0, 100, false, 0, false)
    assert.equal(zeroDelayHosted.shouldQuit, false)
    assert.equal(zeroDelayHosted.shouldResetMatch, true)

    const zeroDelayQuit = evaluateEmptyServerShutdown(joined.nextState, 0, 100, false, 0, true)
    assert.equal(zeroDelayQuit.shouldQuit, true)
    assert.equal(zeroDelayQuit.shouldResetMatch, false)
    assert.equal(zeroDelayQuit.nextState.quitIssued, true)

    // 2. Local --arg dev mode (allowProcessQuit=true): optional custom delay (30s) cancels on reconnect and quits once at 30s
    const delayedStart = evaluateEmptyServerShutdown(joined.nextState, 0, 100, false, 30, true)
    assert.equal(delayedStart.shouldQuit, false)
    assert.equal(delayedStart.shouldResetMatch, false)
    assert.equal(delayedStart.nextState.emptySinceSeconds, 100)

    const reconnected = evaluateEmptyServerShutdown(delayedStart.nextState, 1, 120, false, 30, true)
    assert.equal(reconnected.shouldQuit, false)
    assert.equal(reconnected.shouldResetMatch, false)
    assert.equal(reconnected.nextState.emptySinceSeconds, undefined)

    const delayedAgain = evaluateEmptyServerShutdown(reconnected.nextState, 0, 200, false, 30, true)
    assert.equal(delayedAgain.shouldQuit, false)
    assert.equal(delayedAgain.nextState.emptySinceSeconds, 200)

    const at29s = evaluateEmptyServerShutdown(delayedAgain.nextState, 0, 229, false, 30, true)
    assert.equal(at29s.shouldQuit, false)

    const at30s = evaluateEmptyServerShutdown(at29s.nextState, 0, 230, false, 30, true)
    assert.equal(at30s.shouldQuit, true)
    assert.equal(at30s.shouldResetMatch, false)
    assert.equal(at30s.nextState.quitIssued, true)

    const afterDelayedQuit = evaluateEmptyServerShutdown(at30s.nextState, 0, 231, false, 30, true)
    assert.equal(afterDelayedQuit.shouldQuit, false)
    assert.equal(afterDelayedQuit.shouldResetMatch, false)
  })

  it('transforms world movement into yaw-relative (forward, left) axes so Bosses march south even while aiming 180° north', () => {
    // Aiming North (+90°) at a kiting player while moving South (0, -1): forward = -1 (backpedal south), left = 0
    const backpedalSouth = worldMoveToDriveAxes(0, -1, 90)
    assert.ok(Math.abs(backpedalSouth.forward - -1) < 1e-6)
    assert.ok(Math.abs(backpedalSouth.left) < 1e-6)

    // Aiming South (-90°) while strafing East (+1, 0): forward = 0, left = +1
    const strafeEast = worldMoveToDriveAxes(1, 0, -90)
    assert.ok(Math.abs(strafeEast.forward) < 1e-6)
    assert.ok(Math.abs(strafeEast.left - 1) < 1e-6)

    // Aiming upward reduces pitch (negative in Source 2); aiming downward increases pitch (positive)
    const upAngles = computeAimAngles({ x: 0, y: 0, z: 256 }, { x: 0, y: -300, z: 388 })
    assert.ok(upAngles.pitch < -15)
    assert.ok(Math.abs(upAngles.yaw - -90) < 1e-4)
  })

  it('disables dev commands by default, enables dev commands only with --arg dev + developer role, and protects active co-op matches from mid-run restarts', () => {
    assert.deepEqual(DEV_COMMAND_NAMES, [
      'skipwave',
      'boss',
      'granttome',
      'tomescale',
      'souls',
    ])

    assert.equal(isLocalDevModeArgs([]), false)
    assert.equal(isLocalDevModeArgs(['probe']), false)
    assert.equal(isLocalDevModeArgs(['dev']), true)
    assert.equal(isLocalDevModeArgs(['probe', 'DEV']), true)

    assert.equal(
      canExecuteDevCommand({
        devModeEnabled: false,
        isBot: false,
        roles: ['developer', 'tester'],
      }),
      false,
    )
    assert.equal(
      canExecuteDevCommand({
        devModeEnabled: true,
        isBot: true,
        roles: ['developer'],
      }),
      false,
    )
    assert.equal(
      canExecuteDevCommand({
        devModeEnabled: true,
        isBot: false,
        roles: ['tester'],
      }),
      false,
    )
    assert.equal(
      canExecuteDevCommand({
        devModeEnabled: true,
        isBot: false,
        roles: ['developer'],
      }),
      true,
    )

    assert.equal(
      canPlayerRestartActiveMatch({
        matchState: 'active',
        humanPlayerCount: 2,
        isLocalDevPlayer: false,
      }),
      false,
    )
    assert.equal(
      canPlayerRestartActiveMatch({
        matchState: 'active',
        humanPlayerCount: 1,
        isLocalDevPlayer: false,
      }),
      true,
    )
    assert.equal(
      canPlayerRestartActiveMatch({
        matchState: 'defeat',
        humanPlayerCount: 4,
        isLocalDevPlayer: false,
      }),
      true,
    )
    assert.equal(
      canPlayerRestartActiveMatch({
        matchState: 'active',
        humanPlayerCount: 4,
        isLocalDevPlayer: true,
      }),
      true,
    )
  })

  it('formats Souls, Match Clock, and Tome tallies deterministically without locale drift', () => {
    assert.equal(formatSoulsCount(0), '0')
    assert.equal(formatSoulsCount(9600), '9,600')
    assert.equal(formatSoulsCount(1234567), '1,234,567')
    assert.equal(formatSoulsCount(-1250), '-1,250')

    assert.equal(formatMatchClock(0), '00:00')
    assert.equal(formatMatchClock(65), '01:05')
    assert.equal(formatMatchClock(3661), '1:01:01')

    assert.equal(formatTomeCountDisplay(0), '0')
    assert.equal(formatTomeCountDisplay(3), '3')
    assert.equal(formatTomeCountDisplay(2.600001), '2.6')
    assert.equal(clamp(15, 0, 10), 10)
    assert.equal(distance3D({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 12 }), 13)
  })

  it('detects backward server clock jumps and self-heals respawn/shutdown watches', () => {
    assert.equal(hasClockSteppedBackward(180.0, 0.015), true)
    assert.equal(hasClockSteppedBackward(10.0, 10.0), false)
    assert.equal(hasClockSteppedBackward(10.0, 9.98), false)
    assert.equal(hasClockSteppedBackward(10.0, 9.5), true)

    const emptyReset = evaluateEmptyServerShutdown(
      { hasSeenHuman: true, emptySinceSeconds: 180.0, quitIssued: false },
      0,
      0.5,
      false,
    )
    assert.equal(emptyReset.shouldQuit, false)
    assert.equal(emptyReset.shouldResetMatch, false)
    assert.equal(emptyReset.nextState.emptySinceSeconds, 0.5)
    const emptyHostedDue = evaluateEmptyServerShutdown(
      emptyReset.nextState,
      0,
      3.6,
      false,
    )
    assert.equal(emptyHostedDue.shouldQuit, false)
    assert.equal(emptyHostedDue.shouldResetMatch, true)
    assert.equal(emptyHostedDue.nextState.hasSeenHuman, false)

    const emptyDevDue = evaluateEmptyServerShutdown(
      emptyReset.nextState,
      0,
      3.6,
      false,
      EMPTY_SERVER_SHUTDOWN_DELAY_SECONDS,
      true,
    )
    assert.equal(emptyDevDue.shouldQuit, true)
    assert.equal(emptyDevDue.shouldResetMatch, false)
  })

  it('guards repeating timer callbacks with runTimerSafely without swallowing normal execution', () => {
    let ran = 0
    const logs: string[] = []
    runTimerSafely('ok-timer', () => {
      ran += 1
    }, (msg) => logs.push(msg))
    assert.equal(ran, 1)
    assert.equal(logs.length, 0)

    runTimerSafely('failing-timer', () => {
      throw new Error('boom')
    }, (msg) => logs.push(msg))
    assert.equal(logs.length, 1)
    assert.match(logs[0], /Timer \[failing-timer\] error:.*boom/)
  })
})
