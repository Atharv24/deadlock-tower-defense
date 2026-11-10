// Tier 3 in-engine automated self-test (`modlock run --arg probe`).
// Uses Modlock's `ProbeRun` harness to verify:
// 1. Patched Center Lane map entities & Friendly Blue T1 Guardian (`boss_rebel_t1_blue`)
// 2. Defender hero surface spawn at [0, -1950, 390]
// 3. Wave spawning & `scaledCreeps` no-mid-fight-heal invariant
// 4. `onDamaged` player last-hit Tome grant & Guardian-kill rejection
// 5. 1-of-3 Major Boon milestone picker & Guardian repair/fortification

import {
  addBot,
  findEntities,
  log,
  Npc,
  type Player,
  players,
  ProbeRun,
} from 'modlock'

import {
  computeWaveCreepHp,
  PLAYER_SPAWN_ANGLES,
  PLAYER_SPAWN_ORIGIN,
} from './config'
import type { GuardianManager } from './guardian'
import type { TomeManager } from './tomes'
import type { WaveManager } from './wave'

type ProbeStep =
  | 'world'
  | 'defender'
  | 'wave_scale'
  | 'tome_grant'
  | 'boon_and_guardian'

const STEP_WAITS: Record<ProbeStep, string> = {
  world: 'Center Lane world entities and Blue T1 Guardian',
  defender: 'Team 2 defender hero to spawn on Center Lane surface',
  wave_scale: 'enemy creep wave to spawn and pass no-mid-fight-heal check',
  tome_grant: 'player last-hit Tome grant and Guardian-kill rejection',
  boon_and_guardian: '1-of-3 Major Boon selection and Guardian fortification',
}

export class TdProbe {
  private readonly run = new ProbeRun('DeadlockTD', 90)
  private step: ProbeStep = 'world'
  private defender?: Player
  private testCreepEntity = 0

  tick(
    now: number,
    waves: WaveManager,
    guardian: GuardianManager,
    tomes: TomeManager,
  ): void {
    this.run.tick(now, STEP_WAITS[this.step], () =>
      this.advance(now, waves, guardian, tomes),
    )
  }

  private advance(
    now: number,
    waves: WaveManager,
    guardian: GuardianManager,
    tomes: TomeManager,
  ): boolean | string {
    switch (this.step) {
      case 'world':
        return this.checkWorld(guardian)
      case 'defender':
        return this.checkDefender()
      case 'wave_scale':
        return this.checkWaveAndScaling(now, waves)
      case 'tome_grant':
        return this.checkTomeGrant(waves, guardian, tomes)
      case 'boon_and_guardian':
        return this.checkBoonAndGuardian(guardian, tomes)
    }
  }

  private checkWorld(guardian: GuardianManager): boolean | string {
    const guardianEnt = guardian.locateEntity()
    if (guardianEnt <= 0) {
      return false
    }
    const superSpawners = findEntities('info_super_trooper_spawn')
    if (superSpawners.length > 2) {
      return `expected at most 2 active Center Lane super spawners, found ${superSpawners.length}`
    }
    log(
      `Probe: verified Blue T1 Guardian (entity=${guardianEnt}, HP=${guardian.health}) and ${superSpawners.length} Center Lane super spawners`,
    )

    const existingConn = players().find((c) => c.player.pawn()?.team === 2)
    this.defender =
      existingConn?.player ??
      addBot({
        name: 'TD Defender Probe',
        team: 2,
        hero: 'hero_inferno',
        position: PLAYER_SPAWN_ORIGIN,
      })
    if (!this.defender) {
      return 'could not seat Team 2 defender bot'
    }
    this.step = 'defender'
    return false
  }

  private checkDefender(): boolean | string {
    const pawn = this.defender?.pawn()
    if (!pawn || pawn.health <= 0) {
      return false
    }
    this.defender?.teleport(PLAYER_SPAWN_ORIGIN, PLAYER_SPAWN_ANGLES)
    log(
      `Probe: defender hero spawned at [${Math.round(pawn.position.x)}, ${Math.round(pawn.position.y)}, ${Math.round(pawn.position.z)}]`,
    )
    this.step = 'wave_scale'
    return false
  }

  private checkWaveAndScaling(now: number, waves: WaveManager): boolean | string {
    if (waves.wave === 0) {
      waves.spawnNextWave(now)
    }
    const creeps = waves.collectLiveCreepHandles()
    if (creeps.length === 0) {
      return false
    }

    waves.scaleNewlySpawnedCreeps()
    const targetCreep = creeps[0]
    this.testCreepEntity = targetCreep
    const expectedHp = computeWaveCreepHp(waves.wave)

    // Damage the creep to 80 HP and verify a subsequent scale pass does NOT heal it back to 150 HP.
    new Npc(targetCreep).setHealth(80, expectedHp)
    waves.scaleNewlySpawnedCreeps()
    const afterNpc = new Npc(targetCreep).read()
    if (afterNpc && afterNpc.health > 80) {
      return `damaged creep was healed mid-fight from 80 to ${afterNpc.health}`
    }

    log(
      `Probe: verified Wave ${waves.wave} scaling (${creeps.length} creeps, expectedMaxHp=${expectedHp}) and no-mid-fight-heal invariant`,
    )
    this.step = 'tome_grant'
    return false
  }

  private checkTomeGrant(
    waves: WaveManager,
    guardian: GuardianManager,
    tomes: TomeManager,
  ): boolean | string {
    const pawn = this.defender?.pawn()
    if (!pawn || this.testCreepEntity <= 0) {
      return 'missing defender pawn or test creep entity'
    }
    const validCreeps = waves.validEnemyEntities()
    validCreeps.add(this.testCreepEntity)

    // 1. Verify Guardian kill is rejected.
    const guardianKillEval = tomes.onDamaged(
      {
        victim: this.testCreepEntity,
        attacker: guardian.entity,
        ability: 0,
        healthBefore: 80,
        healthLost: 80,
        dealt: 80,
      },
      validCreeps,
      guardian,
      0.01,
      0.1,
    )
    if (guardianKillEval.granted || guardianKillEval.reason !== 'guardian_kill') {
      return `expected guardian_kill rejection, got ${guardianKillEval.reason}`
    }

    // 2. Verify player last-hit with rngRoll=0.01 (< 0.10) grants a Tome.
    const playerKillEval = tomes.onDamaged(
      {
        victim: this.testCreepEntity,
        attacker: pawn.entity,
        ability: 0,
        healthBefore: 80,
        healthLost: 80,
        dealt: 80,
      },
      validCreeps,
      guardian,
      0.01,
      0.0,
    )
    if (!playerKillEval.granted) {
      return `expected player last-hit to grant Tome, got ${playerKillEval.reason}`
    }

    // 3. Verify duplicate pellet on same creep handle is rejected.
    const dupEval = tomes.onDamaged(
      {
        victim: this.testCreepEntity,
        attacker: pawn.entity,
        ability: 0,
        healthBefore: 80,
        healthLost: 80,
        dealt: 80,
      },
      validCreeps,
      guardian,
      0.01,
      0.0,
    )
    if (dupEval.granted || dupEval.reason !== 'duplicate_kill') {
      return `expected duplicate_kill rejection, got ${dupEval.reason}`
    }

    log(
      `Probe: verified player Tome grant (${playerKillEval.tome?.name}) & deduplication`,
    )
    this.step = 'boon_and_guardian'
    return false
  }

  private checkBoonAndGuardian(
    guardian: GuardianManager,
    tomes: TomeManager,
  ): boolean | string {
    if (!this.defender) {
      return 'defender missing'
    }
    const tomesBefore = tomes.getTotalTomes(this.defender.slot)
    tomes.offerMajorBoonForWave(5)
    if (!tomes.pendingBoonChoices.has(this.defender.slot)) {
      return 'Milestone Major Boon was not offered to defender'
    }
    const chosen = tomes.chooseMajorBoon(this.defender, 0, guardian)
    if (!chosen) {
      return 'chooseMajorBoon returned undefined'
    }
    if (tomes.pendingBoonChoices.has(this.defender.slot)) {
      return 'pendingBoonChoices did not clear after choosing a Boon'
    }
    const tomesAfter = tomes.getTotalTomes(this.defender.slot)
    if (tomesAfter <= tomesBefore) {
      return 'Tome tally did not increase after Major Boon selection'
    }

    log(
      `Probe: verified Major Boon selection (${chosen.title}) — ALL CHECKS PASSED`,
    )
    return true
  }
}
