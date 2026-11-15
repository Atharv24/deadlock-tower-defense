// Reusable Mock Modlock Host runtime for Node unit and integration suites.

export interface MockVector {
  x: number
  y: number
  z: number
}

export interface MockNpcEntry {
  health: number
  maxHealth: number
  team: number
  position: MockVector
}

export interface MockBotConnection {
  player: MockPlayer
  name: string
  bot: boolean
  ready: boolean
  steamId: bigint
  generation: number
  roles: string[]
}

// Simulated engine state for the mock Modlock host
const npcStore = new Map<
  number,
  { health: number; maxHealth: number; team: number; position: { x: number; y: number; z: number } }
>()
const patronPhaseStore = new Map<number, number>()

function seedMockTeam2Structures(): void {
  npcStore.set(700, {
    health: 5500,
    maxHealth: 5500,
    team: 2,
    position: { x: 0, y: -1792, z: 384 },
  })
  npcStore.set(701, {
    health: 9000,
    maxHealth: 9000,
    team: 2,
    position: { x: -1288, y: -3472, z: 376 },
  })
  npcStore.set(702, {
    health: 4000,
    maxHealth: 4000,
    team: 2,
    position: { x: -1072, y: -5454, z: 641 },
  })
  npcStore.set(703, {
    health: 4000,
    maxHealth: 4000,
    team: 2,
    position: { x: -1488, y: -5459, z: 641 },
  })
  npcStore.set(704, {
    health: 8000,
    maxHealth: 8000,
    team: 2,
    position: { x: 299, y: -7535, z: 980 },
  })
  npcStore.set(705, {
    health: 8000,
    maxHealth: 8000,
    team: 2,
    position: { x: -2859, y: -7535, z: 980 },
  })
  npcStore.set(706, {
    health: 12000,
    maxHealth: 12000,
    team: 2,
    position: { x: -1280, y: -8034, z: 632 },
  })
  patronPhaseStore.set(706, 0)
}

seedMockTeam2Structures()
npcStore.set(801, {
  health: 150,
  maxHealth: 150,
  team: 3,
  position: { x: 0, y: -500, z: 384 },
})
npcStore.set(802, {
  health: 150,
  maxHealth: 150,
  team: 3,
  position: { x: 40, y: -500, z: 384 },
})

const appliedModifiers: string[] = []
const entityModifiers = new Map<number, Set<string>>()
const shrineModifierErrors: string[] = []
const heldPlayerModifiers: Array<{ slot: number; mod: string; active: boolean }> = []
let activeMockAuraScale = 1.0
const spawnerBossLaneStore = new Map<number, { team: number; lane: number; reinforcementsOnly?: boolean }>()
const activeBossBots: MockPlayer[] = []
const refreshedAbilities: string[] = []
const heldModifierStates: Array<{ entity: number; state: string; active: boolean }> = []
const executedServerCommands: string[] = []
const spawnedTrooperUnits: string[] = []
const emittedSounds: Array<{ entity: number; sound: string }> = []
const firedInputs: Array<{ entity: number; input: string }> = []
const scaleStore = new Map<number, number>()
const lifeStateStore = new Map<number, number>()
const modelStore = new Map<number, string>()
const spawnerLaneStore = new Map<number, number>([
  [14053, 4],
  [14315, 4],
  [14318, 4],
  [14319, 4],
  [14291, 4],
  [14051, 1],
])
const spawnerDisableZipStore = new Map<number, boolean>()
const teamFlexSlotsStore = new Map<number, number>([[710, 0]])
const mockSettings = new Map<string, string>()
const trooperIds = new Set<number>()
const neutralIds = new Set<number>()
const necroSkeleIds = new Set<number>()
const failedCustomModifiers: string[] = []
const givenItems: Array<{ slot: number; item: string }> = []
const reportedScores: Array<{ slot: number; board: string; value: number; options: Record<string, unknown> }> = []
const addedMetrics: Array<{ slot: number; name: string; value: number }> = []
const createdEntities: Array<{ entity: number; designerName: string; team: number }> = []
const shopTriggerIds = new Set<number>()
type MockShopBounds = {
  origin: { x: number; y: number; z: number }
  scaleVec: { x: number; y: number; z: number }
  mins: { x: number; y: number; z: number }
  maxs: { x: number; y: number; z: number }
  model: string
  radius: number
  team: number
  disabled: boolean
  mapEntity: boolean
  spawnflags: number
}
const shopTriggerBounds = new Map<number, MockShopBounds>()
const pawnInShopStore = new Map<number, boolean>()
const pawnShopOpenStore = new Map<number, boolean>()
const hostCallStats = {
  pawn: 0,
  npcRead: 0,
  readField: 0,
  entityPosition: 0,
  entityClass: 0,
  moveEntity: 0,
  serverCommand: 0,
}
function resetHostCallStats(): void {
  hostCallStats.pawn = 0
  hostCallStats.npcRead = 0
  hostCallStats.readField = 0
  hostCallStats.entityPosition = 0
  hostCallStats.entityClass = 0
  hostCallStats.moveEntity = 0
  hostCallStats.serverCommand = 0
}
const seedDefaultMapShop = () => {
  shopTriggerIds.add(15001)
  shopTriggerBounds.set(15001, {
    origin: { x: -1260, y: -10141, z: 1476 },
    scaleVec: { x: 1, y: 1, z: 1 },
    mins: { x: -138, y: -138, z: -130 },
    maxs: { x: 138, y: 138, z: 130 },
    model: 'maps/dl_midtown/entities/3568_souls_dealer_shop_trigger_14781_3568_154.vmdl',
    radius: 0,
    team: 2,
    disabled: false,
    mapEntity: true,
    spawnflags: 513,
  })
  shopTriggerIds.add(15002)
  shopTriggerBounds.set(15002, {
    origin: { x: 1260, y: 10141, z: 1476 },
    scaleVec: { x: 1, y: 1, z: 1 },
    mins: { x: -138, y: -138, z: -130 },
    maxs: { x: 138, y: 138, z: 130 },
    model: 'maps/dl_midtown/entities/3578_souls_dealer_shop_trigger_14781_3578_154.vmdl',
    radius: 0,
    team: 3,
    disabled: false,
    mapEntity: true,
    spawnflags: 513,
  })
  shopTriggerIds.add(15003)
  shopTriggerBounds.set(15003, {
    origin: { x: -5600, y: -1800, z: 380 },
    scaleVec: { x: 1, y: 1, z: 1 },
    mins: { x: -144, y: -144, z: -64 },
    maxs: { x: 144, y: 144, z: 64 },
    model: 'maps/dl_midtown/entities/shop_rebel_t1_blue_shop_item_trigger_14781_901_36.vmdl',
    radius: 0,
    team: 0,
    disabled: false,
    mapEntity: true,
    spawnflags: 513,
  })
}
const syncMockShopZone = () => {
  const pos = defenderPlayer.position
  let inside = false
  for (const ent of shopTriggerIds) {
    const b = shopTriggerBounds.get(ent)
    if (!b || b.disabled) continue
    if (b.team !== 2 && b.team !== 0 && b.team !== 4) continue
    if (b.mapEntity) {
      if (!b.model) continue
      const minX = b.origin.x + b.scaleVec.x * b.mins.x
      const maxX = b.origin.x + b.scaleVec.x * b.maxs.x
      const minY = b.origin.y + b.scaleVec.y * b.mins.y
      const maxY = b.origin.y + b.scaleVec.y * b.maxs.y
      const minZ = b.origin.z + b.scaleVec.z * b.mins.z
      const maxZ = b.origin.z + b.scaleVec.z * b.maxs.z
      if (
        pos.x >= minX &&
        pos.x <= maxX &&
        pos.y >= minY &&
        pos.y <= maxY &&
        pos.z >= minZ &&
        pos.z <= maxZ
      ) {
        inside = true
        break
      }
    } else {
      // Enforce PassesTriggerFilters bit 6 (0x40) and CBaseTrigger::InitTrigger radius > 0 on mod-created triggers
      if ((b.spawnflags & 0x40) === 0 || b.radius <= 0) continue
      const dx = pos.x - b.origin.x
      const dy = pos.y - b.origin.y
      const dz = pos.z - b.origin.z
      if (dx * dx + dy * dy + dz * dz <= b.radius * b.radius) {
        inside = true
        break
      }
    }
  }
  pawnInShopStore.set(defenderPlayer.pawnEntity, inside)
}
seedDefaultMapShop()
const mockBoardPages = new Map<string, unknown>()
const mockBotPlayers: Array<{ player: MockPlayer; name: string; bot: boolean; ready: boolean; steamId: bigint; generation: number; roles: string[] }> = []
let vanillaMode = false
let reportScoreResult = true
let nextSpawnedEntityId = 2000
let probePassed = false
let probeFailedReason = ''
let groundHandler: ((pt: MockVector, opts?: unknown) => MockVector | undefined) | undefined

class MockPlayer {
  readonly slot: number
  souls = 1000
  ap = 0
  team = 2
  hero = 1
  pawnEntity = 10
  health = 700
  maxHealth = 700
  position = { x: 0, y: -1950, z: 396 }
  eyeAngles = { pitch: 0, yaw: 90, roll: 0 }
  lastDrive?: {
    facing: { pitch: number; yaw: number; roll: number }
    forward: number
    left: number
    held: bigint
    pressed: bigint
  }
  abilityList: {
    name: string
    slot: number
    entity?: number
    upgrades?: number
    charges?: number
    cooldownEnd?: number
    id?: number
    state?: number
    cooldownStart?: number
    rechargeStart?: number
    rechargeEnd?: number
    imbues?: string[]
  }[] = [
    {
      name: 'citadel_ability_primary',
      slot: 0,
      entity: 400,
      upgrades: 1,
      charges: 0,
      cooldownEnd: 0,
      id: 1,
      state: 0,
      cooldownStart: 0,
      rechargeStart: 0,
      rechargeEnd: 0,
      imbues: [],
    },
  ]
  constructor(slot: number) {
    this.slot = slot
  }
  pawn() {
    hostCallStats.pawn += 1
    return {
      entity: this.pawnEntity,
      hero: this.hero,
      team: this.team,
      health: this.health,
      maxHealth: this.maxHealth,
      position: this.position,
      eyeAngles: this.eyeAngles,
      cameraAngles: this.eyeAngles,
      generation: 1,
      souls: this.souls,
      eyePosition: {
        x: this.position.x,
        y: this.position.y,
        z: this.position.z + 64,
      },
      velocity: { x: 0, y: 0, z: 0 },
      abilityPoints: this.ap,
      abilityUnlocks: 0,
    }
  }
  setting(k: string) {
    if (k === 'wave_interval') return mockSettings.get('wave_interval') ?? '20'
    if (k === 'tome_scaling') return mockSettings.get('tome_scaling') ?? '0.06'
    if (k === 'hud_mode') return mockSettings.get('hud_mode') ?? 'full'
    return mockSettings.get(k)
  }
  respawn() {
    this.health = this.maxHealth
    lifeStateStore.set(this.pawnEntity, 0)
    return true
  }
  announce(_t: string, _m: string) {
    return true
  }
  addMetric(name: string, value: number) {
    addedMetrics.push({ slot: this.slot, name, value })
    return true
  }
  adjustSouls(delta: number) {
    this.souls += delta
    return true
  }
  adjustAbilityPoints(pts: number) {
    this.ap += pts
    return true
  }
  giveItem(item: string) {
    givenItems.push({ slot: this.slot, item })
    return true
  }
  giveModifier(mod: string) {
    if (this.hero === 0 || this.abilityList.length === 0) {
      return false
    }
    if (vanillaMode && mod.startsWith('td_')) {
      failedCustomModifiers.push(mod)
      return false
    }
    appliedModifiers.push(mod)
    if (mod === 'upgrade_colossus/modifier_colossus_active') {
      scaleStore.set(this.pawnEntity, 1.2)
    } else if (mod.startsWith('td_boss_hero_stats_')) {
      const tier = Number(mod.replace('td_boss_hero_stats_', '')) || 1
      this.maxHealth = 700 + [1750, 3250, 5500, 8500, 13000][tier - 1]
      scaleStore.set(this.pawnEntity, [1.35, 1.5, 1.65, 1.8, 1.95][tier - 1])
    } else if (mod === 'td_boss_endless_boost') {
      this.maxHealth += 1600
    } else if (mod === 'td_boss_size_step') {
      this.maxHealth = 700 + 25000
      scaleStore.set(this.pawnEntity, 2.05)
    } else if (mod.startsWith('td_creep_scale_aura_')) {
      const step = Number(mod.replace('td_creep_scale_aura_', '')) || 1
      activeMockAuraScale = Number((0.9 + (step - 1) * 0.05).toFixed(2))
      for (const [ent, s] of npcStore.entries()) {
        if (s.team === 3 && ((ent >= 800 && ent < 900) || trooperIds.has(ent))) {
          scaleStore.set(ent, activeMockAuraScale)
        }
      }
    }
    return true
  }
  holdModifier(mod: string, active?: boolean) {
    const isOn = active !== false
    heldPlayerModifiers.push({ slot: this.slot, mod, active: isOn })
    if (isOn && mod.startsWith('td_creep_scale_aura_')) {
      const step = Number(mod.replace('td_creep_scale_aura_', '')) || 1
      activeMockAuraScale = Number((0.9 + (step - 1) * 0.05).toFixed(2))
      for (const [ent, s] of npcStore.entries()) {
        if (s.team === 3 && ((ent >= 800 && ent < 900) || trooperIds.has(ent))) {
          scaleStore.set(ent, activeMockAuraScale)
        }
      }
    }
    return true
  }
  abilities() {
    return this.abilityList.map((a, idx) => ({
      entity: a.entity ?? 400 + idx,
      upgrades: a.upgrades ?? 1,
      charges: a.charges ?? 0,
      cooldownEnd: a.cooldownEnd ?? 0,
      id: a.id ?? idx + 1,
      state: a.state ?? 0,
      cooldownStart: a.cooldownStart ?? 0,
      rechargeStart: a.rechargeStart ?? 0,
      rechargeEnd: a.rechargeEnd ?? 0,
      imbues: a.imbues ?? [],
      ...a,
    }))
  }
  setAbility(opts: { ability: string; upgrades?: number; cooldownEnd?: number }) {
    const found = this.abilityList.find((a) => a.name === opts.ability)
    if (found) {
      if (opts.upgrades !== undefined) {
        found.upgrades = opts.upgrades
      }
      if (opts.cooldownEnd !== undefined) {
        found.cooldownEnd = opts.cooldownEnd
      }
    }
    return true
  }
  connection() {
    if (this === defenderPlayer) {
      return {
        player: defenderPlayer,
        name: 'Defender',
        bot: false,
        ready: true,
        steamId: 1n,
        generation: 1,
        roles: [],
      }
    }
    return mockBotPlayers.find((b) => b.player === this)
  }
  seat(_seating?: unknown) {
    return true
  }
  refreshAbility(ability: string) {
    refreshedAbilities.push(ability)
    const found = this.abilityList.find((a) => a.name === ability)
    if (found) {
      found.cooldownEnd = 0
      found.rechargeEnd = 0
    }
    return true
  }
  heal(amount: number) {
    this.health = Math.min(this.maxHealth, this.health + amount)
    return true
  }
  sound(_s: string) {
    return true
  }
  teleport(pos: { x: number; y: number; z: number }, facing?: { pitch: number; yaw: number; roll: number }) {
    this.position = { ...pos }
    if (facing) this.eyeAngles = { ...facing }
    const s = npcStore.get(this.pawnEntity)
    if (s) s.position = { ...pos }
    if (this === defenderPlayer) syncMockShopZone()
    return true
  }
  drive(cmd?: {
    facing: { pitch: number; yaw: number; roll: number }
    forward: number
    left: number
    held: bigint
    pressed: bigint
  }) {
    this.lastDrive = cmd
    if (!cmd) return true
    this.eyeAngles = { ...cmd.facing }
    const rad = (cmd.facing.yaw * Math.PI) / 180
    const fx = Math.cos(rad)
    const fy = Math.sin(rad)
    const lx = -fy
    const ly = fx
    const wx = cmd.forward * fx + cmd.left * lx
    const wy = cmd.forward * fy + cmd.left * ly
    this.position = {
      x: this.position.x + wx * 75,
      y: this.position.y + wy * 75,
      z: this.position.z,
    }
    const s = npcStore.get(this.pawnEntity)
    if (s) s.position = { ...this.position }
    if (this === defenderPlayer) syncMockShopZone()

    // Simulate primary weapon fire when Buttons.attack (1n) is held
    if ((cmd.held & 1n) !== 0n && this.team === 2) {
      const angleDiff = (a: number, b: number) => {
        let d = ((a - b + 540) % 360) - 180
        if (d < -180) d += 360
        return Math.abs(d)
      }
      for (const [ent, s] of npcStore.entries()) {
        if (s.team !== 3 || s.health <= 0) continue
        const dist = Math.hypot(s.position.x - this.position.x, s.position.y - this.position.y)
        const yawTo = (Math.atan2(s.position.y - this.position.y, s.position.x - this.position.x) * 180) / Math.PI
        if (dist <= 350 && angleDiff(cmd.facing.yaw, yawTo) <= 22) {
          s.health = Math.max(0, s.health - 45)
        }
      }
      for (const bot of activeBossBots) {
        if (bot.health <= 0) continue
        const dist = Math.hypot(bot.position.x - this.position.x, bot.position.y - this.position.y)
        const yawTo = (Math.atan2(bot.position.y - this.position.y, bot.position.x - this.position.x) * 180) / Math.PI
        if (dist <= 350 && angleDiff(cmd.facing.yaw, yawTo) <= 22) {
          bot.health = Math.max(0, bot.health - 45)
        }
      }
    }
    if ((cmd.held & 1n) !== 0n && this.team === 3) {
      const angleDiff = (a: number, b: number) => {
        let d = ((a - b + 540) % 360) - 180
        if (d < -180) d += 360
        return Math.abs(d)
      }
      const def = defenderPlayer
      const dDef = Math.hypot(def.position.x - this.position.x, def.position.y - this.position.y)
      const yawToDef = (Math.atan2(def.position.y - this.position.y, def.position.x - this.position.x) * 180) / Math.PI
      if (def.health > 0 && dDef <= 950 && angleDiff(cmd.facing.yaw, yawToDef) <= 22) {
        def.health = Math.max(0, def.health - 60)
      } else {
        const g = npcStore.get(700)
        if (g && g.health > 0) {
          const dG = Math.hypot(g.position.x - this.position.x, g.position.y - this.position.y)
          const yawToG = (Math.atan2(g.position.y - this.position.y, g.position.x - this.position.x) * 180) / Math.PI
          if (dG <= 944 && angleDiff(cmd.facing.yaw, yawToG) <= 22) {
            g.health = Math.max(0, g.health - 60)
          }
        }
      }
    }
    return true
  }
  removeBot() {
    return true
  }
}

const defenderPlayer = new MockPlayer(0)

class MockNpc {
  readonly entity: number
  constructor(entity: number) {
    this.entity = entity
  }
  read() {
    hostCallStats.npcRead += 1
    const s = npcStore.get(this.entity)
    if (!s) return undefined
    return {
      ...s,
      facing: { pitch: 0, yaw: 270, roll: 0 },
    }
  }
  setHealth(hp: number, maxHp?: number) {
    const s = npcStore.get(this.entity)
    if (!s) return false
    s.health = hp
    if (maxHp !== undefined) s.maxHealth = maxHp
    return true
  }
  move(position: { x: number; y: number; z: number }) {
    const s = npcStore.get(this.entity)
    if (!s) return false
    s.position = { ...position }
    return true
  }
  holdModifier(_mod: string, _active?: boolean) {
    return true
  }
  remove() {
    const existed = npcStore.delete(this.entity)
    trooperIds.delete(this.entity)
    neutralIds.delete(this.entity)
    necroSkeleIds.delete(this.entity)
    modelStore.delete(this.entity)
    return existed
  }
}

class MockProbeRun {
  constructor(_name: string, _timeout: number) {}
  tick(_now: number, _wait: string, stepFn: () => boolean | string) {
    const res = stepFn()
    if (res === true) {
      probePassed = true
    } else if (typeof res === 'string') {
      probeFailedReason = res
    }
  }
}

const MOCK_MODLOCK_ESM_SOURCE = "    export const Buttons = {\n      attack: 1n << 0n,\n      jump: 1n << 1n,\n      crouch: 1n << 2n,\n      dash: 1n << 3n,\n      use: 1n << 4n,\n      altFire: 1n << 5n,\n      reload: 1n << 6n,\n      melee: 1n << 7n,\n      ability1: 1n << 8n,\n      ability2: 1n << 9n,\n      ability3: 1n << 10n,\n      ultimate: 1n << 11n,\n      parry: 1n << 12n,\n    };\n    export const Layers = {\n      solid: 1n << 0n,\n      hitbox: 1n << 1n,\n      trigger: 1n << 2n,\n      playerClip: 1n << 4n,\n      player: 1n << 18n,\n      npc: 1n << 19n,\n      staticLevel: 1n << 20n,\n      hero: 1n << 21n,\n      trooper: 1n << 22n,\n      building: 1n << 23n,\n    };\n    export const trace = () => undefined;\n    export const ground = (pt, opts) => (globalThis.__mockModlock.groundHandler ? globalThis.__mockModlock.groundHandler(pt, opts) : { x: pt.x, y: pt.y, z: pt.z - 12 });\n    export const Npc = globalThis.__mockModlock.Npc;\n    export const ProbeRun = globalThis.__mockModlock.ProbeRun;\n    export const players = () => [\n      { player: globalThis.__mockModlock.defenderPlayer, name: 'Defender', bot: false, ready: true, steamId: 1n, generation: 1, roles: [] },\n      ...globalThis.__mockModlock.mockBotPlayers,\n    ];\n    export const reportScore = (player, board, value, options = {}) => {\n      globalThis.__mockModlock.reportedScores.push({ slot: player.slot, board, value, options });\n      return globalThis.__mockModlock.getReportScoreResult();\n    };\n    export const readBoard = (board, read = {}) => {\n      return globalThis.__mockModlock.mockBoardPages.get(board + ':' + (read.window ?? 'allTime'));\n    };\n    export const addBot = (opts) => {\n      const ent = globalThis.__mockModlock.allocSpawnEntity();\n      const p = new globalThis.__mockModlock.MockPlayer(2);\n      p.team = opts.team;\n      p.pawnEntity = ent;\n      p.position = opts.position ? { ...opts.position } : { x: 0, y: 1200, z: 390 };\n      if (opts.team === 3) globalThis.__mockModlock.activeBossBots.push(p);\n      globalThis.__mockModlock.npcStore.set(ent, { health: 2500, maxHealth: 2500, team: opts.team, position: { ...p.position } });\n      return p;\n    };\n    export const findEntitiesByName = (name) => {\n      globalThis.__mockModlock.entityScanStats.findByName += 1;\n      if (name.includes('boss_rebel_t1_blue')) return globalThis.__mockModlock.npcStore.has(700) ? [700] : [];\n      if (name.includes('rebels_t2_boss_blue')) return globalThis.__mockModlock.npcStore.has(701) ? [701] : [];\n      if (name.includes('rebels_watcher_blue')) return [702, 703].filter((id) => globalThis.__mockModlock.npcStore.has(id));\n      if (name.includes('amber_t3_generator_purple')) return globalThis.__mockModlock.npcStore.has(704) ? [704] : [];\n      if (name.includes('amber_t3_generator_yellow')) return globalThis.__mockModlock.npcStore.has(705) ? [705] : [];\n      return [];\n    };\n    export const findEntities = (cls) => {\n      globalThis.__mockModlock.entityScanStats.findByClass += 1;\n      if (cls === 'info_super_trooper_spawn') return [14020, 14325];\n      if (cls === 'info_trooper_spawn') return [14053, 14315, 14318, 14319, 14291, 14051];\n      if (cls === 'info_neutral_trooper_camp') return [];\n      if (cls === 'npc_trooper') return [...globalThis.__mockModlock.npcStore.keys()].filter((id) => (id >= 800 && id < 900) || globalThis.__mockModlock.trooperIds.has(id));\n      if (cls === 'npc_trooper_neutral') return [...globalThis.__mockModlock.npcStore.keys()].filter((id) => (id >= 1600 && id < 1700) || globalThis.__mockModlock.neutralIds.has(id));\n      if (cls === 'npc_necro_skele') return [...globalThis.__mockModlock.npcStore.keys()].filter((id) => globalThis.__mockModlock.necroSkeleIds.has(id));\n      if (cls === 'npc_trooper_boss') return globalThis.__mockModlock.npcStore.has(700) ? [700] : [];\n      if (cls === 'npc_boss_tier2') return globalThis.__mockModlock.npcStore.has(701) ? [701] : [];\n      if (cls === 'npc_barrack_boss') return [702, 703].filter((id) => globalThis.__mockModlock.npcStore.has(id));\n      if (cls === 'destroyable_building') return [704, 705].filter((id) => globalThis.__mockModlock.npcStore.has(id));\n      if (cls === 'npc_boss_tier3') return globalThis.__mockModlock.npcStore.has(706) ? [706] : [];\n      if (cls === 'npc_boss_tier3core') return [];\n      if (cls === 'citadel_team_manager') return [710];\n      if (cls === 'trigger_item_shop') return [...globalThis.__mockModlock.shopTriggerIds];\n      return [];\n    };\n    export const createEntity = (opts) => {\n      const ent = globalThis.__mockModlock.allocSpawnEntity();\n      globalThis.__mockModlock.createdEntities.push({\n        entity: ent,\n        designerName: opts.designerName,\n        team: opts.team,\n      });\n      if (opts.designerName === 'trigger_item_shop') {\n        globalThis.__mockModlock.shopTriggerIds.add(ent);\n        const kvModel = opts.keyValues?.find((kv) => kv.key === 'model')?.value?.text ?? '';\n        const kvRadius = opts.keyValues?.find((kv) => kv.key === 'radius')?.value?.number ?? 0;\n        const kvScales = opts.keyValues?.find((kv) => kv.key === 'scales')?.value?.vector ?? { x: 1, y: 1, z: 1 };\n        const fieldSpawnflags = Number(\n          opts.fields?.find(\n            (f) =>\n              f.className === 'CBaseEntity' &&\n              f.field === 'm_spawnflags' &&\n              f.type === 'uint32',\n          )?.value ?? 0,\n        );\n        const mins = kvModel.includes('center_shop_south_trigger')\n          ? { x: -165, y: -150, z: -122 }\n          : kvModel.includes('3568_souls_dealer_shop_trigger')\n            ? { x: -138, y: -138, z: -130 }\n            : { x: 0, y: 0, z: 0 };\n        const maxs = kvModel.includes('center_shop_south_trigger')\n          ? { x: 165, y: 150, z: 122 }\n          : kvModel.includes('3568_souls_dealer_shop_trigger')\n            ? { x: 138, y: 138, z: 130 }\n            : { x: 0, y: 0, z: 0 };\n        globalThis.__mockModlock.shopTriggerBounds.set(ent, {\n          origin: { ...opts.position },\n          scaleVec: { ...kvScales },\n          mins,\n          maxs,\n          model: kvModel,\n          radius: kvRadius,\n          team: opts.team ?? 2,\n          disabled: false,\n          mapEntity: false,\n          spawnflags: fieldSpawnflags,\n        });\n        globalThis.__mockModlock.npcStore.set(ent, {\n          health: 1,\n          maxHealth: 1,\n          team: opts.team ?? 2,\n          position: { ...opts.position },\n        });\n        globalThis.__mockModlock.syncMockShopZone();\n      }\n      return ent;\n    };\n    export const removeEntity = (entity) => {\n      if (globalThis.__mockModlock.shopTriggerBounds.get(entity)?.mapEntity) {\n        return false;\n      }\n      globalThis.__mockModlock.shopTriggerIds.delete(entity);\n      globalThis.__mockModlock.shopTriggerBounds.delete(entity);\n      globalThis.__mockModlock.npcStore.delete(entity);\n      globalThis.__mockModlock.syncMockShopZone();\n      return true;\n    };\n    export const fireInput = (entity, input, value, _activator) => {\n      globalThis.__mockModlock.firedInputs.push({ entity, input });\n      if (globalThis.__mockModlock.shopTriggerIds.has(entity) && input === 'StartTouch') {\n        throw new Error('trigger_item_shop has no input StartTouch');\n      }\n      if (globalThis.__mockModlock.shopTriggerBounds.has(entity)) {\n        const b = globalThis.__mockModlock.shopTriggerBounds.get(entity);\n        if (input === 'Enable') {\n          b.disabled = false;\n          globalThis.__mockModlock.syncMockShopZone();\n        }\n      }\n      if (input === 'SetAbsScale' && value && typeof value.number === 'number') {\n        globalThis.__mockModlock.scaleStore.set(entity, value.number);\n      }\n      if (input === 'SetHealth' && value && typeof value.integer === 'number') {\n        const s = globalThis.__mockModlock.npcStore.get(entity);\n        if (s) s.health = value.integer;\n      }\n      if (input === 'OverrideHealth' && value && typeof value.integer === 'number') {\n        const s = globalThis.__mockModlock.npcStore.get(entity);\n        if (s) s.maxHealth = value.integer;\n      }\n      return true;\n    };\n    export const damage = (opts) => {\n      const def = globalThis.__mockModlock.defenderPlayer;\n      if (opts.victim === def.pawnEntity) {\n        def.health = Math.max(0, def.health - opts.amount);\n        return true;\n      }\n      const s = globalThis.__mockModlock.npcStore.get(opts.victim);\n      if (s) s.health = Math.max(0, s.health - opts.amount);\n      return true;\n    };\n    export const emitSound = (entity, sound) => {\n      globalThis.__mockModlock.emittedSounds.push({ entity, sound });\n      return true;\n    };\n    export const killEntity = (opts) => {\n      const s = globalThis.__mockModlock.npcStore.get(opts.victim);\n      if (s) s.health = 0;\n      globalThis.__mockModlock.lifeStateStore.set(opts.victim, 2);\n      return true;\n    };\n    export const removeEntities = () => 0;\n    export const holdEntityModifier = (entity, modifier, active = true) => {\n      if (entity <= 0) return false;\n      if (modifier.startsWith('td_')) {\n        globalThis.__mockModlock.failedCustomModifiers.push(modifier);\n        return false;\n      }\n      if (entity === 704 || entity === 705) {\n        globalThis.__mockModlock.shrineModifierErrors.push('holdEntityModifier called on Shrine entity ' + entity);\n        return false;\n      }\n      let set = globalThis.__mockModlock.entityModifiers.get(entity);\n      if (!set) {\n        set = new Set();\n        globalThis.__mockModlock.entityModifiers.set(entity, set);\n      }\n      if (active === false) {\n        set.delete(modifier);\n      } else {\n        set.add(modifier);\n        globalThis.__mockModlock.appliedModifiers.push(modifier);\n      }\n      return true;\n    };\n    export const giveEntityModifier = (entity, modifier, _seconds) => {\n      return holdEntityModifier(entity, modifier, true);\n    };\n    export const modifiers = (entity) => {\n      const set = globalThis.__mockModlock.entityModifiers.get(entity);\n      if (!set) return [];\n      return [...set].map((name) => ({\n        name,\n        className: 'CCitadelModifier',\n        caster: 0,\n        ability: 0,\n        age: 0,\n        stacks: 1,\n        maxStacks: 1,\n        team: 2,\n        disabled: false,\n      }));\n    };\n    export const onKill = () => {};\n    export const onAbilityCast = () => {};\n    export const onSpawn = () => {};\n    export const holdModifierState = (entity, state, active) => {\n      globalThis.__mockModlock.heldModifierStates.push({ entity, state, active: active !== false });\n      return true;\n    };\n    export const entityClass = (entity) => {\n      globalThis.__mockModlock.hostCallStats.entityClass += 1;\n      if (entity === 704 || entity === 705) return { className: 'CDestroyableBuilding', designerName: 'destroyable_building' };\n      if ((entity >= 1600 && entity < 1700) || globalThis.__mockModlock.neutralIds.has(entity)) return { className: 'CNPC_TrooperNeutral', designerName: 'npc_trooper_neutral' };\n      if (globalThis.__mockModlock.necroSkeleIds.has(entity)) return { className: 'CNPC_NecroSkele', designerName: 'npc_necro_skele' };\n      return { className: 'CNPC_Trooper', designerName: 'npc_trooper' };\n    };\n    export const moveEntity = (entity, pos) => {\n      globalThis.__mockModlock.hostCallStats.moveEntity += 1;\n      const s = globalThis.__mockModlock.npcStore.get(entity);\n      if (s && pos) s.position = { ...pos };\n      const b = globalThis.__mockModlock.shopTriggerBounds.get(entity);\n      // Kinematic VPhysics trigger movement requires spawnflags bit 28 (0x10000000)\n      if (b && pos && (b.spawnflags & 0x10000000) !== 0) {\n        b.origin = { ...pos };\n        globalThis.__mockModlock.syncMockShopZone();\n      }\n      return true;\n    };\n    export const readModifierField = () => undefined;\n    export const entityPosition = (entity) => {\n      globalThis.__mockModlock.hostCallStats.entityPosition += 1;\n      const sb = globalThis.__mockModlock.shopTriggerBounds.get(entity);\n      if (sb) {\n        return { position: { ...sb.origin }, facing: { pitch: 0, yaw: 0, roll: 0 }, velocity: { x: 0, y: 0, z: 0 } };\n      }\n      const s = globalThis.__mockModlock.npcStore.get(entity);\n      return s ? { position: s.position, facing: { pitch: 0, yaw: 270, roll: 0 }, velocity: { x: 0, y: 0, z: 0 } } : undefined;\n    };\n    export const readField = (entity, cls, field, type) => {\n      globalThis.__mockModlock.hostCallStats.readField += 1;\n      if (field.includes('.')) {\n        throw new Error('Schema error: dotted field path is not supported: ' + field);\n      }\n      if (cls === 'CBaseEntity' && field === 'm_iTeamNum' && type !== 'uint8') {\n        throw new Error('Schema error: CBaseEntity.m_iTeamNum is smaller than its requested type ' + type);\n      }\n      if (cls === 'CBaseEntity' && field === 'm_lifeState' && type !== 'uint8') {\n        throw new Error('Schema error: CBaseEntity.m_lifeState is smaller than its requested type ' + type);\n      }\n      if (cls === 'CNPC_Boss_Tier3' && field === 'm_ePhase' && type !== 'uint32') {\n        throw new Error('Schema error: CNPC_Boss_Tier3.m_ePhase must be uint32, got ' + type);\n      }\n      if (cls === 'CCitadelTeam' && field === 'm_nFlexSlotsUnlocked' && type !== 'uint16') {\n        throw new Error('Schema error: CCitadelTeam.m_nFlexSlotsUnlocked must be uint16, got ' + type);\n      }\n      if (cls === 'CCitadelPlayerPawn' && field === 'm_bInItemShopZone') {\n        if (type !== 'bool') throw new Error('Schema error: CCitadelPlayerPawn.m_bInItemShopZone must be bool, got ' + type);\n        return globalThis.__mockModlock.pawnInShopStore.get(entity) ?? false;\n      }\n      if (cls === 'CCitadelPlayerPawn' && field === 'm_bHasShopOpen') {\n        if (type !== 'bool') throw new Error('Schema error: CCitadelPlayerPawn.m_bHasShopOpen must be bool, got ' + type);\n        if (entity === globalThis.__mockModlock.defenderPlayer.pawnEntity || globalThis.__mockModlock.npcStore.has(entity)) {\n          return globalThis.__mockModlock.pawnShopOpenStore.get(entity) ?? false;\n        }\n        return undefined;\n      }\n      if (entity === 710) {\n        if (cls === 'CBaseEntity' && field === 'm_iTeamNum') return 2;\n        if (cls === 'CCitadelTeam' && field === 'm_nFlexSlotsUnlocked') return globalThis.__mockModlock.teamFlexSlotsStore.get(710) ?? 0;\n      }\n      const bossSp = globalThis.__mockModlock.spawnerBossLaneStore?.get(entity);\n      if (bossSp) {\n        if (cls === 'CBaseEntity' && field === 'm_iTeamNum') return bossSp.team;\n        if (cls === 'CInfoTrooperBossSpawn' && field === 'm_iLane') return bossSp.lane;\n        if (cls === 'CInfoTrooperBossSpawn' && field === 'm_bReinforcementsOnly') return Boolean(bossSp.reinforcementsOnly);\n      }\n      if (cls === 'CInfoTrooperSpawn' && field === 'm_iLane') {\n        return globalThis.__mockModlock.spawnerLaneStore.get(entity);\n      }\n      if (cls === 'CInfoTrooperSpawn' && field === 'm_bDisableZiplining') {\n        return globalThis.__mockModlock.spawnerDisableZipStore.get(entity) ?? false;\n      }\n      if ([14053, 14315, 14318, 14319].includes(entity)) {\n        if (cls === 'CBaseEntity' && field === 'm_iTeamNum') return 3;\n      }\n      if (entity === 14291) {\n        if (cls === 'CBaseEntity' && field === 'm_iTeamNum') return 2;\n      }\n      if (entity === 14051) {\n        if (cls === 'CBaseEntity' && field === 'm_iTeamNum') return 3;\n      }\n      if (cls === 'CNPC_Boss_Tier3' && field === 'm_ePhase') {\n        return globalThis.__mockModlock.patronPhaseStore.get(entity) ?? 0;\n      }\n      if (cls === 'CGameSceneNode' && field === 'm_flScale') {\n        return globalThis.__mockModlock.scaleStore.get(entity);\n      }\n      if (cls === 'CBaseEntity' && field === 'm_lifeState') {\n        return globalThis.__mockModlock.lifeStateStore.get(entity) ?? 0;\n      }\n      if (cls === 'CModelState' && field === 'm_ModelName') {\n        const sb = globalThis.__mockModlock.shopTriggerBounds.get(entity);\n        if (sb) return '';\n        return globalThis.__mockModlock.modelStore.get(entity);\n      }\n      const shopBound = globalThis.__mockModlock.shopTriggerBounds.get(entity);\n      if (shopBound) {\n        if (cls === 'CBaseEntity' && field === 'm_iTeamNum') {\n          if (type !== 'uint8') throw new Error('Schema error: m_iTeamNum must be uint8, got ' + type);\n          return shopBound.team;\n        }\n        if (cls === 'CBaseTrigger' && field === 'm_bDisabled') {\n          if (type !== 'bool') throw new Error('Schema error: m_bDisabled must be bool, got ' + type);\n          return shopBound.disabled;\n        }\n      }\n      const s = globalThis.__mockModlock.npcStore.get(entity);\n      if (s && cls === 'CBaseEntity') {\n        if (field === 'm_iHealth') return s.health;\n        if (field === 'm_iMaxHealth') return s.maxHealth;\n        if (field === 'm_iTeamNum') return s.team;\n      }\n      return undefined;\n    };\n    export const writeField = (entity, cls, field, type, val) => {\n      if (field.includes('.')) {\n        throw new Error('Schema error: dotted field path is not supported: ' + field);\n      }\n      if (cls === 'CInfoTrooperSpawn' && field === 'm_iLane' && typeof val === 'number') {\n        globalThis.__mockModlock.spawnerLaneStore.set(entity, val);\n      }\n      if (cls === 'CInfoTrooperSpawn' && field === 'm_bDisableZiplining' && typeof val === 'boolean') {\n        globalThis.__mockModlock.spawnerDisableZipStore.set(entity, val);\n      }\n      if (cls === 'CCitadelTeam' && field === 'm_nFlexSlotsUnlocked' && typeof val === 'number') {\n        if (type !== 'uint16') throw new Error('Schema error: m_nFlexSlotsUnlocked must be uint16');\n        globalThis.__mockModlock.teamFlexSlotsStore.set(entity, val);\n      }\n      if (cls === 'CGameSceneNode' && field === 'm_flScale' && typeof val === 'number') {\n        globalThis.__mockModlock.scaleStore.set(entity, val);\n      }\n      if (cls === 'CBaseTrigger' && field === 'm_bDisabled' && typeof val === 'boolean') {\n        const sb = globalThis.__mockModlock.shopTriggerBounds.get(entity);\n        if (sb) {\n          sb.disabled = val;\n          globalThis.__mockModlock.syncMockShopZone();\n        }\n      }\n      if (cls === 'CBaseEntity' && field === 'm_iTeamNum' && typeof val === 'number') {\n        const sb = globalThis.__mockModlock.shopTriggerBounds.get(entity);\n        if (sb) {\n          sb.team = val;\n          globalThis.__mockModlock.syncMockShopZone();\n        }\n      }\n      const s = globalThis.__mockModlock.npcStore.get(entity);\n      if (s && cls === 'CBaseEntity' && typeof val === 'number') {\n        if (field === 'm_iHealth') s.health = val;\n        if (field === 'm_iMaxHealth') s.maxHealth = val;\n      }\n      return true;\n    };\n    export const spawnNpc = (opts) => {\n      if (globalThis.__mockModlock.isVanillaMode() && opts.unit.startsWith('td_')) {\n        return undefined;\n      }\n      const ent = globalThis.__mockModlock.allocSpawnEntity();\n      globalThis.__mockModlock.spawnedTrooperUnits.push(opts.unit);\n      if (opts.className === 'npc_trooper') {\n        globalThis.__mockModlock.trooperIds.add(ent);\n      } else if (opts.className === 'npc_trooper_neutral') {\n        globalThis.__mockModlock.neutralIds.add(ent);\n      } else if (opts.className === 'npc_necro_skele') {\n        globalThis.__mockModlock.necroSkeleIds.add(ent);\n      }\n      const defaultHp = opts.unit === 'trooper_melee' ? (globalThis.__mockModlock.isVanillaMode() ? 400 : 413) : 150;\n      if (opts.unit === 'trooper_melee') {\n        globalThis.__mockModlock.modelStore.set(\n          ent,\n          globalThis.__mockModlock.isVanillaMode()\n            ? 'models/npc_units/trooper/sapphire_trooper_01_melee.vmdl'\n            : 'models/heroes_wip/necro/necro_shambler.vmdl'\n        );\n      } else if (opts.unit === 'npc_necro_skele') {\n        globalThis.__mockModlock.modelStore.set(ent, 'models/heroes_wip/necro/necro_shambler.vmdl');\n      }\n      globalThis.__mockModlock.npcStore.set(ent, {\n        health: opts.health ?? defaultHp,\n        maxHealth: opts.maxHealth ?? opts.health ?? defaultHp,\n        team: opts.team,\n        position: { ...opts.position },\n      });\n      return new globalThis.__mockModlock.Npc(ent);\n    };\n    export const serverCommand = (cmd) => {\n      globalThis.__mockModlock.hostCallStats.serverCommand += 1;\n      globalThis.__mockModlock.executedServerCommands.push(cmd);\n      return true;\n    };\n    export const frameClock = {\n      startMs: 0,\n      begin() { this.startMs = performance.now(); },\n      get elapsed() { return performance.now() - this.startMs; },\n      lap(_system) {},\n      end(_tick) {},\n    };\n    export const toast = () => {};\n    export const log = () => true;\n  "

export function createMockModlockEsmSource(): string {
  return MOCK_MODLOCK_ESM_SOURCE
}

export const mockHost = {
  Npc: MockNpc,
  ProbeRun: MockProbeRun,
  MockPlayer,
  defenderPlayer,
  npcStore,
  appliedModifiers,
  entityModifiers,
  shrineModifierErrors,
  heldPlayerModifiers,
  executedServerCommands,
  spawnedTrooperUnits,
  emittedSounds,
  trooperIds,
  neutralIds,
  necroSkeleIds,
  isVanillaMode: (): boolean => vanillaMode,
  get vanillaMode(): boolean {
    return vanillaMode
  },
  set vanillaMode(v: boolean) {
    vanillaMode = v
  },
  getReportScoreResult: (): boolean => reportScoreResult,
  get reportScoreResult(): boolean {
    return reportScoreResult
  },
  set reportScoreResult(v: boolean) {
    reportScoreResult = v
  },
  get probePassed(): boolean {
    return probePassed
  },
  set probePassed(v: boolean) {
    probePassed = v
  },
  get probeFailedReason(): string {
    return probeFailedReason
  },
  set probeFailedReason(v: string) {
    probeFailedReason = v
  },
  get groundHandler():
    | ((pt: MockVector, opts?: unknown) => MockVector | undefined)
    | undefined {
    return groundHandler
  },
  set groundHandler(
    fn: ((pt: MockVector, opts?: unknown) => MockVector | undefined) | undefined,
  ) {
    groundHandler = fn
  },
  modelStore,
  allocSpawnEntity: (): number => ++nextSpawnedEntityId,
  activeBossBots,
  refreshedAbilities,
  heldModifierStates,
  firedInputs,
  scaleStore,
  lifeStateStore,
  patronPhaseStore,
  spawnerLaneStore,
  spawnerDisableZipStore,
  spawnerBossLaneStore,
  teamFlexSlotsStore,
  mockSettings,
  failedCustomModifiers,
  givenItems,
  reportedScores,
  addedMetrics,
  createdEntities,
  shopTriggerIds,
  shopTriggerBounds,
  seedMockTeam2Structures,
  seedDefaultMapShop,
  syncMockShopZone,
  pawnInShopStore,
  pawnShopOpenStore,
  hostCallStats,
  resetHostCallStats,
  mockBoardPages,
  mockBotPlayers,
  entityScanStats: { findByClass: 0, findByName: 0 },
}

export function resetMockHost(): void {
  npcStore.clear()
  patronPhaseStore.clear()
  seedMockTeam2Structures()
  npcStore.set(801, {
    health: 150,
    maxHealth: 150,
    team: 3,
    position: { x: 0, y: -500, z: 384 },
  })
  npcStore.set(802, {
    health: 150,
    maxHealth: 150,
    team: 3,
    position: { x: 40, y: -500, z: 384 },
  })
  appliedModifiers.length = 0
  entityModifiers.clear()
  shrineModifierErrors.length = 0
  heldPlayerModifiers.length = 0
  activeMockAuraScale = 1.0
  activeBossBots.length = 0
  refreshedAbilities.length = 0
  heldModifierStates.length = 0
  executedServerCommands.length = 0
  spawnedTrooperUnits.length = 0
  emittedSounds.length = 0
  firedInputs.length = 0
  scaleStore.clear()
  lifeStateStore.clear()
  modelStore.clear()
  spawnerLaneStore.clear()
  spawnerLaneStore.set(14053, 4)
  spawnerLaneStore.set(14315, 4)
  spawnerLaneStore.set(14318, 4)
  spawnerLaneStore.set(14319, 4)
  spawnerLaneStore.set(14291, 4)
  spawnerLaneStore.set(14051, 1)
  spawnerDisableZipStore.clear()
  spawnerBossLaneStore.clear()
  teamFlexSlotsStore.clear()
  teamFlexSlotsStore.set(710, 0)
  mockSettings.clear()
  trooperIds.clear()
  neutralIds.clear()
  necroSkeleIds.clear()
  failedCustomModifiers.length = 0
  givenItems.length = 0
  reportedScores.length = 0
  addedMetrics.length = 0
  createdEntities.length = 0
  shopTriggerIds.clear()
  shopTriggerBounds.clear()
  pawnInShopStore.clear()
  pawnShopOpenStore.clear()
  resetHostCallStats()
  seedDefaultMapShop()
  mockBoardPages.clear()
  mockBotPlayers.length = 0
  vanillaMode = false
  reportScoreResult = true
  nextSpawnedEntityId = 2000
  probePassed = false
  probeFailedReason = ''
  groundHandler = undefined
  mockHost.entityScanStats.findByClass = 0
  mockHost.entityScanStats.findByName = 0

  defenderPlayer.souls = 1000
  defenderPlayer.ap = 0
  defenderPlayer.team = 2
  defenderPlayer.hero = 1
  defenderPlayer.pawnEntity = 10
  defenderPlayer.health = 700
  defenderPlayer.maxHealth = 700
  defenderPlayer.position = { x: 0, y: -1950, z: 396 }
  defenderPlayer.eyeAngles = { pitch: 0, yaw: 90, roll: 0 }
  defenderPlayer.lastDrive = undefined
  defenderPlayer.abilityList = [
    {
      name: 'citadel_ability_primary',
      slot: 0,
      entity: 400,
      upgrades: 1,
      charges: 0,
      cooldownEnd: 0,
      id: 1,
      state: 0,
      cooldownStart: 0,
      rechargeStart: 0,
      rechargeEnd: 0,
      imbues: [],
    },
  ]
}

;(globalThis as Record<string, unknown>).__mockModlock = mockHost
