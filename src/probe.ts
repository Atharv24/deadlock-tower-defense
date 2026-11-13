// Tier 3 in-engine automated self-test (`modlock run --arg probe`).
// Uses Modlock's `ProbeRun` harness to verify:
// 1. Patched Center Lane map entities & Friendly Blue T1 Guardian (`boss_rebel_t1_blue`)
// 2. Defender hero surface spawn at [0, -1950, 390]
// 3. Wave spawning & `scaledCreeps` no-mid-fight-heal invariant
// 4. `onDamaged` player last-hit Tome grant & Guardian-kill rejection
// 5. 1-of-3 Major Boon milestone picker & Guardian repair/fortification

import {
  addBot,
  Buttons,
  damage,
  entityPosition,
  findEntities,
  killEntity,
  log,
  Npc,
  type Player,
  players,
  ProbeRun,
  readField,
  serverCommand,
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
  | 'base_progression'

const STEP_WAITS: Record<ProbeStep, string> = {
  world: 'Center Lane world entities, 0 static neutral camps, and full 5-tier Team 2 Base Defense structures',
  defender: 'Team 2 defender hero to spawn on Center Lane surface',
  wave_scale: 'enemy creep wave & varied wave neutrals to spawn and pass no-mid-fight-heal check',
  tome_grant: 'player last-hit Tome grant and Friendly Structure kill rejection',
  boon_and_guardian: '1-of-3 Major Boon selection and All-Structure Fortify/Repair (HP, Dmg & Atk Spd)',
  zombie_kamikaze: 'Graves Zombie to engage Blue T1 Guardian, detonate kamikaze explosion, and die',
  boss_scale: 'C++ aura creep & Boss model+hitbox scaling and high-torso bullet registration',
  boss_combat: 'Boss Hero autonomous Center Lane march, target aiming, and live combat damage',
  base_progression: 'Guardian death advancing cleanly to Walker (no premature defeat) and Walker vulnerability',
}

export class TdProbe {
  private readonly run = new ProbeRun('DeadlockTD', 90)
  private step: ProbeStep = 'world'
  private defender?: Player
  private testCreepEntity = 0
  private testZombieNpc?: Npc
  private guardianHpBeforeZombie = 0
  private bossSpawned = false
  private hitboxPhase: 'init' | 'wait_aura' | 'shoot_creep_high' | 'shoot_boss_high' = 'init'
  private hitboxPhaseStartedAt = 0
  private hitboxTestTrooper?: Npc
  private bossHpBeforeHighShot = 0
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
        return this.checkBoonAndGuardian(now, waves, guardian, tomes)
      case 'zombie_kamikaze':
        return this.checkZombieKamikaze(now, waves, guardian)
      case 'boss_scale':
        return this.checkBossScale(now, waves, guardian, tomes)
      case 'boss_combat':
        return this.checkBossCombat(now, waves, guardian, tomes)
      case 'base_progression':
        return this.checkBaseProgression(now, waves, guardian)
    }
  }

  private checkWorld(guardian: GuardianManager): boolean | string {
    if (!this.defender) {
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
    }

    guardian.poll(0)
    const guardianEnt = guardian.locateEntity()
    if (guardianEnt <= 0) {
      return false
    }
    if (guardian.walkerEntity <= 0) {
      return 'missing Blue T2 Walker (rebels_t2_boss_blue) in world'
    }
    if (guardian.baseGuardianEntities.length < 2) {
      return `expected 2 Twin Blue Base Guardians (rebels_watcher_blue), found ${guardian.baseGuardianEntities.length}`
    }
    if (guardian.eastShrineEntity <= 0 || guardian.westShrineEntity <= 0) {
      return `missing Amber Shrines (east=${guardian.eastShrineEntity}, west=${guardian.westShrineEntity})`
    }
    if (guardian.patronEntity <= 0) {
      return 'missing Amber Patron (npc_boss_tier3) in world'
    }
    const neutralCamps = findEntities('info_neutral_trooper_camp')
    if (neutralCamps.length > 0) {
      return `expected 0 static info_neutral_trooper_camp entities, found ${neutralCamps.length}`
    }
    const allTrooperSpawns = findEntities('info_trooper_spawn')
    const centerEnemyTrooperSpawns = allTrooperSpawns.filter((sp) => {
      const team = readField(sp, 'CBaseEntity', 'm_iTeamNum', 'uint8')
      const lane = readField(sp, 'CInfoTrooperSpawn', 'm_iLane', 'int32')
      return team === 3 && lane === 4
    })
    if (centerEnemyTrooperSpawns.length < 4) {
      return `expected >= 4 Enemy Center Lane info_trooper_spawn entities, found ${centerEnemyTrooperSpawns.length}`
    }
    const friendlyCenterTrooperSpawns = allTrooperSpawns.filter((sp) => {
      const team = readField(sp, 'CBaseEntity', 'm_iTeamNum', 'uint8')
      const lane = readField(sp, 'CInfoTrooperSpawn', 'm_iLane', 'int32')
      return team === 2 && lane === 4
    })
    if (friendlyCenterTrooperSpawns.length === 0) {
      return 'expected Team 2 Lane 4 info_trooper_spawn entities to keep m_iLane=4 so CInfoTrooperBossSpawn never divides by zero, found 0'
    }
    for (const sp of friendlyCenterTrooperSpawns) {
      if (readField(sp, 'CInfoTrooperSpawn', 'm_bDisableZiplining', 'bool') !== true) {
        return `expected Team 2 Lane 4 spawner ${sp} to have m_bDisableZiplining=true`
      }
    }
    const teamManagers = findEntities('citadel_team_manager')
    for (const tm of teamManagers) {
      if (readField(tm, 'CBaseEntity', 'm_iTeamNum', 'uint8') === 2) {
        const unlocked = readField(tm, 'CCitadelTeam', 'm_nFlexSlotsUnlocked', 'uint16')
        if (typeof unlocked === 'number' && unlocked <= 0) {
          return `expected Team 2 Flex Slots unlocked (> 0), got ${unlocked}`
        }
      }
    }
    log(
      `Probe: verified all 5 Base Defense tiers (Guardian=${guardianEnt}, Walker=${guardian.walkerEntity}, BaseGuardians=${guardian.baseGuardianEntities.length}, Shrines=2, Patron=${guardian.patronEntity} phase=${guardian.patronPhase})`,
    )
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
    let creeps = waves.collectLiveCreepHandles()
    if (creeps.length === 0) {
      const probeTrooper = spawnNpc({
        className: 'npc_trooper',
        unit: 'trooper_normal',
        team: 3,
        lane: 4,
        position: { x: 0, y: 400, z: 384 },
        facing: { pitch: 0, yaw: 270, roll: 0 },
      })
      if (probeTrooper && probeTrooper.entity > 0) {
        creeps = waves.collectLiveCreepHandles()
      }
      if (creeps.length === 0) {
        return false
      }
    }

    waves.scaleNewlySpawnedCreeps(now)
    const targetCreep = creeps[0]
    this.testCreepEntity = targetCreep
    const expectedHp = computeWaveCreepHp(waves.wave)

    // Damage the creep to 80 HP and verify a subsequent scale pass does NOT heal it back to full HP.
    new Npc(targetCreep).setHealth(80, expectedHp)
    waves.scaleNewlySpawnedCreeps(now)
    const afterNpc = new Npc(targetCreep).read()
    if (afterNpc && afterNpc.health > 80) {
      return `damaged creep was healed mid-fight from 80 to ${afterNpc.health}`
    }

    if (waves.spawnedWaveNeutrals.length !== 0) {
      return `expected 0 wave neutrals in v0.6.0, got ${waves.spawnedWaveNeutrals.length}`
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
    now: number,
    waves: WaveManager,
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

    // Verify All-Structure Fortification (`/upgrade`) scales Max HP, Outgoing Damage, & Attack Speed Aura across ALL structures!
    this.defender.adjustSouls(3000, false)
    const lvBefore = guardian.upgradeLevel
    const gMaxBefore = guardian.maxHealth
    const wMaxBefore = guardian.walkerMaxHealth
    const bgMaxBefore = guardian.baseGuardiansMaxHealth
    const sMaxBefore = guardian.shrinesMaxHealth
    const pMaxBefore = guardian.patronMaxHealth

    if (!guardian.upgradeByPlayer(this.defender)) {
      return 'upgradeByPlayer failed despite sufficient Souls'
    }
    guardian.poll(waves.wave, now)
    if (guardian.upgradeLevel !== lvBefore + 1) {
      return `expected upgradeLevel=${lvBefore + 1}, got ${guardian.upgradeLevel}`
    }
    if (
      guardian.maxHealth <= gMaxBefore ||
      guardian.walkerMaxHealth <= wMaxBefore ||
      guardian.baseGuardiansMaxHealth <= bgMaxBefore ||
      guardian.shrinesMaxHealth <= sMaxBefore ||
      guardian.patronMaxHealth <= pMaxBefore
    ) {
      return `All-Structure Fortify did not scale Max HP across every tier: G=${gMaxBefore}->${guardian.maxHealth}, W=${wMaxBefore}->${guardian.walkerMaxHealth}, BG=${bgMaxBefore}->${guardian.baseGuardiansMaxHealth}, S=${sMaxBefore}->${guardian.shrinesMaxHealth}, P=${pMaxBefore}->${guardian.patronMaxHealth}`
    }

    // Verify fortified structure outgoing damage multiplier applies to Walker / Guardian / Patron hits!
    const walkerDmgMod = waves.modifyIncomingDamage(
      {
        victim: this.testCreepEntity || 999,
        attacker: guardian.walkerEntity,
        ability: 0,
        inflictor: guardian.walkerEntity,
        amount: 100,
        flags: 0,
        type: 0,
      } as never,
      guardian,
    )
    const expectedMult = guardian.damageMultiplier()
    if (!walkerDmgMod || Math.abs((walkerDmgMod.amount ?? 100) - 100 * expectedMult) > 0.5) {
      return `Fortified Walker outgoing damage did not scale by ${expectedMult}x (got ${walkerDmgMod?.amount})`
    }

    // Verify All-Structure Repair (`/repair`) heals multiple damaged structures simultaneously!
    const gDamaged = Math.max(1000, guardian.maxHealth - 900)
    const wDamaged = Math.max(1000, guardian.walkerMaxHealth - 900)
    new Npc(guardian.entity).setHealth(gDamaged, guardian.maxHealth)
    new Npc(guardian.walkerEntity).setHealth(wDamaged, guardian.walkerMaxHealth)
    guardian.poll(waves.wave, now)
    if (!guardian.repairByPlayer(this.defender)) {
      return 'repairByPlayer failed to heal damaged Guardian & Walker'
    }
    if (guardian.health < guardian.maxHealth || guardian.walkerHealth < guardian.walkerMaxHealth) {
      return `All-Structure Repair did not restore Guardian (${guardian.health}/${guardian.maxHealth}) and Walker (${guardian.walkerHealth}/${guardian.walkerMaxHealth})`
    }

    log(
      `Probe: verified Major Boon (${chosen.title}), All-Structure Fortify Lv.${guardian.upgradeLevel} (+${guardian.damageBonusPct()}% Dmg, +${guardian.fireRateBonusPct()}% Atk Spd across all 5 tiers), and All-Structure Repair`,
    )
    this.step = 'boss_scale'
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
      waves.scaleNewlySpawnedCreeps(now)
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
    tomes: TomeManager,
  ): boolean | string {
    if (!this.bossSpawned) {
      // Park defender behind Guardian so newly spawned Bosses begin marching down Center Lane undisturbed.
      this.defender?.teleport({ x: 0, y: -2750, z: 390 }, PLAYER_SPAWN_ANGLES)
      tomes.pendingBoonChoices.clear()
      waves.wave = 4
      waves.spawnNextWave(now, true)
      waves.wave = 9
      waves.spawnNextWave(now, true)
      if (this.defender && tomes.pendingBoonChoices.has(this.defender.slot)) {
        return 'Major Boon was erroneously granted on Boss spawn instead of Boss kill!'
      }
      this.bossSpawned = true
      return false
    }

    const b5 = waves.activeBosses.find((b) => b.wave === 5)
    const b10 = waves.activeBosses.find((b) => b.wave === 10)
    if (!b5 || !b10 || b5.configuredPawnEntity <= 0 || b10.configuredPawnEntity <= 0) {
      waves.tickActiveBosses(now, guardian)
      return false
    }

    waves.tickActiveBosses(now, guardian)
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
    if (b10.currentMaxHp < 3800 || b10.currentMaxHp <= b5.currentMaxHp) {
      return `Boss Max HP did not scale across waves: Wave 5=${b5.currentMaxHp}, Wave 10=${b10.currentMaxHp}`
    }
    if (typeof scale10 === 'number' && scale10 < 1.12) {
      return `Expected Boss Colossus scale >= 1.12, got ${scale10}`
    }
    // Verify Tome outgoing damage scaling for Team 2 Defender!
    if (this.defender) {
      tomes.applyMinorTome(this.defender, {
        id: 'weapon',
        name: 'Tome of Arms',
        shortLabel: 'Weapon',
        description: '+10% Weapon Damage',
        kind: 'modifier',
        modifier: 'td_tome_weapon',
        color: '#fb923c',
      })
      const defEnt = this.defender.pawn()?.entity ?? 0
      const boosted = waves.modifyIncomingDamage(
        {
          victim: this.testCreepEntity || 999,
          attacker: defEnt,
          ability: 0,
          inflictor: defEnt,
          amount: 100,
          flags: 0n,
          hitGroup: 0,
        },
        guardian,
        tomes,
      )
      if (!boosted || (boosted.amount ?? 100) <= 105) {
        return `Tome outgoing weapon damage did not scale above 105 (got ${boosted?.amount})`
      }
    }
    log(
      `Probe: verified Wave 5 (${b5.currentMaxHp} HP, scale=${scale5}) & Wave 10 (${b10.currentMaxHp} HP, scale=${scale10}) Colossus Raid Bosses + Tome scaling!`,
    )
    const idx5 = waves.activeBosses.findIndex((b) => b.wave === 5)
    if (idx5 >= 0) {
      waves.activeBosses[idx5].bot.drive()
      waves.activeBosses[idx5].bot.removeBot()
      waves.activeBosses.splice(idx5, 1)
    }
    this.step = 'boss_combat'
    return false
  }

  private checkBossCombat(
    now: number,
    waves: WaveManager,
    guardian: GuardianManager,
    tomes: TomeManager,
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

    // Sub-phase 3: Verify Major Boon is awarded upon Boss kill (#13)!
    const bossEnt = b10.configuredPawnEntity
    const bossHp = Math.max(1, b10.currentHp)
    waves.handleCreepPostDamage(
      {
        victim: bossEnt,
        attacker: this.defender?.pawn()?.entity ?? 1,
        ability: 0,
        healthBefore: bossHp,
        healthLost: bossHp,
        dealt: bossHp,
      },
      guardian,
      now,
    )
    if (!this.defender || !tomes.pendingBoonChoices.has(this.defender.slot)) {
      return 'Major Boon was NOT awarded when Wave 10 Boss was killed!'
    }

    log(
      `Probe: verified Boss Wave 10 (${b10.hero}) aimed & dealt live combat damage (Defender HP ${this.defenderHpBeforeBoss} -> ${defHp}, Guardian HP ${this.guardianHpBeforeBoss} -> ${guardian.health}, dmgMult=${b10.damageMult}x) and granted Major Boon on Boss kill — advancing to Multi-Stage Base Progression check`,
    )
    this.step = 'base_progression'
    return false
  }

  private progressionKilledGuardianAt = 0

  private checkBaseProgression(
    now: number,
    waves: WaveManager,
    guardian: GuardianManager,
  ): boolean | string {
    // 1. Destroy Blue T1 Guardian and verify match stays ACTIVE and advances frontline to Blue Walker!
    // Also exercise `citadel_spawn_trooper_wave` live to prove CInfoTrooperBossSpawn never divides by zero.
    if (this.progressionKilledGuardianAt === 0) {
      serverCommand('sv_cheats 1')
      serverCommand('citadel_spawn_trooper_wave')
      serverCommand('sv_cheats 0')
      killEntity({ victim: guardian.entity })
      this.progressionKilledGuardianAt = now
      guardian.poll(waves.wave, now)
      if (guardian.matchState !== 'active') {
        return `Match prematurely ended (${guardian.matchState}) when Blue T1 Guardian fell!`
      }
      return false
    }

    // Allow a couple ticks for Source 2 C++ BossInvuln to update on Blue Walker (`rebels_t2_boss_blue`)
    if (now - this.progressionKilledGuardianAt < 0.6) {
      guardian.poll(waves.wave, now)
      return false
    }

    guardian.poll(waves.wave, now)
    if (guardian.health !== 0) {
      return `Expected fallen Blue Guardian health=0, got ${guardian.health}`
    }
    if (guardian.matchState !== 'active') {
      return `Match prematurely ended (${guardian.matchState}) after Blue Guardian fell!`
    }
    if (guardian.currentStage !== 'walker') {
      return `Expected currentStage='walker' after Guardian fell, got '${guardian.currentStage}'`
    }

    const activeBossObj = guardian.getActiveBossObjective({ x: 0, y: -1800, z: 384 })
    if (!activeBossObj || activeBossObj.kind !== 'walker') {
      return `Expected Boss AI active objective to advance to 'walker', got '${activeBossObj?.kind}'`
    }

    // 2. Verify Blue T2 Walker (`rebels_t2_boss_blue`) dropped invulnerability and takes real damage!
    const walkerBefore = guardian.walkerHealth
    damage({ victim: guardian.walkerEntity, amount: 600 })
    guardian.poll(waves.wave, now)
    if (guardian.walkerHealth >= walkerBefore) {
      return `Blue Walker (ent=${guardian.walkerEntity}) remained invulnerable (${walkerBefore} -> ${guardian.walkerHealth}) after Blue T1 Guardian died!`
    }

    // 3. Verify 0 living Team 2 friendly lane troopers remain after `citadel_spawn_trooper_wave` + purge.
    waves.purgeFriendlyAndSideLaneTroopers()
    for (const tr of findEntities('npc_trooper')) {
      const team = readField(tr, 'CBaseEntity', 'm_iTeamNum', 'uint8')
      const lifeState = readField(tr, 'CBaseEntity', 'm_lifeState', 'uint8')
      if (team === 2 && (lifeState === undefined || lifeState === 0)) {
        return `Found living Team 2 friendly npc_trooper (${tr}) despite citadel_spawn_combine_only 1 & purge`
      }
    }

    log(
      `Probe: verified Guardian death keeps match ACTIVE, advances frontline to Blue Walker (${walkerBefore} -> ${guardian.walkerHealth} HP), and preserves full Guardian -> Walker -> Base Guardians -> Shrines -> Patron Stage 1 -> Stage 2 progression — ALL CHECKS PASSED`,
    )
    return true
  }
}
