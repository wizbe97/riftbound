// // src/types/riftboundGame.ts
// import type { Timestamp } from 'firebase/firestore'

// export type LobbyPlayer = {
//   uid: string
//   username: string
// }

// export type Lobby = {
//   id: string
//   hostUid: string
//   hostUsername: string
//   status: 'open' | 'in-game' | 'closed'
//   mode: 'private'
//   p1: LobbyPlayer | null
//   p2: LobbyPlayer | null
//   spectators: LobbyPlayer[]
//   rules: {
//     bestOf: 1 | 3
//     sideboard: boolean
//   }
//   p1DeckId?: string | null
//   p2DeckId?: string | null
//   p1LegendCardId?: string | null
//   p1ChampionCardId?: string | null
//   p2LegendCardId?: string | null
//   p2ChampionCardId?: string | null
// }

// export type Role = 'p1' | 'p2' | 'spectator' | 'none'

// export type DeckCardDoc = { cardId: string; quantity: number }

// export type DeckDoc = {
//   name: string
//   ownerUid: string
//   cards: DeckCardDoc[]
//   sideboard?: DeckCardDoc[]
//   legendCardId?: string | null
//   championCardId?: string | null
//   createdAt?: Timestamp
//   updatedAt?: Timestamp
// }

// export type DeckSummary = {
//   id: string
//   name: string
//   cardCount: number
//   legendCardId: string | null
//   championCardId: string | null
// }
