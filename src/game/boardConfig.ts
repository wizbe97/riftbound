// src/game/boardConfig.ts
import type { Role } from '../types/riftboundGame'

export type CardKey = 'p1Legend' | 'p1Champion' | 'p2Legend' | 'p2Champion'

export const CARD_KEYS: CardKey[] = [
  'p1Legend',
  'p1Champion',
  'p2Legend',
  'p2Champion',
]

export type BoardZoneId =
  | 'p1LegendZone'
  | 'p1ChampionZone'
  | 'p1Base'
  | 'p1RuneChannel'
  | 'p1RuneDeck'
  | 'p1Discard'
  | 'p1Deck'
  | 'p2LegendZone'
  | 'p2ChampionZone'
  | 'p2Base'
  | 'p2RuneChannel'
  | 'p2RuneDeck'
  | 'p2Discard'
  | 'p2Deck'
  | 'battlefieldLeftP1'
  | 'battlefieldLeftP2'
  | 'battlefieldRightP1'
  | 'battlefieldRightP2'

export type BoardCardPlacement = {
  zoneId: BoardZoneId
  rotation: number // 0 or 90
}

export type BoardState = Record<CardKey, BoardCardPlacement>

export const DEFAULT_BOARD_STATE: BoardState = {
  p1Legend: { zoneId: 'p1LegendZone', rotation: 0 },
  p1Champion: { zoneId: 'p1ChampionZone', rotation: 0 },
  p2Legend: { zoneId: 'p2LegendZone', rotation: 0 },
  p2Champion: { zoneId: 'p2ChampionZone', rotation: 0 },
}

/** Zones a given role is allowed to drop into */
export const OWN_ZONES: Record<'p1' | 'p2', BoardZoneId[]> = {
  p1: [
    'p1LegendZone',
    'p1ChampionZone',
    'p1Base',
    'p1RuneChannel',
    'p1RuneDeck',
    'p1Discard',
    'p1Deck',
    'battlefieldLeftP1',
    'battlefieldRightP1',
  ],
  p2: [
    'p2LegendZone',
    'p2ChampionZone',
    'p2Base',
    'p2RuneChannel',
    'p2RuneDeck',
    'p2Discard',
    'p2Deck',
    'battlefieldLeftP2',
    'battlefieldRightP2',
  ],
}

export const PILE_ZONES: BoardZoneId[] = [
  'p1Discard',
  'p1Deck',
  'p2Discard',
  'p2Deck',
]

export const isPileZone = (zoneId: BoardZoneId): boolean =>
  PILE_ZONES.includes(zoneId)

export const canRoleUseZone = (role: Role, zoneId: BoardZoneId): boolean => {
  if (role !== 'p1' && role !== 'p2') return false
  return OWN_ZONES[role].includes(zoneId)
}
