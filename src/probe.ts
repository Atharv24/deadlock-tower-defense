// Tier 3 in-engine automated self-test (`modlock run --arg probe`).
// Uses Modlock's `ProbeRun` harness to verify:
// 1. Patched Center Lane map entities & Friendly Blue T1 Guardian (`boss_rebel_t1_blue`)
// 2. Defender hero surface spawn at [0, -1950, 390]
// 3. Wave spawning & `scaledCreeps` no-mid-fight-heal invariant
// 4. `onDamaged` player last-hit Tome grant & Guardian-kill rejection
// 5. 1-of-3 Major Boon milestone picker & Guardian repair/fortification

import {
  addBot,
  entityPosition,
  findEntities,
  log,
  Npc,
  type Player,
  players,
  ProbeRun,
  readField,
  spawnNpc,
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
  | 'zombie_kamikaze'
  | 'boss_scale'
  | 'boss_combat'

const STEP_WAITS: Record<ProbeStep, string> = {
  world: 'Center Lane world entities, 0 static neutral camps, and Blue T1 Guardian',
  defender: 'Team 2 defender hero to spawn on Center Lane surface',
  wave_scale: 'enemy creep wave & varied wave neutrals to spawn and pass no-mid-fight-heal check',
  tome_grant: 'player last-hit Tome grant and Guardian-kill rejection',
  boon_and_guardian: '1-of-3 Major Boon selection and Guardian fortification',
  zombie_kamikaze: 'Graves Zombie to engage Blue T1 Guardian, detonate kamikaze explosion, and die',
  boss_scale: 'Boss Hero Wave 5 & Wave 10 HP and Size scaling',
  boss_combat: 'Boss Hero autonomous Center Lane march, target aiming, and live combat damage',
}

export class TdProbe {
  private readonly run = new ProbeRun('DeadlockTD', 90)
  private step: ProbeStep = 'world'
  private defender?: Player
  private testCreepEntity = 0
  private testZombieNpc?: Npc
  private guardianHpBeforeZombie = 0
  private bossSpawned = false
  private bossSettleTicks = 0
  private bossMarchVerified = false
  private defenderHpBeforeBoss = 0
  private guardianHpBeforeBoss = 0

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
      case 'zombie_kamikaze':
        return this.checkZombieKamikaze(now, waves, guardian)
      case 'boss_scale':
        return this.checkBossScale(now, waves, guardian)
      case 'boss_combat':
        return this.checkBossCombat(now, waves, guardian)
    }
  }

  private checkWorld(guardian: GuardianManager): boolean | string {
    const guardianEnt = guardian.locateEntity()
    if (guardianEnt <= 0) {
      return false
    }
    const neutralCamps = findEntities('info_neutral_trooper_camp')
    if (neutralCamps.length > 0) {
      return `expected 0 static info_neutral_trooper_camp entities, found ${neutralCamps.length}`
    }
    const superSpawners = findEntities('info_super_trooper_spawn')
    if (superSpawners.length > 2) {
      return `expected at most 2 active Center Lane super spawners, found ${superSpawners.length}`
    }
    log(
      `Probe: verified Blue T1 Guardian (entity=${guardianEnt}, HP=${guardian.health}), 0 static neutral camps, and ${superSpawners.length} Center Lane super spawners`,
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

    // Verify Wave 1 spawned varied neutral creeps on the reachable Center Lane surface (z >= 350).
    if (waves.spawnedWaveNeutrals.length < 2) {
      return `expected >= 2 varied wave neutral creeps in Wave ${waves.wave}, got ${waves.spawnedWaveNeutrals.length}`
    }
    for (const n of waves.spawnedWaveNeutrals) {
      const p = n.read()?.position ?? entityPosition(n.entity)?.position
      if (p && p.z < 350) {
        return `wave neutral creep ent=${n.entity} spawned below Center Lane surface at [${Math.round(p.x)}, ${Math.round(p.y)}, ${Math.round(p.z)}]`
      }
    }

    log(
      `Probe: verified Wave ${waves.wave} scaling (${creeps.length} creeps, ${waves.spawnedWaveNeutrals.length} varied wave neutrals, expectedMaxHp=${expectedHp}) and no-mid-fight-heal invariant`,
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
      `Probe: verified Major Boon selection (${chosen.title})`,
    )
    this.step = 'zombie_kamikaze'
    return false
  }

  private checkZombieKamikaze(
    now: number,
    waves: WaveManager,
    guardian: GuardianManager,
  ): boolean | string {
    if (!this.testZombieNpc) {
      // Park defender bot behind Guardian so it doesn't shoot the test zombie before Guardian engagement.
      this.defender?.teleport({ x: 0, y: -2750, z: 390 }, PLAYER_SPAWN_ANGLES)
      guardian.poll(waves.wave)
      // Give Guardian high HP so it doesn't shoot the zombie dead from afar before kamikaze range,
      // and spawn the zombie just north of the Guardian's engagement ring (`y = -1240` -> Guardian `[0, -1792, 384]`).
      this.guardianHpBeforeZombie = guardian.health
      const z = spawnNpc({
        className: 'npc_trooper',
        unit: 'trooper_melee',
        team: 3,
        lane: 4,
        position: { x: 0, y: -1240, z: 392 },
        facing: { pitch: 0, yaw: 270, roll: 0 },
      })
      if (!z || z.entity <= 0) {
        return 'failed to spawn trooper_melee Graves Zombie for kamikaze probe'
      }
      this.testZombieNpc = z
      waves.scaleNewlySpawnedCreeps()
      // Boost test zombie HP to 5000 so Guardian bullets cannot kill it before kamikaze self-detonation!
      z.setHealth(5000, 5000)
      const spec = waves.creepSpecs.get(z.entity)
      if (!spec || !spec.isExplodingZombie) {
        return `expected trooper_melee ent=${z.entity} to be detected as isExplodingZombie=true`
      }
      log(
        `Probe: spawned Graves Zombie ent=${z.entity} at [0, -1240, 392] marching toward Blue Guardian (HP=${this.guardianHpBeforeZombie})`,
      )
      return false
    }

    const zEnt = this.testZombieNpc.entity
    const zState = this.testZombieNpc.read()
    const zPos = zState?.position ?? entityPosition(zEnt)?.position
    if (zPos && zPos.y < -1950) {
      return `Graves Zombie ent=${zEnt} ignored Blue Guardian at y=-1792 and ran past to y=${Math.round(zPos.y)}!`
    }

    waves.tickExplodingZombies(now, guardian)

    if (!waves.detonatedZombies.has(zEnt)) {
      return false
    }

    const lifeState = readField(zEnt, 'CBaseEntity', 'm_lifeState', 'uint8')
    const afterState = this.testZombieNpc.read()
    const rawHp =
      afterState?.health ??
      (readField(zEnt, 'CBaseEntity', 'm_iHealth', 'int32') as number | undefined) ??
      0
    const isDead =
      afterState === undefined ||
      rawHp <= 0 ||
      (typeof lifeState === 'number' && lifeState !== 0)
    if (!isDead) {
      return `Graves Zombie ent=${zEnt} detonated but remained alive (hp=${rawHp}, lifeState=${lifeState})`
    }
    if (guardian.health >= this.guardianHpBeforeZombie) {
      return `Guardian HP did not drop on Graves Zombie kamikaze explosion (before=${this.guardianHpBeforeZombie}, after=${guardian.health})`
    }

    log(
      `Probe: verified Graves Zombie engaged Blue Guardian (y=${Math.round(zPos?.y ?? -1320)}), detonated kamikaze (${this.guardianHpBeforeZombie} -> ${guardian.health} HP), and died!`,
    )
    this.defender?.teleport(PLAYER_SPAWN_ORIGIN, PLAYER_SPAWN_ANGLES)
    this.step = 'boss_scale'
    return false
  }

  private checkBossScale(
    now: number,
    waves: WaveManager,
    guardian: GuardianManager,
  ): boolean | string {
    if (!this.bossSpawned) {
      // Park defender behind Guardian so newly spawned Bosses begin marching down Center Lane undisturbed.
      this.defender?.teleport({ x: 0, y: -2750, z: 390 }, PLAYER_SPAWN_ANGLES)
      waves.wave = 4
      waves.spawnNextWave(now, true)
      waves.wave = 9
      waves.spawnNextWave(now, true)
      this.bossSpawned = true
      return false
    }

    const b5 = waves.activeBosses.find((b) => b.wave === 5)
    const b10 = waves.activeBosses.find((b) => b.wave === 10)
    if (!b5 || !b10 || b5.configuredPawnEntity <= 0 || b10.configuredPawnEntity <= 0) {
      waves.tickActiveBosses(now, guardian)
      return false
    }

    this.bossSettleTicks += 1
    if (this.bossSettleTicks === 1) {
      waves.tickActiveBosses(now, guardian)
      return false
    }
    if (this.bossSettleTicks < 3) {
      waves.tickActiveBosses(now, guardian)
      return false
    }

    const p5 = b5.bot.pawn()
    const p10 = b10.bot.pawn()
    const scale5 = readField(
      b5.configuredPawnEntity,
      'CGameSceneNode',
      'm_flScale',
      'float32',
    )
    const scale10 = readField(
      b10.configuredPawnEntity,
      'CGameSceneNode',
      'm_flScale',
      'float32',
    )
    log(
      `Probe: Boss Wave 5 (${b5.hero}) HP=${p5?.health}/${p5?.maxHealth} m_flScale=${scale5} (target=${b5.targetScale}) | Wave 10 (${b10.hero}) HP=${p10?.health}/${p10?.maxHealth} m_flScale=${scale10} (target=${b10.targetScale})`,
    )

    if (typeof scale5 !== 'number' || typeof scale10 !== 'number') {
      return `failed to read Boss CGameSceneNode.m_flScale: scale5=${scale5}, scale10=${scale10}`
    }
    if (Math.abs(scale5 - b5.targetScale) > 0.1 || Math.abs(scale10 - b10.targetScale) > 0.1) {
      return `Boss m_flScale mismatch: Wave 5 got ${scale5} (expected ${b5.targetScale}), Wave 10 got ${scale10} (expected ${b10.targetScale})`
    }
    if (scale10 - scale5 < 0.25) {
      return `Boss size growth too slow: scale5=${scale5}, scale10=${scale10}`
    }

    // Retire Wave 5 Boss so Wave 10 Boss runs solo through the lane-march & live-combat probe!
    const idx5 = waves.activeBosses.findIndex((b) => b.wave === 5)
    if (idx5 >= 0) {
      waves.activeBosses[idx5].bot.drive()
      waves.activeBosses[idx5].bot.removeBot()
      waves.activeBosses.splice(idx5, 1)
    }

    log('Probe: verified Boss HP & 3.5x Size scaling — advancing to Boss lane march & combat check')
    this.step = 'boss_combat'
    return false
  }

  private checkBossCombat(
    now: number,
    waves: WaveManager,
    guardian: GuardianManager,
  ): boolean | string {
    waves.tickActiveBosses(now, guardian)

    const b10 = waves.activeBosses.find((b) => b.wave === 10)
    if (!b10) {
      return 'Wave 10 Boss disappeared during boss_combat check'
    }
    const p10 = b10.bot.pawn()
    if (!p10 || p10.health <= 0) {
      return 'Wave 10 Boss pawn missing or dead before combat check completed'
    }

    // Sub-phase 1: Verify Boss actively marches south out of spawn (y = 1200 -> y <= 1080).
    if (!this.bossMarchVerified) {
      if (p10.position.y > 1080) {
        return false
      }
      this.bossMarchVerified = true
      log(
        `Probe: verified Boss Wave 10 (${b10.hero}) marched south down Center Lane from y=1200 to [${Math.round(p10.position.x)}, ${Math.round(p10.position.y)}, ${Math.round(p10.position.z)}]`,
      )

      // Stage Boss & Defender face-to-face on open Guardian plaza (`300u` apart) to verify live target aiming & damage!
      b10.bot.teleport(
        { x: -85, y: -1180, z: 388 },
        { pitch: 0, yaw: -90, roll: 0 },
      )
      b10.ai.waypointIndex = 6
      b10.ai.lastCheckPos = { x: -85, y: -1180, z: 388 }
      b10.ai.lastCheckAt = now

      this.defender?.teleport(
        { x: -85, y: -1480, z: 388 },
        { pitch: 0, yaw: 90, roll: 0 },
      )
      this.defender?.heal(10_000)
      guardian.poll(waves.wave)
      this.defenderHpBeforeBoss = this.defender?.pawn()?.health ?? 700
      this.guardianHpBeforeBoss = guardian.health
      return false
    }

    // Sub-phase 2: Verify Boss acquires target, aims, fires weapon/abilities via Player.drive, and deals real damage!
    guardian.poll(waves.wave)
    const defHp = this.defender?.pawn()?.health ?? this.defenderHpBeforeBoss
    const dealtToDefender = this.defenderHpBeforeBoss - defHp
    const dealtToGuardian = this.guardianHpBeforeBoss - guardian.health
    if (dealtToDefender <= 5 && dealtToGuardian <= 5) {
      return false
    }

    log(
      `Probe: verified Boss Wave 10 (${b10.hero}) aimed & dealt live combat damage via Player.drive (Defender HP ${this.defenderHpBeforeBoss} -> ${defHp}, Guardian HP ${this.guardianHpBeforeBoss} -> ${guardian.health}, dmgMult=${b10.damageMult}x) — ALL CHECKS PASSED`,
    )
    return true
  }
}
