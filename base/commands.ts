/** Developer/sandbox slash commands disabled in normal & hosted matches unless `--arg dev` is set. */
export const DEV_COMMAND_NAMES = [
  'skipwave',
  'boss',
  'granttome',
  'tomescale',
  'souls',
] as const

export interface ParsedSlashCommand {
  readonly name: string
  readonly args: string
}

/**
 * Parses a slash command from a chat line (e.g. "/boon 2" -> { name: "boon", args: "2" }),
 * allowing slash commands to execute identically in Team Chat (`!line.all`) and All-Chat.
 */
export function parseSlashCommandLine(
  text: string,
): ParsedSlashCommand | undefined {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/') || trimmed.length < 2) {
    return undefined
  }
  const body = trimmed.slice(1).trim()
  if (!body) {
    return undefined
  }
  const spaceIdx = body.search(/\s/)
  if (spaceIdx < 0) {
    return { name: body.toLowerCase(), args: '' }
  }
  return {
    name: body.slice(0, spaceIdx).toLowerCase(),
    args: body.slice(spaceIdx + 1).trim(),
  }
}

/** Returns true only when `modlock dev --arg dev` (or `--watch --arg dev`) was passed on server startup. */
export function isLocalDevModeArgs(args: readonly string[]): boolean {
  return args.some((arg) => arg.trim().toLowerCase() === 'dev')
}

export interface DevCommandGateInput {
  readonly devModeEnabled: boolean
  readonly isBot: boolean
  readonly roles: readonly string[]
}

/**
 * Evaluates whether a connection may execute developer commands.
 * Requires BOTH server startup `--arg dev` AND Modlock's `'developer'` role on a non-bot connection.
 */
export function canExecuteDevCommand(params: DevCommandGateInput): boolean {
  return Boolean(
    params.devModeEnabled &&
      !params.isBot &&
      params.roles.includes('developer'),
  )
}

export interface RestartMatchGateInput {
  readonly matchState: 'waiting' | 'active' | 'defeat' | 'victory'
  readonly humanPlayerCount: number
  readonly isLocalDevPlayer: boolean
}

/**
 * Prevents co-op griefing via `/restarttd` while a multi-player run is still active,
 * while allowing restarts after Defeat, in solo runs (`<= 1` human), or in local `--arg dev` mode.
 */
export function canPlayerRestartActiveMatch(
  params: RestartMatchGateInput,
): boolean {
  return (
    params.matchState === 'defeat' ||
    params.isLocalDevPlayer ||
    params.humanPlayerCount <= 1
  )
}
