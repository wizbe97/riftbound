// src/game/gameMechanics.ts

// Who is the viewer / actor in rules terms
export type Role = 'p1' | 'p2' | 'spectator' | 'none';

// All zones that can exist on the board.
// These are used for layout (MatchGamePage) and later for rules.
export type BoardZoneId =
  | 'p1LegendZone'
  | 'p1ChampionZone'
  | 'p1Base'
  | 'p1RuneChannel'
  | 'p1RuneDeck'
  | 'p1Discard'
  | 'p1Deck'
  | 'p1Hand'
  | 'p2LegendZone'
  | 'p2ChampionZone'
  | 'p2Base'
  | 'p2RuneChannel'
  | 'p2RuneDeck'
  | 'p2Discard'
  | 'p2Deck'
  | 'p2Hand'
  | 'battlefieldLeftP1'
  | 'battlefieldLeftP2'
  | 'battlefieldRightP1'
  | 'battlefieldRightP2';


export const PILE_ZONES: BoardZoneId[] = [
  'p1Discard',
  'p1Deck',
  'p2Discard',
  'p2Deck',
];

export const isPileZone = (zoneId: BoardZoneId): boolean =>
  PILE_ZONES.includes(zoneId);
