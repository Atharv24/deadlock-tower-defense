import type { Item, Player } from 'modlock'
import { formatSoulsCount } from '@base/format'

/** Soul cost for Tier-5 Legendary items in custom Armory shops. */
export const LEGENDARY_ITEM_COST_SOULS = 9600

/** Official Deadlock localized display names for Tier-5 Legendary items (`citadel_gc_mod_names_english.txt`). */
export const ITEM_DISPLAY_TITLES: Readonly<Record<string, string>> = {
  upgrade_celestial_guidance: 'Celestial Blessing',
  upgrade_eldritch_shot: 'Haunting Shot',
  upgrade_icarus_wings: 'Seraphim Wings',
  upgrade_infinite_rounds: 'Infinite Rounds',
  upgrade_mystical_piano: 'Mystical Piano',
  upgrade_nullification_aura: 'Nullification Burst',
  upgrade_omnicharge_pendant: 'Omnicharge Signet',
  upgrade_prism_blast: 'Prism Blast',
  upgrade_shrink_ray: 'Shrink Ray',
}

/** Formats an internal item class name (e.g. `upgrade_eldritch_shot` -> `Haunting Shot`) for display. */
export function formatItemDisplayTitle(itemName: string): string {
  const mapped = ITEM_DISPLAY_TITLES[itemName]
  if (mapped) {
    return mapped
  }
  return itemName
    .replace(/^upgrade_/, '')
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export interface LegendaryPurchaseInput {
  readonly hasLivingHero: boolean
  readonly souls: number
  readonly itemName: string
  readonly ownedItemNames: readonly string[]
  readonly cost?: number
}

export type LegendaryPurchaseResult =
  | { readonly ok: true; readonly cost: number }
  | { readonly ok: false; readonly reason: string }

/** Pure validation for purchasing a Tier-5 Legendary item. */
export function evaluateLegendaryPurchase(
  opts: LegendaryPurchaseInput,
): LegendaryPurchaseResult {
  const cost = opts.cost ?? LEGENDARY_ITEM_COST_SOULS
  if (!opts.hasLivingHero) {
    return { ok: false, reason: 'Deploy a living hero before buying Legendary items.' }
  }
  if (opts.ownedItemNames.includes(opts.itemName)) {
    return {
      ok: false,
      reason: `You already own ${formatItemDisplayTitle(opts.itemName)}.`,
    }
  }
  if (opts.souls < cost) {
    return {
      ok: false,
      reason: `Need ${formatSoulsCount(cost)} Souls for ${formatItemDisplayTitle(opts.itemName)} (have ${formatSoulsCount(opts.souls)}).`,
    }
  }
  return { ok: true, cost }
}

/** Executes a complete Soul-backed Legendary item purchase for `player`, refunding cleanly on equip failure. */
export function purchaseLegendaryItemForPlayer(
  player: Player,
  item: Item,
  requiredTeam = 2,
  cost?: number,
): LegendaryPurchaseResult {
  const pawn = player.pawn()
  const hasLivingHero = Boolean(
    pawn && pawn.team === requiredTeam && pawn.hero > 0 && pawn.health > 0,
  )
  const ownedNames = player.abilities().map((a) => a.name)
  const check = evaluateLegendaryPurchase({
    hasLivingHero,
    souls: pawn ? Math.floor(pawn.souls) : 0,
    itemName: item.name,
    ownedItemNames: ownedNames,
    cost,
  })
  if (!check.ok) {
    return check
  }

  player.adjustSouls(-check.cost)
  const granted = item.imbue
    ? [0, 1, 2, 3].some((slotIdx) => player.giveItem(item.name, slotIdx))
    : player.giveItem(item.name)

  if (!granted) {
    player.adjustSouls(check.cost)
    return {
      ok: false,
      reason: item.imbue
        ? `No compatible ability slot for ${formatItemDisplayTitle(item.name)}. Souls refunded.`
        : `Could not equip ${formatItemDisplayTitle(item.name)} (check active/inventory slots). Souls refunded.`,
    }
  }

  return check
}
