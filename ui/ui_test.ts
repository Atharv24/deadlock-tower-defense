import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  evaluateNativeShopHudSync,
  HudStateStore,
  INITIAL_NATIVE_SHOP_HUD_STATE,
  needsImmediateNativeShopWake,
  SHOP_CLOSE_HUD_RESTORE_DELAY_SECONDS,
  SHOP_CLOSE_HUD_SETTLE_RESET_SECONDS,
  SHOP_CLOSE_SECOND_PULSE_START_SECONDS,
  shouldFreeHudCursor,
  shouldPushHudUpdate,
} from '@ui'

describe('UI Layer — HudStateStore, Cursor/Throttle & Native Buy Menu Sync', () => {
  it('frees HUD cursor when Legendary Armory is open without stealing cursor for Boons', () => {
    assert.equal(
      shouldFreeHudCursor({
        needsHeroPick: false,
        hasPendingBoons: true,
        legendaryShopOpen: false,
        matchState: 'active',
      }),
      false,
    )
    assert.equal(
      shouldFreeHudCursor({
        needsHeroPick: false,
        hasPendingBoons: false,
        legendaryShopOpen: true,
        matchState: 'active',
      }),
      true,
    )
    assert.equal(
      shouldFreeHudCursor({
        needsHeroPick: false,
        hasPendingBoons: false,
        legendaryShopOpen: false,
        leaderboardOpen: true,
        matchState: 'active',
      }),
      true,
    )
  })

  it('throttles HUD pushes to <=2 Hz unless modal state changes or clock steps backward', () => {
    assert.equal(
      shouldPushHudUpdate({
        lastSig: undefined,
        nextSig: '0;1',
        lastModalSig: undefined,
        nextModalSig: 'm0',
        nowSeconds: 1,
        lastSentAtSeconds: -999,
      }),
      true,
    )
    assert.equal(
      shouldPushHudUpdate({
        lastSig: '10;1;500',
        nextSig: '10;1;500',
        lastModalSig: 'm0',
        nextModalSig: 'm0',
        nowSeconds: 10.25,
        lastSentAtSeconds: 10.0,
      }),
      false,
    )
    assert.equal(
      shouldPushHudUpdate({
        lastSig: '10;1;500',
        nextSig: '10;1;450',
        lastModalSig: 'm0',
        nextModalSig: 'm0',
        nowSeconds: 10.25,
        lastSentAtSeconds: 10.0,
      }),
      false,
    )
    assert.equal(
      shouldPushHudUpdate({
        lastSig: '10;1;500',
        nextSig: '10;1;450',
        lastModalSig: 'm0',
        nextModalSig: 'm0',
        nowSeconds: 10.5,
        lastSentAtSeconds: 10.0,
      }),
      true,
    )
    assert.equal(
      shouldPushHudUpdate({
        lastSig: '10;1;500',
        nextSig: '10;1;500;boon',
        lastModalSig: 'm0',
        nextModalSig: 'm1',
        nowSeconds: 10.1,
        lastSentAtSeconds: 10.0,
      }),
      true,
    )
    assert.equal(
      shouldPushHudUpdate({
        lastSig: '1;0;5;0',
        nextSig: '1;0;5;0',
        lastModalSig: 'm0',
        nextModalSig: 'm0',
        nowSeconds: 0.015,
        lastSentAtSeconds: 180.0,
      }),
      true,
    )
  })

  it('tracks per-slot modal/epoch/reselect/generation state cleanly inside HudStateStore', () => {
    const store = new HudStateStore()
    assert.equal(store.consumeImmediateHudSync(), true)
    assert.equal(store.consumeImmediateHudSync(), false)

    assert.equal(store.toggleLegendaryShop(0), true)
    assert.equal(store.legendaryShopSlots.has(0), true)
    assert.equal(store.toggleLeaderboard(0), true)
    assert.equal(store.legendaryShopSlots.has(0), false)
    assert.equal(store.leaderboardOpenSlots.has(0), true)

    store.markHeroSelected(0, 12.0)
    assert.equal(store.consumeHeroReselectPlacementReset(0), true)
    assert.equal(store.consumeHeroReselectPlacementReset(0), false)

    assert.equal(store.syncConnectionGeneration(0, 1), true)
    assert.equal(store.syncConnectionGeneration(0, 1), false)
    assert.equal(store.syncConnectionGeneration(0, 2), true)

    store.handleClockBackstep()
    assert.equal(store.forceAllTreeResets, true)
    assert.equal(store.consumeImmediateHudSync(), true)
  })

  it('keeps HeroPickerModal open across Steam GC auto-spawn and suppresses it on mid-run hot-reload', () => {
    const fresh = new HudStateStore()
    fresh.requireInitialHeroPickForSlot(0)
    assert.equal(fresh.isAwaitingInitialHeroPick(0), true)
    assert.equal(fresh.forceHeroPickerSlots.has(0), true)

    assert.equal(fresh.syncConnectionGeneration(0, 1), true)
    assert.equal(fresh.isAwaitingInitialHeroPick(0), true)
    assert.equal(fresh.forceHeroPickerSlots.has(0), true)

    // Steam GC auto-spawning a roster hero sets spawnedHeroSlots, but initial picker remains pending.
    fresh.spawnedHeroSlots.add(0)
    assert.equal(fresh.isAwaitingInitialHeroPick(0), true)
    assert.equal(fresh.forceHeroPickerSlots.has(0), true)

    fresh.markHeroSelected(0, 4.0)
    assert.equal(fresh.isAwaitingInitialHeroPick(0), false)
    assert.equal(fresh.forceHeroPickerSlots.has(0), false)

    // Slot 1 confirms keeping its Steam GC pre-loaded hero via closeHeroPicker().
    fresh.requireInitialHeroPickForSlot(1)
    assert.equal(fresh.syncConnectionGeneration(1, 1), true)
    fresh.spawnedHeroSlots.add(1)
    assert.equal(fresh.isAwaitingInitialHeroPick(1), true)
    fresh.closeHeroPicker(1)
    assert.equal(fresh.isAwaitingInitialHeroPick(1), false)
    assert.equal(fresh.forceHeroPickerSlots.has(1), false)

    fresh.resetForNewWorld()
    assert.equal(fresh.connectedGenerations.size, 0)
    assert.equal(fresh.spawnedHeroSlots.size, 0)
    assert.equal(fresh.initialHeroPickPendingSlots.size, 0)
    assert.equal(fresh.restoringFromHandoff, false)

    // Hot-reload with an already-spawned defender suppresses re-opening HeroPickerModal.
    const reloaded = new HudStateStore()
    reloaded.markRestoredFromHandoff([])
    assert.equal(
      reloaded.syncConnectionGeneration(0, 1, { suppressInitialHeroPick: true }),
      true,
    )
    assert.equal(reloaded.isAwaitingInitialHeroPick(0), false)
    assert.equal(reloaded.forceHeroPickerSlots.has(0), false)

    // Hot-reload while a human was still picking preserves their pending initial hero pick.
    const stillPickingReloaded = new HudStateStore()
    stillPickingReloaded.markRestoredFromHandoff([0])
    assert.equal(
      stillPickingReloaded.syncConnectionGeneration(0, 1, { suppressInitialHeroPick: false }),
      true,
    )
    assert.equal(stillPickingReloaded.isAwaitingInitialHeroPick(0), true)
    assert.equal(stillPickingReloaded.forceHeroPickerSlots.has(0), true)
    assert.deepEqual(stillPickingReloaded.exportAwaitingHeroPickSlots(), [0])
  })
})

describe('Native Buy Menu Panorama HUD Collapse & Restore Sync (v0.7.4)', () => {
  it('stays completely idle with zero wake-ups when native Buy Menu has not been opened', () => {
    assert.equal(needsImmediateNativeShopWake(undefined, false, 5.0), false)
    const idle1 = evaluateNativeShopHudSync(undefined, false, 5.0)
    assert.deepEqual(idle1.nextState, INITIAL_NATIVE_SHOP_HUD_STATE)
    assert.equal(idle1.suppressShow, false)
    assert.equal(idle1.shouldHideNow, false)
    assert.equal(idle1.closeTransientModals, false)
    assert.equal(idle1.holdStockHudPulse, false)
    assert.equal(idle1.resyncCursorNow, false)
    assert.equal(idle1.bumpedEpoch, false)
    assert.equal(idle1.nextState.hudEpoch, 0)

    assert.equal(needsImmediateNativeShopWake(idle1.nextState, false, 10.0), false)
    const idle2 = evaluateNativeShopHudSync(idle1.nextState, false, 10.0)
    assert.deepEqual(idle2, idle1)
  })

  it('orchestrates hide, stock HUD pulse, 80ms fast restore with 0ms cursor lock, secondary pulse, and keyed epoch settle', () => {
    // Rising edge: opening Buy Menu hides HUD, closes transient modals, holds stock HUD pulse
    assert.equal(needsImmediateNativeShopWake(undefined, true, 8.0), true)
    const opened = evaluateNativeShopHudSync(undefined, true, 8.0)
    assert.equal(opened.suppressShow, true)
    assert.equal(opened.shouldHideNow, true)
    assert.equal(opened.closeTransientModals, true)
    assert.equal(opened.holdStockHudPulse, true)
    assert.equal(opened.resyncCursorNow, true)
    assert.equal(opened.bumpedEpoch, false)
    assert.equal(opened.nextState.wasShopOpen, true)
    assert.equal(opened.nextState.hudEpoch, 0)

    // Sustained shop open keeps suppressing show() diffs and holding stock HUD pulse without waking every frame
    assert.equal(needsImmediateNativeShopWake(opened.nextState, true, 9.25), false)
    const held = evaluateNativeShopHudSync(opened.nextState, true, 9.25)
    assert.equal(held.suppressShow, true)
    assert.equal(held.shouldHideNow, false)
    assert.equal(held.closeTransientModals, false)
    assert.equal(held.holdStockHudPulse, true)
    assert.equal(held.bumpedEpoch, false)

    // Falling edge at t=10.0: waits only 80ms before restoring HUD (zero artificial cursor lock!)
    assert.equal(needsImmediateNativeShopWake(held.nextState, false, 10.0), true)
    const justClosed = evaluateNativeShopHudSync(held.nextState, false, 10.0)
    assert.equal(justClosed.suppressShow, true)
    assert.equal(justClosed.shouldHideNow, false)
    assert.equal(justClosed.holdStockHudPulse, true)
    assert.equal(justClosed.nextState.closedAtSeconds, 10.0)

    const beforeRestore = 10.0 + SHOP_CLOSE_HUD_RESTORE_DELAY_SECONDS - 0.02
    assert.equal(
      needsImmediateNativeShopWake(justClosed.nextState, false, beforeRestore),
      false,
    )
    const stillWaiting = evaluateNativeShopHudSync(
      justClosed.nextState,
      false,
      beforeRestore,
    )
    assert.equal(stillWaiting.suppressShow, true)
    assert.equal(stillWaiting.holdStockHudPulse, true)
    assert.equal(stillWaiting.bumpedEpoch, false)

    // Past +0.08s restore delay: lifts stock HUD pulse, signals cursor modal resync if needed, bumps epoch -> 1
    const restoreTime = 10.0 + SHOP_CLOSE_HUD_RESTORE_DELAY_SECONDS + 0.02
    assert.equal(
      needsImmediateNativeShopWake(stillWaiting.nextState, false, restoreTime),
      true,
    )
    const restored = evaluateNativeShopHudSync(
      stillWaiting.nextState,
      false,
      restoreTime,
    )
    assert.equal(restored.suppressShow, false)
    assert.equal(restored.shouldHideNow, false)
    assert.equal(restored.holdStockHudPulse, false)
    assert.equal(restored.resyncCursorNow, true)
    assert.equal(restored.bumpedEpoch, true)
    assert.equal(restored.nextState.initialRestoreDone, true)
    assert.equal(restored.nextState.secondPulseStarted, false)
    assert.equal(restored.nextState.settleResetDone, false)
    assert.equal(restored.nextState.hudEpoch, 1)

    // Between +0.08s and +0.28s: normal rendering, no extra wake-up
    const midWindowTime = 10.0 + SHOP_CLOSE_SECOND_PULSE_START_SECONDS - 0.05
    assert.equal(
      needsImmediateNativeShopWake(restored.nextState, false, midWindowTime),
      false,
    )
    const between = evaluateNativeShopHudSync(
      restored.nextState,
      false,
      midWindowTime,
    )
    assert.equal(between.suppressShow, false)
    assert.equal(between.holdStockHudPulse, false)
    assert.equal(between.bumpedEpoch, false)

    // At +0.28s: starts brief secondary stock HUD pulse while keeping custom HUD visible
    const secondPulseTime = 10.0 + SHOP_CLOSE_SECOND_PULSE_START_SECONDS + 0.02
    assert.equal(
      needsImmediateNativeShopWake(between.nextState, false, secondPulseTime),
      true,
    )
    const secondPulse = evaluateNativeShopHudSync(
      between.nextState,
      false,
      secondPulseTime,
    )
    assert.equal(secondPulse.suppressShow, false)
    assert.equal(secondPulse.holdStockHudPulse, true)
    assert.equal(secondPulse.bumpedEpoch, false)
    assert.equal(secondPulse.nextState.secondPulseStarted, true)
    assert.equal(secondPulse.nextState.settleResetDone, false)

    assert.equal(
      needsImmediateNativeShopWake(
        secondPulse.nextState,
        false,
        10.0 + SHOP_CLOSE_HUD_SETTLE_RESET_SECONDS - 0.02,
      ),
      false,
    )

    // Past +0.38s settle threshold: releases stock HUD pulse and bumps epoch -> 2, preserving monotonic hudEpoch
    const settleTime = 10.0 + SHOP_CLOSE_HUD_SETTLE_RESET_SECONDS + 0.02
    assert.equal(
      needsImmediateNativeShopWake(secondPulse.nextState, false, settleTime),
      true,
    )
    const settled = evaluateNativeShopHudSync(
      secondPulse.nextState,
      false,
      settleTime,
    )
    assert.equal(settled.suppressShow, false)
    assert.equal(settled.holdStockHudPulse, false)
    assert.equal(settled.bumpedEpoch, true)
    assert.equal(settled.resyncCursorNow, false)
    assert.equal(settled.nextState.settleResetDone, true)
    assert.equal(settled.nextState.hudEpoch, 2)

    // Subsequent idle frames remain quiet with hudEpoch === 2 preserved
    assert.equal(needsImmediateNativeShopWake(settled.nextState, false, 12.0), false)
    const afterSettle = evaluateNativeShopHudSync(settled.nextState, false, 12.0)
    assert.equal(afterSettle.suppressShow, false)
    assert.equal(afterSettle.holdStockHudPulse, false)
    assert.equal(afterSettle.bumpedEpoch, false)
    assert.equal(afterSettle.nextState.hudEpoch, 2)
  })

  it('keeps hudEpoch strictly monotonic across rapid Buy Menu reopens and server clock backsteps', () => {
    const open1 = evaluateNativeShopHudSync(undefined, true, 20.0)
    const close1 = evaluateNativeShopHudSync(open1.nextState, false, 20.5)

    // Rapid reopen before +0.08s restore delay
    const reopenBeforeRestore = evaluateNativeShopHudSync(
      close1.nextState,
      true,
      20.53,
    )
    assert.equal(reopenBeforeRestore.suppressShow, true)
    assert.equal(reopenBeforeRestore.shouldHideNow, true)
    assert.equal(reopenBeforeRestore.holdStockHudPulse, true)
    assert.equal(reopenBeforeRestore.nextState.closedAtSeconds, undefined)
    assert.equal(reopenBeforeRestore.nextState.hudEpoch, 0)

    // Complete restore (epoch -> 1), then reopen before +0.38s settle
    const close2 = evaluateNativeShopHudSync(
      reopenBeforeRestore.nextState,
      false,
      22.0,
    )
    const restored2 = evaluateNativeShopHudSync(
      close2.nextState,
      false,
      22.0 + SHOP_CLOSE_HUD_RESTORE_DELAY_SECONDS + 0.02,
    )
    assert.equal(restored2.bumpedEpoch, true)
    assert.equal(restored2.nextState.hudEpoch, 1)

    const reopenBeforeSettle = evaluateNativeShopHudSync(
      restored2.nextState,
      true,
      22.2,
    )
    assert.equal(reopenBeforeSettle.suppressShow, true)
    assert.equal(reopenBeforeSettle.shouldHideNow, true)
    assert.equal(reopenBeforeSettle.holdStockHudPulse, true)
    assert.equal(reopenBeforeSettle.nextState.hudEpoch, 1)

    // Server clock backstep while waiting in post-close restore immediately restores cleanly & increments epoch (1 -> 2)
    const close3 = evaluateNativeShopHudSync(
      reopenBeforeSettle.nextState,
      false,
      180.0,
    )
    assert.equal(close3.suppressShow, true)
    assert.equal(needsImmediateNativeShopWake(close3.nextState, false, 0.2), true)
    const clockReset = evaluateNativeShopHudSync(close3.nextState, false, 0.2)
    assert.equal(clockReset.suppressShow, false)
    assert.equal(clockReset.holdStockHudPulse, false)
    assert.equal(clockReset.bumpedEpoch, true)
    assert.equal(clockReset.resyncCursorNow, true)
    assert.equal(clockReset.nextState.settleResetDone, true)
    assert.equal(clockReset.nextState.hudEpoch, 2)

    // Subsequent open + full close cycle increments from 2 -> 3 -> 4 (never resets back to 0)
    const openNext = evaluateNativeShopHudSync(clockReset.nextState, true, 5.0)
    const closeNext = evaluateNativeShopHudSync(openNext.nextState, false, 5.5)
    const restoreNext = evaluateNativeShopHudSync(
      closeNext.nextState,
      false,
      5.5 + SHOP_CLOSE_HUD_RESTORE_DELAY_SECONDS + 0.02,
    )
    assert.equal(restoreNext.nextState.hudEpoch, 3)
    const settleNext = evaluateNativeShopHudSync(
      restoreNext.nextState,
      false,
      5.5 + SHOP_CLOSE_HUD_SETTLE_RESET_SECONDS + 0.02,
    )
    assert.equal(settleNext.nextState.hudEpoch, 4)
  })
})
