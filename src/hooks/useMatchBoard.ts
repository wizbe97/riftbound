// // src/hooks/useMatchBoard.ts
// import { useEffect, useMemo, useState } from 'react';
// import { doc, getDoc, onSnapshot, type DocumentData } from 'firebase/firestore';
// import { db } from '../firebase';

// import type { BoardZoneId, CardKey, BoardState } from '../game/boardConfig';
// import { CARD_KEYS, DEFAULT_BOARD_STATE } from '../game/boardConfig';
// import type { Role } from '../types/riftboundGame';
// import type { RiftboundCard } from '../data/riftboundCards';
// import { ALL_CARDS } from '../data/riftboundCards';

// // ---- Lobby types (match what you're already using in lobby/deck select) ----

// type LobbyPlayer = {
//   uid: string;
//   username: string;
// };

// type LobbySpectator = {
//   uid: string;
//   username: string;
// };

// type LobbyRules = {
//   bestOf: 1 | 3;
//   sideboard: boolean;
// };

// type SelectedDeckInfo = {
//   ownerUid: string;
//   deckId: string;
//   deckName: string;
// };

// type Lobby = {
//   id: string;
//   hostUid: string;
//   hostUsername: string;
//   status: 'open' | 'selecting-decks' | 'in-game' | 'closed';
//   mode: 'private';
//   p1: LobbyPlayer | null;
//   p2: LobbyPlayer | null;
//   spectators: LobbySpectator[];
//   p1Ready: boolean;
//   p2Ready: boolean;
//   rules: LobbyRules;
//   p1Deck: SelectedDeckInfo | null;
//   p2Deck: SelectedDeckInfo | null;
// };

// type DeckCardDoc = { cardId: string; quantity: number };

// type DeckDoc = {
//   name: string;
//   ownerUid: string;
//   cards: DeckCardDoc[];
//   sideboard?: DeckCardDoc[];
//   legendCardId?: string | null;
//   championCardId?: string | null;
// };

// function mapLobby(id: string, data: DocumentData): Lobby {
//   const rawRules = (data.rules ?? {}) as Partial<LobbyRules>;
//   const rules: LobbyRules = {
//     bestOf: rawRules.bestOf === 3 ? 3 : 1,
//     sideboard: !!rawRules.sideboard,
//   };

//   const rawP1Deck = (data.p1Deck ?? null) as Partial<SelectedDeckInfo> | null;
//   const rawP2Deck = (data.p2Deck ?? null) as Partial<SelectedDeckInfo> | null;

//   const p1Deck: SelectedDeckInfo | null = rawP1Deck
//     ? {
//         ownerUid: rawP1Deck.ownerUid ?? '',
//         deckId: rawP1Deck.deckId ?? '',
//         deckName: rawP1Deck.deckName ?? 'Unknown Deck',
//       }
//     : null;

//   const p2Deck: SelectedDeckInfo | null = rawP2Deck
//     ? {
//         ownerUid: rawP2Deck.ownerUid ?? '',
//         deckId: rawP2Deck.deckId ?? '',
//         deckName: rawP2Deck.deckName ?? 'Unknown Deck',
//       }
//     : null;

//   return {
//     id,
//     hostUid: data.hostUid,
//     hostUsername: data.hostUsername,
//     status: (data.status ?? 'open') as Lobby['status'],
//     mode: 'private',
//     p1: data.p1 ?? null,
//     p2: data.p2 ?? null,
//     spectators: data.spectators ?? [],
//     p1Ready: !!data.p1Ready,
//     p2Ready: !!data.p2Ready,
//     rules,
//     p1Deck,
//     p2Deck,
//   };
// }

// // ---- Board card mapping ----

// export type ZoneCardRender = {
//   cardKey: CardKey;
//   card: RiftboundCard;
//   rotation: number;
// };

// export type ZoneCardsMap = Partial<Record<BoardZoneId, ZoneCardRender>>;

// type CardsByKey = Partial<Record<CardKey, RiftboundCard>>;

// export type UseMatchBoardResult = {
//   loading: boolean;
//   lobby: Lobby | null;
//   currentRole: Role;
//   bottomPlayer: 'p1' | 'p2';
//   topPlayer: 'p1' | 'p2';
//   bottomName: string;
//   topName: string;
//   zoneCards: ZoneCardsMap;
// };

// export function useMatchBoard(
//   lobbyId: string | undefined,
//   userUid?: string | null,
// ): UseMatchBoardResult {
//   const [lobby, setLobby] = useState<Lobby | null>(null);
//   const [loading, setLoading] = useState(true);

//   const [cardsByKey, setCardsByKey] = useState<CardsByKey>({});

//   const cardById = useMemo(() => {
//     const map = new Map<string, RiftboundCard>();
//     for (const c of ALL_CARDS) map.set(c.id, c);
//     return map;
//   }, []);

//   // Subscribe to lobby
//   useEffect(() => {
//     if (!lobbyId) {
//       setLobby(null);
//       setLoading(false);
//       return;
//     }

//     const lobbyRef = doc(db, 'lobbies', lobbyId);
//     const unsub = onSnapshot(
//       lobbyRef,
//       (snap) => {
//         if (!snap.exists()) {
//           setLobby(null);
//           setLoading(false);
//           return;
//         }
//         const mapped = mapLobby(snap.id, snap.data());
//         setLobby(mapped);
//         setLoading(false);
//       },
//       (err) => {
//         console.error('[useMatchBoard] failed to subscribe to lobby', err);
//         setLoading(false);
//       },
//     );

//     return () => unsub();
//   }, [lobbyId]);

//   // Load decks -> legend / champion cardIDs -> actual cards
//   useEffect(() => {
//     if (!lobby) return;

//     const load = async () => {
//       try {
//         const updates: CardsByKey = {};

//         // P1 deck
//         if (lobby.p1Deck?.ownerUid && lobby.p1Deck.deckId) {
//           const ref = doc(
//             db,
//             'users',
//             lobby.p1Deck.ownerUid,
//             'decks',
//             lobby.p1Deck.deckId,
//           );
//           const snap = await getDoc(ref);
//           if (snap.exists()) {
//             const data = snap.data() as DeckDoc;
//             const legendId = data.legendCardId ?? null;
//             const champId = data.championCardId ?? null;

//             if (legendId) {
//               const card = cardById.get(legendId);
//               if (card) updates.p1Legend = card;
//             }
//             if (champId) {
//               const card = cardById.get(champId);
//               if (card) updates.p1Champion = card;
//             }
//           }
//         }

//         // P2 deck
//         if (lobby.p2Deck?.ownerUid && lobby.p2Deck.deckId) {
//           const ref = doc(
//             db,
//             'users',
//             lobby.p2Deck.ownerUid,
//             'decks',
//             lobby.p2Deck.deckId,
//           );
//           const snap = await getDoc(ref);
//           if (snap.exists()) {
//             const data = snap.data() as DeckDoc;
//             const legendId = data.legendCardId ?? null;
//             const champId = data.championCardId ?? null;

//             if (legendId) {
//               const card = cardById.get(legendId);
//               if (card) updates.p2Legend = card;
//             }
//             if (champId) {
//               const card = cardById.get(champId);
//               if (card) updates.p2Champion = card;
//             }
//           }
//         }

//         if (Object.keys(updates).length > 0) {
//           // IMPORTANT: we don't put null in state – fixes your TS error about null
//           setCardsByKey((prev) => ({
//             ...prev,
//             ...updates,
//           }));
//         }
//       } catch (err) {
//         console.error('[useMatchBoard] failed to load deck details', err);
//       }
//     };

//     void load();
//   }, [lobby, cardById]);

//   // Who am I?
//   const currentRole: Role = useMemo(() => {
//     if (!userUid || !lobby) return 'none';
//     if (lobby.p1 && lobby.p1.uid === userUid) return 'p1';
//     if (lobby.p2 && lobby.p2.uid === userUid) return 'p2';
//     if (lobby.spectators.some((s) => s.uid === userUid)) return 'spectator';
//     return 'none';
//   }, [userUid, lobby]);

//   // Perspective: players see themselves on bottom; spectators default to P1
//   const viewerIsP1 =
//     currentRole === 'p1' || currentRole === 'spectator' || currentRole === 'none';

//   const bottomPlayer: 'p1' | 'p2' = viewerIsP1 ? 'p1' : 'p2';
//   const topPlayer: 'p1' | 'p2' = bottomPlayer === 'p1' ? 'p2' : 'p1';

//   const p1Name = lobby?.p1?.username ?? 'Player 1';
//   const p2Name = lobby?.p2?.username ?? 'Player 2';

//   const bottomName = bottomPlayer === 'p1' ? p1Name : p2Name;
//   const topName = bottomPlayer === 'p1' ? p2Name : p1Name;

//   // Map card keys -> board zones using DEFAULT_BOARD_STATE
//   const zoneCards: ZoneCardsMap = useMemo(() => {
//     const map: ZoneCardsMap = {};
//     for (const key of CARD_KEYS) {
//       const placement = (DEFAULT_BOARD_STATE as BoardState)[key];
//       const card = cardsByKey[key];
//       if (!placement || !card) continue;

//       map[placement.zoneId] = {
//         cardKey: key,
//         card,
//         rotation: placement.rotation,
//       };
//     }
//     return map;
//   }, [cardsByKey]);

//   return {
//     loading,
//     lobby,
//     currentRole,
//     bottomPlayer,
//     topPlayer,
//     bottomName,
//     topName,
//     zoneCards,
//   };
// }
