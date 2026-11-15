import {
  createEntity,
  entityPosition,
  fireInput,
  moveEntity,
  readField,
  removeEntity,
  writeField,
  type Vector,
} from 'modlock'

export const ARENA_SHOP_TRIGGER_ORIGIN: Vector = { x: 0, y: -4800, z: 600 }
export const ARENA_SHOP_TRIGGER_RADIUS = 16000
export const PERSONAL_SHOP_TRIGGER_RADIUS = 256
// Bit 0 (clients) | Bit 1 (NPCs/bot pawns) | Bit 6 (allow all pawns incl. bots) | Bit 28 (kinematic moveable VPhysics trigger)
export const SHOP_TRIGGER_SPAWNFLAGS = 0x10000043

interface PersonalShopTrigger {
  triggerEnt: number
  lastPawnPos: Vector
  nudgeToggle: boolean
}

/**
 * Grants Buy Anywhere without `sv_cheats 1`: manages a Layer-A arena-wide Rubikon
 * sphere `trigger_item_shop` volume plus Layer-B kinematic `1 << 28` per-pawn sphere
 * triggers so native VPhysics `CTriggerItemShop::StartTouch` keeps
 * `CCitadelPlayerPawn.m_bInItemShopZone=true` across the entire map.
 */
export class ShopZoneController {
  private readonly team: number
  private shopTriggerEntity = 0
  private readonly personalShopTriggers = new Map<number, PersonalShopTrigger>()

  constructor(team = 2) {
    this.team = team
  }

  /** Removes all arena and personal shop trigger entities managed by this controller. */
  cleanup(): void {
    if (this.shopTriggerEntity > 0) {
      removeEntity(this.shopTriggerEntity)
      this.shopTriggerEntity = 0
    }
    for (const entry of this.personalShopTriggers.values()) {
      removeEntity(entry.triggerEnt)
    }
    this.personalShopTriggers.clear()
  }

  /** Removes any personal shop trigger attached to a dead or disconnected pawn. */
  releasePawn(pawnEntity: number): void {
    const entry = this.personalShopTriggers.get(pawnEntity)
    if (!entry) {
      return
    }
    removeEntity(entry.triggerEnt)
    this.personalShopTriggers.delete(pawnEntity)
  }

  private isTriggerEntityValid(triggerEnt: number): boolean {
    return (
      triggerEnt > 0 &&
      readField(triggerEnt, 'CBaseEntity', 'm_iTeamNum', 'uint8') !== undefined
    )
  }

  private configureShopTrigger(triggerEnt: number): void {
    writeField(triggerEnt, 'CBaseEntity', 'm_iTeamNum', 'uint8', this.team)
    writeField(triggerEnt, 'CBaseTrigger', 'm_bDisabled', 'bool', false)
    writeField(triggerEnt, 'CTriggerItemShop', 'm_vAudioOffset', 'vector', {
      x: 0,
      y: 0,
      z: 0,
    })
    fireInput(triggerEnt, 'Enable')
  }

  private spawnShopSphereTrigger(origin: Vector, radius: number): number {
    const created = createEntity({
      designerName: 'trigger_item_shop',
      subclass: '',
      team: this.team,
      position: origin,
      facing: { pitch: 0, yaw: 0, roll: 0 },
      keyValues: [
        { key: 'origin', value: { vector: origin } },
        { key: 'radius', value: { number: radius } },
        { key: 'okifnomodel', value: { boolean: true } },
        { key: 'StartDisabled', value: { boolean: false } },
        { key: 'spawnflags', value: { integer: SHOP_TRIGGER_SPAWNFLAGS } },
      ],
      fields: [
        {
          className: 'CBaseEntity',
          field: 'm_spawnflags',
          type: 'uint32',
          value: SHOP_TRIGGER_SPAWNFLAGS,
        },
        {
          className: 'CBaseTrigger',
          field: 'm_bDisabled',
          type: 'bool',
          value: false,
        },
        {
          className: 'CTriggerItemShop',
          field: 'm_vAudioOffset',
          type: 'vector',
          value: { x: 0, y: 0, z: 0 },
        },
      ],
    })
    if (created && created > 0) {
      this.configureShopTrigger(created)
      return created
    }
    return 0
  }

  /**
   * Ensures `pawnEntity` stays inside an active team `trigger_item_shop` volume
   * and returns whether `m_bInItemShopZone` is currently true.
   */
  ensureShopAccess(pawnEntity: number, pawnPosition?: Vector): boolean {
    if (pawnEntity <= 0) {
      return false
    }

    let justCreatedArenaTrigger = false
    if (this.shopTriggerEntity <= 0) {
      const created = this.spawnShopSphereTrigger(
        ARENA_SHOP_TRIGGER_ORIGIN,
        ARENA_SHOP_TRIGGER_RADIUS,
      )
      if (created > 0) {
        this.shopTriggerEntity = created
        justCreatedArenaTrigger = true
      }
    }

    const inShopNow =
      readField(pawnEntity, 'CCitadelPlayerPawn', 'm_bInItemShopZone', 'bool') ===
      true
    if (inShopNow) {
      return true
    }

    if (
      !justCreatedArenaTrigger &&
      !this.isTriggerEntityValid(this.shopTriggerEntity)
    ) {
      const created = this.spawnShopSphereTrigger(
        ARENA_SHOP_TRIGGER_ORIGIN,
        ARENA_SHOP_TRIGGER_RADIUS,
      )
      if (created > 0) {
        this.shopTriggerEntity = created
        if (
          readField(pawnEntity, 'CCitadelPlayerPawn', 'm_bInItemShopZone', 'bool') ===
          true
        ) {
          return true
        }
      }
    }

    for (const [trackedPawn, entry] of this.personalShopTriggers) {
      const lifeState = readField(trackedPawn, 'CBaseEntity', 'm_lifeState', 'uint8')
      if (typeof lifeState !== 'number' || lifeState !== 0) {
        removeEntity(entry.triggerEnt)
        this.personalShopTriggers.delete(trackedPawn)
      }
    }

    const pos = pawnPosition ?? entityPosition(pawnEntity)?.position
    if (pos) {
      let personal = this.personalShopTriggers.get(pawnEntity)
      if (personal && !this.isTriggerEntityValid(personal.triggerEnt)) {
        this.personalShopTriggers.delete(pawnEntity)
        personal = undefined
      }

      const zOffset = personal?.nudgeToggle ? 420 : 36
      const targetOrigin: Vector = {
        x: pos.x,
        y: pos.y,
        z: pos.z + zOffset,
      }
      if (!personal) {
        const pEnt = this.spawnShopSphereTrigger(
          targetOrigin,
          PERSONAL_SHOP_TRIGGER_RADIUS,
        )
        if (pEnt > 0) {
          this.personalShopTriggers.set(pawnEntity, {
            triggerEnt: pEnt,
            lastPawnPos: { ...pos },
            nudgeToggle: true,
          })
        }
      } else {
        this.configureShopTrigger(personal.triggerEnt)
        moveEntity(personal.triggerEnt, targetOrigin, {
          pitch: 0,
          yaw: 0,
          roll: 0,
        })
        personal.lastPawnPos = { ...pos }
        personal.nudgeToggle = !personal.nudgeToggle
      }
    }

    return (
      readField(pawnEntity, 'CCitadelPlayerPawn', 'm_bInItemShopZone', 'bool') ===
      true
    )
  }
}
