import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useLobbySession } from '../contexts/LobbyContext';
import {
  ALL_CARDS,
  getDeckCardType,
  type RiftboundCard,
} from '../data/riftboundCards';
import type { BoardZoneId } from './boardConfig';

// ---------- Types shared with the page ----------

export type PlayerSeat = 'p1' | 'p2';

export type LobbyPlayer = {
  uid: string;
  username: string;
};

export type LobbySpectator = {
  uid: string;
  username: string;
};

export type LobbyRules = {
  bestOf: 1 | 3;
  sideboard: boolean;
};

export type SelectedDeckInfo = {
  ownerUid: string;
  deckId: string;
  deckName: string;
};

export type LobbyStatus = 'open' | 'selecting-decks' | 'in-game' | 'closed';

export type Lobby = {
  id: string;
  hostUid: string;
  hostUsername: string;
  status: LobbyStatus;
  mode: 'private';
  p1: LobbyPlayer | null;
  p2: LobbyPlayer | null;
  spectators: LobbySpectator[];
  p1Ready: boolean;
  p2Ready: boolean;
  rules: LobbyRules;
  p1Deck: SelectedDeckInfo | null;
  p2Deck: SelectedDeckInfo | null;
};

export type DeckCardDoc = {
  cardId: string;
  quantity: number;
};

export type DeckDoc = {
  name: string;
  ownerUid: string;
  cards: DeckCardDoc[];
  sideboard?: DeckCardDoc[];
  legendCardId?: string | null;
  championCardId?: string | null;
};

export type PlayerCardLists = {
  legend: RiftboundCard[]; // 1 card
  chosenChampion: RiftboundCard[]; // 1 card
  battlefields: RiftboundCard[]; // 3 cards
  runes: RiftboundCard[]; // 12 cards
  mainDeck: RiftboundCard[]; // remaining (e.g. 39)
  discard: RiftboundCard[]; // accumulated discard pile
};

export type ZoneCard = {
  card: RiftboundCard;
  ownerSeat: PlayerSeat;
};

/** Each zone can hold multiple cards (hands, battlefields, etc.) */
export type ZoneCardMap = Partial<Record<BoardZoneId, ZoneCard[]>>;

// ---------- Firestore wire types for shared match state ----------

type WireZoneCard = {
  cardId: string;
  ownerSeat: PlayerSeat;
};

type WireZoneCardMap = Partial<Record<BoardZoneId, WireZoneCard[]>>;

type WirePlayerCardLists = {
  legend: string[];
  chosenChampion: string[];
  battlefields: string[];
  runes: string[];
  mainDeck: string[];
  discard: string[];
};

type MatchRevealsWire = {
  p1?: string[];
  p2?: string[];
};

type MatchStateDoc = {
  p1Lists: WirePlayerCardLists | null;
  p2Lists: WirePlayerCardLists | null;
  zoneCards: WireZoneCardMap;
  scores?: { p1: number; p2: number };
  reveals?: MatchRevealsWire;
};

// ---------- Pure helpers (no React here) ----------

function mapLobby(id: string, data: DocumentData): Lobby {
  const rawRules = (data.rules ?? {}) as Partial<LobbyRules>;
  const rules: LobbyRules = {
    bestOf: rawRules.bestOf === 3 ? 3 : 1,
    sideboard: !!rawRules.sideboard,
  };

  const rawP1Deck =
    (data.p1Deck ?? null) as Partial<SelectedDeckInfo> | null;
  const rawP2Deck =
    (data.p2Deck ?? null) as Partial<SelectedDeckInfo> | null;

  const p1Deck: SelectedDeckInfo | null = rawP1Deck
    ? {
        ownerUid: rawP1Deck.ownerUid ?? '',
        deckId: rawP1Deck.deckId ?? '',
        deckName: rawP1Deck.deckName ?? 'Unknown Deck',
      }
    : null;

  const p2Deck: SelectedDeckInfo | null = rawP2Deck
    ? {
        ownerUid: rawP2Deck.ownerUid ?? '',
        deckId: rawP2Deck.deckId ?? '',
        deckName: rawP2Deck.deckName ?? 'Unknown Deck',
      }
    : null;

  return {
    id,
    hostUid: data.hostUid,
    hostUsername: data.hostUsername,
    status: (data.status ?? 'open') as LobbyStatus,
    mode: 'private',
    p1: data.p1 ?? null,
    p2: data.p2 ?? null,
    spectators: data.spectators ?? [],
    p1Ready: !!data.p1Ready,
    p2Ready: !!data.p2Ready,
    rules,
    p1Deck,
    p2Deck,
  };
}

function buildPlayerLists(
  deck: DeckDoc,
  cardById: Map<string, RiftboundCard>,
): PlayerCardLists {
  const legendPool: RiftboundCard[] = [];
  const championPool: RiftboundCard[] = [];
  const runePool: RiftboundCard[] = [];
  const battlefieldPool: RiftboundCard[] = [];
  const mainPool: RiftboundCard[] = [];

  for (const entry of deck.cards ?? []) {
    const card = cardById.get(entry.cardId);
    if (!card) continue;

    const qty = entry.quantity ?? 0;
    if (qty <= 0) continue;

    const type = getDeckCardType(
      card,
      deck.legendCardId ?? null,
      deck.championCardId ?? null,
    );

    for (let i = 0; i < qty; i += 1) {
      switch (type) {
        case 'legend':
          legendPool.push(card);
          break;
        case 'chosenChampion':
          championPool.push(card);
          break;
        case 'rune':
          runePool.push(card);
          break;
        case 'battlefield':
          battlefieldPool.push(card);
          break;
        default:
          mainPool.push(card);
      }
    }
  }

  const legend = legendPool.slice(0, 1);
  const champion = championPool.slice(0, 1);
  const runes = runePool.slice(0, 12);
  const leftoverRunes = runePool.slice(12);
  const battlefields = battlefieldPool.slice(0, 3);
  const leftoverBattlefields = battlefieldPool.slice(3);

  const mainDeck = [
    ...mainPool,
    ...leftoverRunes,
    ...leftoverBattlefields,
    ...legendPool.slice(1),
    ...championPool.slice(1),
  ];

  return {
    legend,
    chosenChampion: champion,
    battlefields,
    runes,
    mainDeck,
    discard: [],
  };
}

function stringifyCardList(list: RiftboundCard[]): string {
  if (!list.length) return '(empty)';
  return list.map((c) => c.name).join(', ');
}

function logCardRemovalAndLists(
  seatLabel: 'P1' | 'P2',
  removedFrom: keyof PlayerCardLists,
  removedCard: RiftboundCard | null,
  lists: PlayerCardLists,
) {
  const removedMsg = removedCard
    ? `[${seatLabel}] removed "${removedCard.name}" from ${removedFrom} list`
    : `[${seatLabel}] no card removed from ${removedFrom} list`;

  const summary =
    `${removedMsg}\n` +
    `[${seatLabel}] Legend list: ${stringifyCardList(lists.legend)}\n` +
    `[${seatLabel}] Champion list: ${stringifyCardList(
      lists.chosenChampion,
    )}\n` +
    `[${seatLabel}] Battlefield list: ${stringifyCardList(
      lists.battlefields,
    )}\n` +
    `[${seatLabel}] Runes list: ${stringifyCardList(lists.runes)}\n` +
    `[${seatLabel}] Main deck list: ${stringifyCardList(
      lists.mainDeck,
    )}\n` +
    `[${seatLabel}] Discard list: ${stringifyCardList(lists.discard)}`;

  // eslint-disable-next-line no-console
  console.log(summary);
}

// --- Serialization helpers for Firestore match state ---

function toWirePlayerLists(
  lists: PlayerCardLists | null,
): WirePlayerCardLists | null {
  if (!lists) return null;
  const toIds = (cards: RiftboundCard[]): string[] => cards.map((c) => c.id);
  return {
    legend: toIds(lists.legend),
    chosenChampion: toIds(lists.chosenChampion),
    battlefields: toIds(lists.battlefields),
    runes: toIds(lists.runes),
    mainDeck: toIds(lists.mainDeck),
    discard: toIds(lists.discard),
  };
}

function fromWirePlayerLists(
  wire: WirePlayerCardLists | null,
  cardById: Map<string, RiftboundCard>,
): PlayerCardLists | null {
  if (!wire) return null;

  const toCards = (ids: string[]): RiftboundCard[] =>
    ids
      .map((id) => cardById.get(id) ?? null)
      .filter((c): c is RiftboundCard => c !== null);

  return {
    legend: toCards(wire.legend),
    chosenChampion: toCards(wire.chosenChampion),
    battlefields: toCards(wire.battlefields),
    runes: toCards(wire.runes),
    mainDeck: toCards(wire.mainDeck),
    discard: toCards(wire.discard),
  };
}

function toWireZoneCards(zones: ZoneCardMap): WireZoneCardMap {
  const result: WireZoneCardMap = {};
  for (const [zoneId, cards] of Object.entries(zones) as [
    BoardZoneId,
    ZoneCard[],
  ][]) {
    result[zoneId] = cards.map((zc) => ({
      cardId: zc.card.id,
      ownerSeat: zc.ownerSeat,
    }));
  }
  return result;
}

function fromWireZoneCards(
  wire: WireZoneCardMap | undefined,
  cardById: Map<string, RiftboundCard>,
): ZoneCardMap {
  if (!wire) return {};
  const result: ZoneCardMap = {};
  for (const [zoneId, arr] of Object.entries(wire) as [
    BoardZoneId,
    WireZoneCard[],
  ][]) {
    result[zoneId] =
      arr
        .map((w) => {
          const card = cardById.get(w.cardId);
          if (!card) return null;
          return { card, ownerSeat: w.ownerSeat };
        })
        .filter((x): x is ZoneCard => x !== null) ?? [];
  }
  return result;
}

function toWireReveals(
  p1: RiftboundCard[],
  p2: RiftboundCard[],
): MatchRevealsWire {
  return {
    p1: p1.map((c) => c.id),
    p2: p2.map((c) => c.id),
  };
}

function fromWireReveals(
  wire: MatchRevealsWire | undefined,
  cardById: Map<string, RiftboundCard>,
): { p1: RiftboundCard[]; p2: RiftboundCard[] } {
  if (!wire) return { p1: [], p2: [] };

  const toCards = (ids: string[]): RiftboundCard[] =>
    ids
      .map((id) => cardById.get(id) ?? null)
      .filter((c): c is RiftboundCard => c !== null);

  return {
    p1: wire.p1 ? toCards(wire.p1) : [],
    p2: wire.p2 ? toCards(wire.p2) : [],
  };
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ---------- Hook: all non-layout match logic lives here ----------

let globalInstanceCounter = 0;

export function useMatchGameState(lobbyId?: string) {
  const { user } = useAuth();
  const { setActiveLobbyId } = useLobbySession();
  const navigate = useNavigate();

  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [loadingLobby, setLoadingLobby] = useState(true);

  const [p1DeckDoc, setP1DeckDoc] = useState<DeckDoc | null>(null);
  const [p2DeckDoc, setP2DeckDoc] = useState<DeckDoc | null>(null);
  const [loadingDecks, setLoadingDecks] = useState(false);

  const [p1Lists, setP1Lists] = useState<PlayerCardLists | null>(null);
  const [p2Lists, setP2Lists] = useState<PlayerCardLists | null>(null);

  const [zoneCards, setZoneCards] = useState<ZoneCardMap>({});

  const [hasDealtP1, setHasDealtP1] = useState(false);
  const [hasDealtP2, setHasDealtP2] = useState(false);

  const [p1Score, setP1Score] = useState(0);
  const [p2Score, setP2Score] = useState(0);

  // Cards revealed to the opponent (per player)
  const [p1Reveals, setP1Reveals] = useState<RiftboundCard[]>([]);
  const [p2Reveals, setP2Reveals] = useState<RiftboundCard[]>([]);

  // Per-hook instance ID (debug)
  const instanceIdRef = useRef<string>('');
  if (!instanceIdRef.current) {
    globalInstanceCounter += 1;
    instanceIdRef.current = `matchState-${globalInstanceCounter}`;
  }

  const cardById = useMemo(() => {
    const map = new Map<string, RiftboundCard>();
    for (const card of ALL_CARDS) {
      map.set(card.id, card);
    }
    return map;
  }, []);

  // Reference to shared match state doc
  const matchStateRef = useMemo(
    () =>
      lobbyId
        ? doc(db, 'lobbies', lobbyId, 'matchState', 'shared')
        : null,
    [lobbyId],
  );

  // Debug: log mount / unmount
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log(
      '[useMatchGameState] mounted instance',
      instanceIdRef.current,
      'for lobbyId =',
      lobbyId,
    );
    return () => {
      // eslint-disable-next-line no-console
      console.log(
        '[useMatchGameState] unmounted instance',
        instanceIdRef.current,
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe to lobby
  useEffect(() => {
    if (!lobbyId) return;

    const lobbyRef = doc(db, 'lobbies', lobbyId);
    const unsub = onSnapshot(
      lobbyRef,
      (snap) => {
        if (!snap.exists()) {
          console.warn(
            '[useMatchGameState]',
            instanceIdRef.current,
            'Lobby document no longer exists',
          );
          setLobby(null);
          setLoadingLobby(false);
          setActiveLobbyId(null);
          navigate('/play');
          return;
        }

        const mapped = mapLobby(snap.id, snap.data());
        // eslint-disable-next-line no-console
        console.log(
          '[useMatchGameState]',
          instanceIdRef.current,
          'Lobby snapshot:',
          mapped,
        );

        setLobby(mapped);
        setLoadingLobby(false);
        setActiveLobbyId(snap.id);
      },
      (err) => {
        console.error(
          '[useMatchGameState]',
          instanceIdRef.current,
          'Failed to subscribe to lobby',
          err,
        );
        setLoadingLobby(false);
      },
    );

    return () => unsub();
  }, [lobbyId, navigate, setActiveLobbyId]);

  // Basic lobby-based navigation (closed / wrong status)
  useEffect(() => {
    if (!lobby) return;

    if (lobby.status === 'closed') {
      console.log(
        '[useMatchGameState]',
        instanceIdRef.current,
        'Lobby closed, returning to /play',
      );
      setActiveLobbyId(null);
      navigate('/play');
      return;
    }

    if (lobby.status === 'open' || lobby.status === 'selecting-decks') {
      console.log(
        '[useMatchGameState]',
        instanceIdRef.current,
        'Lobby not in-game yet, redirecting back to lobby screen',
      );
      navigate(`/play/private/${lobby.id}`);
    }
  }, [lobby, navigate, setActiveLobbyId]);

  // Load decks
  useEffect(() => {
    if (!lobby) {
      setP1DeckDoc(null);
      setP2DeckDoc(null);
      return;
    }

    const load = async () => {
      setLoadingDecks(true);
      try {
        console.log(
          '[useMatchGameState]',
          instanceIdRef.current,
          'Loading decks for lobby',
          lobby.id,
        );

        if (lobby.p1Deck) {
          console.log(
            '[useMatchGameState]',
            instanceIdRef.current,
            'Fetching P1 deck',
            lobby.p1Deck,
          );
          const p1Ref = doc(
            db,
            'users',
            lobby.p1Deck.ownerUid,
            'decks',
            lobby.p1Deck.deckId,
          );
          const p1Snap = await getDoc(p1Ref);
          if (p1Snap.exists()) {
            const deck = p1Snap.data() as DeckDoc;
            console.log(
              '[useMatchGameState]',
              instanceIdRef.current,
              'Loaded P1 deck doc',
              deck,
            );
            setP1DeckDoc(deck);
          } else {
            console.warn(
              '[useMatchGameState]',
              instanceIdRef.current,
              'P1 deck not found in Firestore',
            );
            setP1DeckDoc(null);
          }
        } else {
          console.log(
            '[useMatchGameState]',
            instanceIdRef.current,
            'No P1 deck chosen on lobby',
          );
          setP1DeckDoc(null);
        }

        if (lobby.p2Deck) {
          console.log(
            '[useMatchGameState]',
            instanceIdRef.current,
            'Fetching P2 deck',
            lobby.p2Deck,
          );
          const p2Ref = doc(
            db,
            'users',
            lobby.p2Deck.ownerUid,
            'decks',
            lobby.p2Deck.deckId,
          );
          const p2Snap = await getDoc(p2Ref);
          if (p2Snap.exists()) {
            const deck = p2Snap.data() as DeckDoc;
            console.log(
              '[useMatchGameState]',
              instanceIdRef.current,
              'Loaded P2 deck doc',
              deck,
            );
            setP2DeckDoc(deck);
          } else {
            console.warn(
              '[useMatchGameState]',
              instanceIdRef.current,
              'P2 deck not found in Firestore',
            );
            setP2DeckDoc(null);
          }
        } else {
          console.log(
            '[useMatchGameState]',
            instanceIdRef.current,
            'No P2 deck chosen on lobby',
          );
          setP2DeckDoc(null);
        }
      } catch (err) {
        console.error(
          '[useMatchGameState]',
          instanceIdRef.current,
          'failed to load decks',
          err,
        );
        setP1DeckDoc(null);
        setP2DeckDoc(null);
      } finally {
        setLoadingDecks(false);
      }
    };

    void load();
  }, [lobby, cardById]);

  // Build P1 lists (local initial state)
  useEffect(() => {
    if (p1DeckDoc) {
      const lists = buildPlayerLists(p1DeckDoc, cardById);
      setP1Lists(lists);
      setHasDealtP1(false);

      console.log(
        '[useMatchGameState]',
        instanceIdRef.current,
        'Built P1 lists from deck',
      );
      console.log('[P1] Legend list:', stringifyCardList(lists.legend));
      console.log(
        '[P1] Champion list:',
        stringifyCardList(lists.chosenChampion),
      );
      console.log(
        '[P1] Battlefield list:',
        stringifyCardList(lists.battlefields),
      );
      console.log('[P1] Runes list:', stringifyCardList(lists.runes));
      console.log('[P1] Main deck list:', stringifyCardList(lists.mainDeck));
    } else {
      setP1Lists(null);
      setHasDealtP1(false);
    }
  }, [p1DeckDoc, cardById]);

  // Build P2 lists (local initial state)
  useEffect(() => {
    if (p2DeckDoc) {
      const lists = buildPlayerLists(p2DeckDoc, cardById);
      setP2Lists(lists);
      setHasDealtP2(false);

      console.log(
        '[useMatchGameState]',
        instanceIdRef.current,
        'Built P2 lists from deck',
      );
      console.log('[P2] Legend list:', stringifyCardList(lists.legend));
      console.log(
        '[P2] Champion list:',
        stringifyCardList(lists.chosenChampion),
      );
      console.log(
        '[P2] Battlefield list:',
        stringifyCardList(lists.battlefields),
      );
      console.log('[P2] Runes list:', stringifyCardList(lists.runes));
      console.log('[P2] Main deck list:', stringifyCardList(lists.mainDeck));
    } else {
      setP2Lists(null);
      setHasDealtP2(false);
    }
  }, [p2DeckDoc, cardById]);

  // Helper: auto-rotate card when moved between zones, except hand / rune channel / legends
  const autoRotateCardOnMove = useCallback(
    async (card: RiftboundCard, toZoneId: BoardZoneId, indexInZone: number) => {
      if (!lobbyId) return;

      const zoneStr = toZoneId as string;
      if (
        zoneStr === 'p1Hand' ||
        zoneStr === 'p2Hand' ||
        zoneStr === 'p1RuneChannel' ||
        zoneStr === 'p2RuneChannel' ||
        zoneStr === 'p1LegendZone' ||
        zoneStr === 'p2LegendZone'
      ) {
        return;
      }

      try {
        const rotationRef = doc(
          db,
          'lobbies',
          lobbyId,
          'rotations',
          `${toZoneId}-${card.id}-${indexInZone}`,
        );
        await setDoc(
          rotationRef,
          { rotation: 90 },
          { merge: true },
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          '[useMatchGameState]',
          instanceIdRef.current,
          'failed to auto-rotate card on move',
          err,
        );
      }
    },
    [lobbyId],
  );

  // Sync helper: push current state to Firestore
  const syncMatchStateToFirestore = useCallback(
    async (
      newP1Lists: PlayerCardLists | null,
      newP2Lists: PlayerCardLists | null,
      newZoneCards: ZoneCardMap,
      newP1Score: number,
      newP2Score: number,
      newP1Reveals: RiftboundCard[],
      newP2Reveals: RiftboundCard[],
    ) => {
      if (!matchStateRef) return;
      try {
        const payload: MatchStateDoc = {
          p1Lists: toWirePlayerLists(newP1Lists),
          p2Lists: toWirePlayerLists(newP2Lists),
          zoneCards: toWireZoneCards(newZoneCards),
          scores: {
            p1: newP1Score,
            p2: newP2Score,
          },
          reveals: toWireReveals(newP1Reveals, newP2Reveals),
        };

        await setDoc(matchStateRef, payload, { merge: false });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          '[useMatchGameState]',
          instanceIdRef.current,
          'failed to sync match state',
          err,
        );
      }
    },
    [matchStateRef],
  );

  // Subscribe to shared match state
  useEffect(() => {
    if (!matchStateRef) return;

    const unsub = onSnapshot(matchStateRef, (snap) => {
      if (!snap.exists()) {
        return;
      }

      const data = snap.data() as MatchStateDoc;

      const nextP1 = fromWirePlayerLists(data.p1Lists, cardById);
      const nextP2 = fromWirePlayerLists(data.p2Lists, cardById);
      const nextZones = fromWireZoneCards(data.zoneCards, cardById);
      const nextReveals = fromWireReveals(data.reveals, cardById);

      setP1Lists(nextP1);
      setP2Lists(nextP2);
      setZoneCards(nextZones);
      setP1Reveals(nextReveals.p1);
      setP2Reveals(nextReveals.p2);

      if (data.scores) {
        setP1Score(typeof data.scores.p1 === 'number' ? data.scores.p1 : 0);
        setP2Score(typeof data.scores.p2 === 'number' ? data.scores.p2 : 0);
      }
    });

    return unsub;
  }, [matchStateRef, cardById]);

  // Deal P1 legend + champion and sync to Firestore
  useEffect(() => {
    if (hasDealtP1) return;
    if (!p1Lists) return;
    if (!lobby?.p1Deck) return;

    const p1LegendCard = p1Lists.legend[0] ?? null;
    const p1ChampionCard = p1Lists.chosenChampion[0] ?? null;

    if (!p1LegendCard && !p1ChampionCard) {
      console.warn(
        '[useMatchGameState]',
        instanceIdRef.current,
        'P1 has no legend or champion in lists, skipping spawn',
      );
      setHasDealtP1(true);
      return;
    }

    const newP1Lists: PlayerCardLists = {
      ...p1Lists,
      legend: p1LegendCard ? p1Lists.legend.slice(1) : p1Lists.legend,
      chosenChampion: p1ChampionCard
        ? p1Lists.chosenChampion.slice(1)
        : p1Lists.chosenChampion,
    };

    setP1Lists(newP1Lists);

    setZoneCards((prev) => {
      const next: ZoneCardMap = { ...prev };

      if (p1LegendCard) {
        next.p1LegendZone = [
          {
            card: p1LegendCard,
            ownerSeat: 'p1',
          },
        ];
      }

      if (p1ChampionCard) {
        next.p1ChampionZone = [
          {
            card: p1ChampionCard,
            ownerSeat: 'p1',
          },
        ];
      }

      void syncMatchStateToFirestore(
        newP1Lists,
        p2Lists,
        next,
        p1Score,
        p2Score,
        p1Reveals,
        p2Reveals,
      );

      return next;
    });

    logCardRemovalAndLists('P1', 'legend', p1LegendCard, newP1Lists);
    logCardRemovalAndLists(
      'P1',
      'chosenChampion',
      p1ChampionCard,
      newP1Lists,
    );

    console.log(
      '[useMatchGameState]',
      instanceIdRef.current,
      'Dealt initial P1 legend/champion',
    );
    setHasDealtP1(true);
  }, [
    hasDealtP1,
    p1Lists,
    lobby,
    p2Lists,
    syncMatchStateToFirestore,
    p1Score,
    p2Score,
    p1Reveals,
    p2Reveals,
  ]);

  // Deal P2 legend + champion and sync to Firestore
  useEffect(() => {
    if (hasDealtP2) return;
    if (!p2Lists) return;
    if (!lobby?.p2Deck) return;

    const p2LegendCard = p2Lists.legend[0] ?? null;
    const p2ChampionCard = p2Lists.chosenChampion[0] ?? null;

    if (!p2LegendCard && !p2ChampionCard) {
      console.warn(
        '[useMatchGameState]',
        instanceIdRef.current,
        'P2 has no legend or champion in lists, skipping spawn',
      );
      setHasDealtP2(true);
      return;
    }

    const newP2Lists: PlayerCardLists = {
      ...p2Lists,
      legend: p2LegendCard ? p2Lists.legend.slice(1) : p2Lists.legend,
      chosenChampion: p2ChampionCard
        ? p2Lists.chosenChampion.slice(1)
        : p2Lists.chosenChampion,
    };

    setP2Lists(newP2Lists);

    setZoneCards((prev) => {
      const next: ZoneCardMap = { ...prev };

      if (p2LegendCard) {
        next.p2LegendZone = [
          {
            card: p2LegendCard,
            ownerSeat: 'p2',
          },
        ];
      }

      if (p2ChampionCard) {
        next.p2ChampionZone = [
          {
            card: p2ChampionCard,
            ownerSeat: 'p2',
          },
        ];
      }

      void syncMatchStateToFirestore(
        p1Lists,
        newP2Lists,
        next,
        p1Score,
        p2Score,
        p1Reveals,
        p2Reveals,
      );

      return next;
    });

    logCardRemovalAndLists('P2', 'legend', p2LegendCard, newP2Lists);
    logCardRemovalAndLists(
      'P2',
      'chosenChampion',
      p2ChampionCard,
      newP2Lists,
    );

    console.log(
      '[useMatchGameState]',
      instanceIdRef.current,
      'Dealt initial P2 legend/champion',
    );
    setHasDealtP2(true);
  }, [
    hasDealtP2,
    p2Lists,
    lobby,
    p1Lists,
    syncMatchStateToFirestore,
    p1Score,
    p2Score,
    p1Reveals,
    p2Reveals,
  ]);

  // Which seat is "me"?
  const mySeat: PlayerSeat | null = useMemo(() => {
    if (!user || !lobby) return null;
    if (lobby.p1 && lobby.p1.uid === user.uid) return 'p1';
    if (lobby.p2 && lobby.p2.uid === user.uid) return 'p2';
    return null;
  }, [user, lobby]);

  const bothDecksChosen = !!(lobby?.p1Deck && lobby.p2Deck);
  const listsReady = !!p1Lists && !!p2Lists && !loadingDecks;

  const p1RuneCount = p1Lists?.runes.length ?? 0;
  const p2RuneCount = p2Lists?.runes.length ?? 0;
  const p1DeckCount = p1Lists?.mainDeck.length ?? 0;
  const p2DeckCount = p2Lists?.mainDeck.length ?? 0;

  // Generic move between zones (drag/drop)
  const moveCardBetweenZones = useCallback(
    (fromZoneId: BoardZoneId, fromIndex: number, toZoneId: BoardZoneId) => {
      if (fromZoneId === toZoneId) return;

      setZoneCards((prevZones) => {
        const source = prevZones[fromZoneId];
        if (!source || fromIndex < 0 || fromIndex >= source.length) {
          return prevZones;
        }

        const cardToMove = source[fromIndex];

        const newSource = [
          ...source.slice(0, fromIndex),
          ...source.slice(fromIndex + 1),
        ];

        const target = prevZones[toZoneId] ?? [];
        const newTarget = [...target, cardToMove];

        const updatedZones: ZoneCardMap = { ...prevZones };

        // IMPORTANT: never delete – set empty array instead
        updatedZones[fromZoneId] = newSource;
        updatedZones[toZoneId] = newTarget;

        const fromIsDiscard =
          (fromZoneId as string).endsWith('Discard') ||
          (fromZoneId as string).includes('Discard');

        let newP1 = p1Lists;
        let newP2 = p2Lists;

        if (fromIsDiscard) {
          const seat: PlayerSeat =
            (fromZoneId as string).startsWith('p1') ||
            (fromZoneId as string).includes('P1')
              ? 'p1'
              : 'p2';

          if (seat === 'p1' && p1Lists) {
            const idx = p1Lists.discard.findIndex(
              (c) => c.id === cardToMove.card.id,
            );
            const newDiscard =
              idx === -1
                ? p1Lists.discard
                : [
                    ...p1Lists.discard.slice(0, idx),
                    ...p1Lists.discard.slice(idx + 1),
                  ];
            newP1 = { ...p1Lists, discard: newDiscard };
          } else if (seat === 'p2' && p2Lists) {
            const idx = p2Lists.discard.findIndex(
              (c) => c.id === cardToMove.card.id,
            );
            const newDiscard =
              idx === -1
                ? p2Lists.discard
                : [
                    ...p2Lists.discard.slice(0, idx),
                    ...p2Lists.discard.slice(idx + 1),
                  ];
            newP2 = { ...p2Lists, discard: newDiscard };
          }
        }

        if (newP1 !== p1Lists) setP1Lists(newP1);
        if (newP2 !== p2Lists) setP2Lists(newP2);

        const newIndex = (updatedZones[toZoneId]?.length ?? 1) - 1;
        void autoRotateCardOnMove(cardToMove.card, toZoneId, newIndex);

        void syncMatchStateToFirestore(
          newP1,
          newP2,
          updatedZones,
          p1Score,
          p2Score,
          p1Reveals,
          p2Reveals,
        );

        return updatedZones;
      });
    },
    [
      p1Lists,
      p2Lists,
      autoRotateCardOnMove,
      syncMatchStateToFirestore,
      p1Score,
      p2Score,
      p1Reveals,
      p2Reveals,
    ],
  );

  // Send a card to discard pile (from any zone)
  const sendCardToDiscard = useCallback(
    (
      fromZoneId: BoardZoneId,
      fromIndex: number,
      toDiscardZoneId: BoardZoneId,
    ) => {
      setZoneCards((prevZones) => {
        const source = prevZones[fromZoneId];
        if (!source || fromIndex < 0 || fromIndex >= source.length) {
          return prevZones;
        }

        const cardToMove = source[fromIndex];

        const newSource = [
          ...source.slice(0, fromIndex),
          ...source.slice(fromIndex + 1),
        ];

        const target = prevZones[toDiscardZoneId] ?? [];
        const newTarget = [...target, cardToMove];

        const updatedZones: ZoneCardMap = { ...prevZones };
        updatedZones[fromZoneId] = newSource;
        updatedZones[toDiscardZoneId] = newTarget;

        const seat: PlayerSeat =
          (toDiscardZoneId as string).startsWith('p1') ||
          (toDiscardZoneId as string).includes('P1')
            ? 'p1'
            : 'p2';

        let newP1 = p1Lists;
        let newP2 = p2Lists;

        if (seat === 'p1' && p1Lists) {
          newP1 = {
            ...p1Lists,
            discard: [...p1Lists.discard, cardToMove.card],
          };
        } else if (seat === 'p2' && p2Lists) {
          newP2 = {
            ...p2Lists,
            discard: [...p2Lists.discard, cardToMove.card],
          };
        }

        if (newP1 !== p1Lists) setP1Lists(newP1);
        if (newP2 !== p2Lists) setP2Lists(newP2);

        const newIndex = (updatedZones[toDiscardZoneId]?.length ?? 1) - 1;
        void autoRotateCardOnMove(cardToMove.card, toDiscardZoneId, newIndex);

        void syncMatchStateToFirestore(
          newP1,
          newP2,
          updatedZones,
          p1Score,
          p2Score,
          p1Reveals,
          p2Reveals,
        );

        console.log(
          '[useMatchGameState]',
          instanceIdRef.current,
          'sendCardToDiscard:',
          cardToMove.card.name,
          '->',
          toDiscardZoneId,
        );

        return updatedZones;
      });
    },
    [
      p1Lists,
      p2Lists,
      autoRotateCardOnMove,
      syncMatchStateToFirestore,
      p1Score,
      p2Score,
      p1Reveals,
      p2Reveals,
    ],
  );

  // Send a card to the bottom of the main deck OR rune pile (from any zone)
  const sendCardToBottomOfDeck = useCallback(
    (fromZoneId: BoardZoneId, fromIndex: number, deckZoneId: BoardZoneId) => {
      setZoneCards((prevZones) => {
        const source = prevZones[fromZoneId];
        if (!source || fromIndex < 0 || fromIndex >= source.length) {
          return prevZones;
        }

        const cardToMove = source[fromIndex];

        const newSource = [
          ...source.slice(0, fromIndex),
          ...source.slice(fromIndex + 1),
        ];

        const updatedZones: ZoneCardMap = { ...prevZones };
        updatedZones[fromZoneId] = newSource;

        const seat: PlayerSeat =
          (deckZoneId as string).startsWith('p1') ||
          (deckZoneId as string).includes('P1')
            ? 'p1'
            : 'p2';

        const isRuneDeck =
          (deckZoneId as string) === 'p1RuneDeck' ||
          (deckZoneId as string) === 'p2RuneDeck';

        let newP1 = p1Lists;
        let newP2 = p2Lists;

        if (seat === 'p1' && p1Lists) {
          if (isRuneDeck) {
            newP1 = {
              ...p1Lists,
              runes: [...p1Lists.runes, cardToMove.card],
            };
          } else {
            newP1 = {
              ...p1Lists,
              mainDeck: [...p1Lists.mainDeck, cardToMove.card],
            };
          }
        } else if (seat === 'p2' && p2Lists) {
          if (isRuneDeck) {
            newP2 = {
              ...p2Lists,
              runes: [...p2Lists.runes, cardToMove.card],
            };
          } else {
            newP2 = {
              ...p2Lists,
              mainDeck: [...p2Lists.mainDeck, cardToMove.card],
            };
          }
        }

        if (newP1 !== p1Lists) setP1Lists(newP1);
        if (newP2 !== p2Lists) setP2Lists(newP2);

        // no auto-rotate, card goes into pile
        void syncMatchStateToFirestore(
          newP1,
          newP2,
          updatedZones,
          p1Score,
          p2Score,
          p1Reveals,
          p2Reveals,
        );

        console.log(
          '[useMatchGameState]',
          instanceIdRef.current,
          'sendCardToBottomOfDeck:',
          cardToMove.card.name,
          '->',
          deckZoneId,
          'isRuneDeck:',
          isRuneDeck,
        );

        return updatedZones;
      });
    },
    [
      p1Lists,
      p2Lists,
      syncMatchStateToFirestore,
      p1Score,
      p2Score,
      p1Reveals,
      p2Reveals,
    ],
  );

  // Move a specific card from discard pile to bottom of deck
  const moveCardFromDiscardToBottomOfDeck = useCallback(
    (discardZoneId: BoardZoneId, index: number) => {
      setZoneCards((prevZones) => {
        const source = prevZones[discardZoneId];
        if (!source || index < 0 || index >= source.length) {
          return prevZones;
        }

        const cardToMove = source[index];

        const newSource = [
          ...source.slice(0, index),
          ...source.slice(index + 1),
        ];

        const updatedZones: ZoneCardMap = { ...prevZones };
        updatedZones[discardZoneId] = newSource;

        const seat: PlayerSeat =
          (discardZoneId as string).startsWith('p1') ||
          (discardZoneId as string).includes('P1')
            ? 'p1'
            : 'p2';

        let newP1 = p1Lists;
        let newP2 = p2Lists;

        if (seat === 'p1' && p1Lists) {
          const discardIndex = p1Lists.discard.findIndex(
            (c) => c.id === cardToMove.card.id,
          );
          const newDiscard =
            discardIndex === -1
              ? p1Lists.discard
              : [
                  ...p1Lists.discard.slice(0, discardIndex),
                  ...p1Lists.discard.slice(discardIndex + 1),
                ];

          newP1 = {
            ...p1Lists,
            discard: newDiscard,
            mainDeck: [...p1Lists.mainDeck, cardToMove.card],
          };
        } else if (seat === 'p2' && p2Lists) {
          const discardIndex = p2Lists.discard.findIndex(
            (c) => c.id === cardToMove.card.id,
          );
          const newDiscard =
            discardIndex === -1
              ? p2Lists.discard
              : [
                  ...p2Lists.discard.slice(0, discardIndex),
                  ...p2Lists.discard.slice(discardIndex + 1),
                ];

          newP2 = {
            ...p2Lists,
            discard: newDiscard,
            mainDeck: [...p2Lists.mainDeck, cardToMove.card],
          };
        }

        if (newP1 !== p1Lists) setP1Lists(newP1);
        if (newP2 !== p2Lists) setP2Lists(newP2);

        void syncMatchStateToFirestore(
          newP1,
          newP2,
          updatedZones,
          p1Score,
          p2Score,
          p1Reveals,
          p2Reveals,
        );

        console.log(
          '[useMatchGameState]',
          instanceIdRef.current,
          'moveCardFromDiscardToBottomOfDeck:',
          cardToMove.card.name,
          'from',
          discardZoneId,
        );

        return updatedZones;
      });
    },
    [
      p1Lists,
      p2Lists,
      syncMatchStateToFirestore,
      p1Score,
      p2Score,
      p1Reveals,
      p2Reveals,
    ],
  );

  // Move a specific card from discard pile into hand
  const moveCardFromDiscardToHand = useCallback(
    (discardZoneId: BoardZoneId, index: number) => {
      setZoneCards((prevZones) => {
        const source = prevZones[discardZoneId];
        if (!source || index < 0 || index >= source.length) {
          return prevZones;
        }

        const cardToMove = source[index];

        const newSource = [
          ...source.slice(0, index),
          ...source.slice(index + 1),
        ];

        const updatedZones: ZoneCardMap = { ...prevZones };
        updatedZones[discardZoneId] = newSource;

        const seat: PlayerSeat =
          (discardZoneId as string).startsWith('p1') ||
          (discardZoneId as string).includes('P1')
            ? 'p1'
            : 'p2';

        const handZoneId: BoardZoneId =
          seat === 'p1' ? 'p1Hand' : 'p2Hand';

        const existingHand = updatedZones[handZoneId] ?? [];
        updatedZones[handZoneId] = [
          ...existingHand,
          { card: cardToMove.card, ownerSeat: seat },
        ];

        let newP1 = p1Lists;
        let newP2 = p2Lists;

        if (seat === 'p1' && p1Lists) {
          const discardIndex = p1Lists.discard.findIndex(
            (c) => c.id === cardToMove.card.id,
          );
          const newDiscard =
            discardIndex === -1
              ? p1Lists.discard
              : [
                  ...p1Lists.discard.slice(0, discardIndex),
                  ...p1Lists.discard.slice(discardIndex + 1),
                ];
          newP1 = { ...p1Lists, discard: newDiscard };
        } else if (seat === 'p2' && p2Lists) {
          const discardIndex = p2Lists.discard.findIndex(
            (c) => c.id === cardToMove.card.id,
          );
          const newDiscard =
            discardIndex === -1
              ? p2Lists.discard
              : [
                  ...p2Lists.discard.slice(0, discardIndex),
                  ...p2Lists.discard.slice(discardIndex + 1),
                ];
          newP2 = { ...p2Lists, discard: newDiscard };
        }

        if (newP1 !== p1Lists) setP1Lists(newP1);
        if (newP2 !== p2Lists) setP2Lists(newP2);

        // no auto-rotate for hand
        void syncMatchStateToFirestore(
          newP1,
          newP2,
          updatedZones,
          p1Score,
          p2Score,
          p1Reveals,
          p2Reveals,
        );

        console.log(
          '[useMatchGameState]',
          instanceIdRef.current,
          'moveCardFromDiscardToHand:',
          cardToMove.card.name,
          'from',
          discardZoneId,
        );

        return updatedZones;
      });
    },
    [
      p1Lists,
      p2Lists,
      syncMatchStateToFirestore,
      p1Score,
      p2Score,
      p1Reveals,
      p2Reveals,
    ],
  );

  // Click main deck → draw top card from main deck into hand (face-up).
  const drawFromDeck = useCallback(
    (seat: PlayerSeat) => {
      console.log(
        '[useMatchGameState]',
        instanceIdRef.current,
        'drawFromDeck invoked for seat',
        seat,
      );

      if (seat === 'p1') {
        if (!p1Lists || p1Lists.mainDeck.length === 0) return;
        const [top, ...rest] = p1Lists.mainDeck;

        console.log(
          '[useMatchGameState]',
          instanceIdRef.current,
          'P1 drawFromDeck ->',
          top.name,
          'remaining in deck:',
          rest.length,
        );

        const newP1Lists: PlayerCardLists = {
          ...p1Lists,
          mainDeck: rest,
        };
        setP1Lists(newP1Lists);

        setZoneCards((prevZones) => {
          const handZoneId: BoardZoneId = 'p1Hand';
          const existing = prevZones[handZoneId] ?? [];
          const newCard: ZoneCard = { card: top, ownerSeat: 'p1' };

          const updatedZones: ZoneCardMap = {
            ...prevZones,
            [handZoneId]: [...existing, newCard],
          };

          console.log(
            '[useMatchGameState]',
            instanceIdRef.current,
            'P1 hand size after draw:',
            updatedZones[handZoneId]?.length ?? 0,
          );

          void syncMatchStateToFirestore(
            newP1Lists,
            p2Lists,
            updatedZones,
            p1Score,
            p2Score,
            p1Reveals,
            p2Reveals,
          );

          return updatedZones;
        });
      } else {
        if (!p2Lists || p2Lists.mainDeck.length === 0) return;
        const [top, ...rest] = p2Lists.mainDeck;

        console.log(
          '[useMatchGameState]',
          instanceIdRef.current,
          'P2 drawFromDeck ->',
          top.name,
          'remaining in deck:',
          rest.length,
        );

        const newP2Lists: PlayerCardLists = {
          ...p2Lists,
          mainDeck: rest,
        };
        setP2Lists(newP2Lists);

        setZoneCards((prevZones) => {
          const handZoneId: BoardZoneId = 'p2Hand';
          const existing = prevZones[handZoneId] ?? [];
          const newCard: ZoneCard = { card: top, ownerSeat: 'p2' };

          const updatedZones: ZoneCardMap = {
            ...prevZones,
            [handZoneId]: [...existing, newCard],
          };

          console.log(
            '[useMatchGameState]',
            instanceIdRef.current,
            'P2 hand size after draw:',
            updatedZones[handZoneId]?.length ?? 0,
          );

          void syncMatchStateToFirestore(
            p1Lists,
            newP2Lists,
            updatedZones,
            p1Score,
            p2Score,
            p1Reveals,
            p2Reveals,
          );

          return updatedZones;
        });
      }
    },
    [
      p1Lists,
      p2Lists,
      syncMatchStateToFirestore,
      p1Score,
      p2Score,
      p1Reveals,
      p2Reveals,
    ],
  );

  // Click rune pile → draw top rune into rune channel (no auto-rotate).
  const drawRuneFromPile = useCallback(
    (seat: PlayerSeat) => {
      console.log(
        '[useMatchGameState]',
        instanceIdRef.current,
        'drawRuneFromPile invoked for seat',
        seat,
      );

      if (seat === 'p1') {
        if (!p1Lists || p1Lists.runes.length === 0) return;
        const [top, ...rest] = p1Lists.runes;

        const newP1Lists: PlayerCardLists = {
          ...p1Lists,
          runes: rest,
        };
        setP1Lists(newP1Lists);

        setZoneCards((prevZones) => {
          const runeChannelZoneId: BoardZoneId = 'p1RuneChannel';
          const existing = prevZones[runeChannelZoneId] ?? [];
          const newCard: ZoneCard = { card: top, ownerSeat: 'p1' };

          const updatedZones: ZoneCardMap = {
            ...prevZones,
            [runeChannelZoneId]: [...existing, newCard],
          };

          void syncMatchStateToFirestore(
            newP1Lists,
            p2Lists,
            updatedZones,
            p1Score,
            p2Score,
            p1Reveals,
            p2Reveals,
          );

          return updatedZones;
        });
      } else {
        if (!p2Lists || p2Lists.runes.length === 0) return;
        const [top, ...rest] = p2Lists.runes;

        const newP2Lists: PlayerCardLists = {
          ...p2Lists,
          runes: rest,
        };
        setP2Lists(newP2Lists);

        setZoneCards((prevZones) => {
          const runeChannelZoneId: BoardZoneId = 'p2RuneChannel';
          const existing = prevZones[runeChannelZoneId] ?? [];
          const newCard: ZoneCard = { card: top, ownerSeat: 'p2' };

          const updatedZones: ZoneCardMap = {
            ...prevZones,
            [runeChannelZoneId]: [...existing, newCard],
          };

          void syncMatchStateToFirestore(
            p1Lists,
            newP2Lists,
            updatedZones,
            p1Score,
            p2Score,
            p1Reveals,
            p2Reveals,
          );

          return updatedZones;
        });
      }
    },
    [
      p1Lists,
      p2Lists,
      syncMatchStateToFirestore,
      p1Score,
      p2Score,
      p1Reveals,
      p2Reveals,
    ],
  );

  // Shuffle main deck
  const shuffleMainDeck = useCallback(
    (seat: PlayerSeat) => {
      if (seat === 'p1') {
        if (!p1Lists || p1Lists.mainDeck.length <= 1) return;
        const shuffled = shuffleArray(p1Lists.mainDeck);
        const newP1Lists: PlayerCardLists = {
          ...p1Lists,
          mainDeck: shuffled,
        };
        setP1Lists(newP1Lists);

        void syncMatchStateToFirestore(
          newP1Lists,
          p2Lists,
          zoneCards,
          p1Score,
          p2Score,
          p1Reveals,
          p2Reveals,
        );
      } else {
        if (!p2Lists || p2Lists.mainDeck.length <= 1) return;
        const shuffled = shuffleArray(p2Lists.mainDeck);
        const newP2Lists: PlayerCardLists = {
          ...p2Lists,
          mainDeck: shuffled,
        };
        setP2Lists(newP2Lists);

        void syncMatchStateToFirestore(
          p1Lists,
          newP2Lists,
          zoneCards,
          p1Score,
          p2Score,
          p1Reveals,
          p2Reveals,
        );
      }
    },
    [
      p1Lists,
      p2Lists,
      zoneCards,
      syncMatchStateToFirestore,
      p1Score,
      p2Score,
      p1Reveals,
      p2Reveals,
    ],
  );

  // Shuffle rune deck
  const shuffleRuneDeck = useCallback(
    (seat: PlayerSeat) => {
      if (seat === 'p1') {
        if (!p1Lists || p1Lists.runes.length <= 1) return;
        const shuffled = shuffleArray(p1Lists.runes);
        const newP1Lists: PlayerCardLists = {
          ...p1Lists,
          runes: shuffled,
        };
        setP1Lists(newP1Lists);

        void syncMatchStateToFirestore(
          newP1Lists,
          p2Lists,
          zoneCards,
          p1Score,
          p2Score,
          p1Reveals,
          p2Reveals,
        );
      } else {
        if (!p2Lists || p2Lists.runes.length <= 1) return;
        const shuffled = shuffleArray(p2Lists.runes);
        const newP2Lists: PlayerCardLists = {
          ...p2Lists,
          runes: shuffled,
        };
        setP2Lists(newP2Lists);

        void syncMatchStateToFirestore(
          p1Lists,
          newP2Lists,
          zoneCards,
          p1Score,
          p2Score,
          p1Reveals,
          p2Reveals,
        );
      }
    },
    [
      p1Lists,
      p2Lists,
      zoneCards,
      syncMatchStateToFirestore,
      p1Score,
      p2Score,
      p1Reveals,
      p2Reveals,
    ],
  );

  // Sync reveals for a seat: reveal top N cards of their main deck to the opponent
  const syncRevealsForSeat = useCallback(
    (seat: PlayerSeat, count: number) => {
      const lists = seat === 'p1' ? p1Lists : p2Lists;
      if (!lists || lists.mainDeck.length === 0) return;

      const clamped = Math.min(
        Math.max(count, 0),
        lists.mainDeck.length,
      );
      const revealCards = lists.mainDeck.slice(0, clamped);

      if (seat === 'p1') {
        const newP1Reveals = revealCards;
        setP1Reveals(newP1Reveals);
        void syncMatchStateToFirestore(
          p1Lists,
          p2Lists,
          zoneCards,
          p1Score,
          p2Score,
          newP1Reveals,
          p2Reveals,
        );
      } else {
        const newP2Reveals = revealCards;
        setP2Reveals(newP2Reveals);
        void syncMatchStateToFirestore(
          p1Lists,
          p2Lists,
          zoneCards,
          p1Score,
          p2Score,
          p1Reveals,
          newP2Reveals,
        );
      }
    },
    [
      p1Lists,
      p2Lists,
      zoneCards,
      p1Score,
      p2Score,
      p1Reveals,
      p2Reveals,
      syncMatchStateToFirestore,
    ],
  );

  // Clear reveals for a seat (e.g. when closing manage deck window)
  const clearRevealsForSeat = useCallback(
    (seat: PlayerSeat) => {
      if (seat === 'p1') {
        const newP1Reveals: RiftboundCard[] = [];
        setP1Reveals(newP1Reveals);
        void syncMatchStateToFirestore(
          p1Lists,
          p2Lists,
          zoneCards,
          p1Score,
          p2Score,
          newP1Reveals,
          p2Reveals,
        );
      } else {
        const newP2Reveals: RiftboundCard[] = [];
        setP2Reveals(newP2Reveals);
        void syncMatchStateToFirestore(
          p1Lists,
          p2Lists,
          zoneCards,
          p1Score,
          p2Score,
          p1Reveals,
          newP2Reveals,
        );
      }
    },
    [
      p1Lists,
      p2Lists,
      zoneCards,
      p1Score,
      p2Score,
      p1Reveals,
      p2Reveals,
      syncMatchStateToFirestore,
    ],
  );

  // Score controls
  const incrementScore = useCallback(
    (seat: PlayerSeat) => {
      const newP1 = seat === 'p1' ? p1Score + 1 : p1Score;
      const newP2 = seat === 'p2' ? p2Score + 1 : p2Score;

      setP1Score(newP1);
      setP2Score(newP2);

      void syncMatchStateToFirestore(
        p1Lists,
        p2Lists,
        zoneCards,
        newP1,
        newP2,
        p1Reveals,
        p2Reveals,
      );
    },
    [
      p1Score,
      p2Score,
      p1Lists,
      p2Lists,
      zoneCards,
      syncMatchStateToFirestore,
      p1Reveals,
      p2Reveals,
    ],
  );

  const decrementScore = useCallback(
    (seat: PlayerSeat) => {
      const newP1 = seat === 'p1' ? Math.max(0, p1Score - 1) : p1Score;
      const newP2 = seat === 'p2' ? Math.max(0, p2Score - 1) : p2Score;

      setP1Score(newP1);
      setP2Score(newP2);

      void syncMatchStateToFirestore(
        p1Lists,
        p2Lists,
        zoneCards,
        newP1,
        newP2,
        p1Reveals,
        p2Reveals,
      );
    },
    [
      p1Score,
      p2Score,
      p1Lists,
      p2Lists,
      zoneCards,
      syncMatchStateToFirestore,
      p1Reveals,
      p2Reveals,
    ],
  );

  const p1MainDeckCards = p1Lists?.mainDeck ?? [];
  const p2MainDeckCards = p2Lists?.mainDeck ?? [];
  const p1RuneDeckCards = p1Lists?.runes ?? [];
  const p2RuneDeckCards = p2Lists?.runes ?? [];

  return {
    user,
    lobby,
    loadingLobby,
    mySeat,
    zoneCards,
    bothDecksChosen,
    listsReady,
    p1RuneCount,
    p2RuneCount,
    p1DeckCount,
    p2DeckCount,
    moveCardBetweenZones,
    sendCardToDiscard,
    sendCardToBottomOfDeck,
    moveCardFromDiscardToBottomOfDeck,
    moveCardFromDiscardToHand,
    drawFromDeck,
    drawRuneFromPile,
    p1Score,
    p2Score,
    incrementScore,
    decrementScore,
    // Deck & rune lists for UI
    p1MainDeckCards,
    p2MainDeckCards,
    p1RuneDeckCards,
    p2RuneDeckCards,
    // Shuffle
    shuffleMainDeck,
    shuffleRuneDeck,
    // Reveals (used to show opponent's reveal popup)
    p1Reveals,
    p2Reveals,
    syncRevealsForSeat,
    clearRevealsForSeat,
  };
}
