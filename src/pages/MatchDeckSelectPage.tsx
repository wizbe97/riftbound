import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type DocumentData,
  type Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useLobbySession } from '../contexts/LobbyContext';
import { ALL_CARDS } from '../data/riftboundCards';
import type { RiftboundCard } from '../data/riftboundCards';

type LobbyPlayer = {
  uid: string;
  username: string;
};

type LobbySpectator = {
  uid: string;
  username: string;
};

type LobbyRules = {
  bestOf: 1 | 3;
  sideboard: boolean;
};

type SelectedDeckInfo = {
  ownerUid: string;
  deckId: string;
  deckName: string;
};

export type Lobby = {
  id: string;
  hostUid: string;
  hostUsername: string;
  status: 'open' | 'selecting-decks' | 'in-game' | 'closed';
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

type DeckCardDoc = { cardId: string; quantity: number };

type DeckDoc = {
  name: string;
  ownerUid: string;
  cards: DeckCardDoc[];
  sideboard?: DeckCardDoc[];
  legendCardId?: string | null;
  championCardId?: string | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

type DeckSummary = {
  id: string;
  name: string;
  legendCardId?: string | null;
  championCardId?: string | null;
  cardCount: number;
};

function mapLobby(id: string, data: DocumentData): Lobby {
  const rawRules = (data.rules ?? {}) as Partial<LobbyRules>;
  const rules: LobbyRules = {
    bestOf: rawRules.bestOf === 3 ? 3 : 1,
    sideboard: !!rawRules.sideboard,
  };

  const rawP1Deck = (data.p1Deck ?? null) as Partial<SelectedDeckInfo> | null;
  const rawP2Deck = (data.p2Deck ?? null) as Partial<SelectedDeckInfo> | null;

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
    status: (data.status ?? 'open') as Lobby['status'],
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

function MatchDeckSelectPage() {
  const { user } = useAuth();
  const { lobbyId } = useParams<{ lobbyId: string }>();
  const navigate = useNavigate();
  const { setActiveLobbyId } = useLobbySession();

  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [loadingLobby, setLoadingLobby] = useState(true);

  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(true);

  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cardById = useMemo(() => {
    const map = new Map<string, RiftboundCard>();
    for (const card of ALL_CARDS) {
      map.set(card.id, card);
    }
    return map;
  }, []);

  // Subscribe to lobby
  useEffect(() => {
    if (!lobbyId) return;

    const lobbyRef = doc(db, 'lobbies', lobbyId);
    const unsub = onSnapshot(
      lobbyRef,
      (snap) => {
        if (!snap.exists()) {
          setLobby(null);
          setLoadingLobby(false);
          setActiveLobbyId(null);
          navigate('/play');
          return;
        }

        const mapped = mapLobby(snap.id, snap.data());
        setLobby(mapped);
        setLoadingLobby(false);
        setActiveLobbyId(snap.id);
      },
      (err) => {
        console.error(
          '[MatchDeckSelectPage] Failed to subscribe to lobby',
          err,
        );
        setLoadingLobby(false);
      },
    );

    return () => unsub();
  }, [lobbyId, navigate, setActiveLobbyId]);

  // Navigate based on lobby status
  useEffect(() => {
    if (!lobby) return;

    if (lobby.status === 'open') {
      navigate(`/play/private/${lobby.id}`);
    } else if (lobby.status === 'in-game') {
      // When the lobby is in-game, go to the match board
      navigate(`/play/private/${lobby.id}/match`);
    } else if (lobby.status === 'closed') {
      setActiveLobbyId(null);
      navigate('/play');
    }
  }, [lobby, navigate, setActiveLobbyId]);

  // Load user's decks
  useEffect(() => {
    if (!user) {
      setDecks([]);
      setLoadingDecks(false);
      return;
    }

    setLoadingDecks(true);
    const decksRef = collection(db, 'users', user.uid, 'decks');
    const q = query(decksRef, orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: DeckSummary[] = snap.docs.map((d) => {
          const data = d.data() as DeckDoc;
          const cardCount = (data.cards ?? []).reduce(
            (sum, c) => sum + (c.quantity ?? 0),
            0,
          );
          return {
            id: d.id,
            name: data.name ?? 'Untitled Deck',
            legendCardId: data.legendCardId ?? null,
            championCardId: data.championCardId ?? null,
            cardCount,
          };
        });
        setDecks(list);
        setLoadingDecks(false);
      },
      (err) => {
        console.error('[MatchDeckSelectPage] failed to load decks', err);
        setLoadingDecks(false);
      },
    );

    return () => unsub();
  }, [user]);

  // Auto-select first deck in the list
  useEffect(() => {
    if (!loadingDecks && decks.length > 0 && !selectedDeckId) {
      setSelectedDeckId(decks[0].id);
    }
  }, [loadingDecks, decks, selectedDeckId]);

  // Auto-progress to game once both decks set (host only updates status)
  useEffect(() => {
    if (!lobby || lobby.status !== 'selecting-decks') return;
    if (!lobby.p1Deck || !lobby.p2Deck) return;
    if (!user || user.uid !== lobby.hostUid) return;

    const lobbyRef = doc(db, 'lobbies', lobby.id);
    void updateDoc(lobbyRef, {
      status: 'in-game',
      updatedAt: serverTimestamp(),
    }).catch((err) =>
      console.error(
        '[MatchDeckSelectPage] failed to move lobby to in-game',
        err,
      ),
    );
  }, [lobby, user]);

  if (!user) {
    return (
      <section>
        <h1 className="mb-4 text-3xl font-semibold text-amber-300">
          Choose Deck
        </h1>
        <p className="text-sm text-slate-300">
          You need an account to play private matches.
        </p>
      </section>
    );
  }

  if (loadingLobby || !lobby) {
    return (
      <section>
        <h1 className="mb-4 text-3xl font-semibold text-amber-300">
          Choose Deck
        </h1>
        <p className="text-sm text-slate-300">Loading lobby…</p>
      </section>
    );
  }

  const isP1 = lobby.p1 && lobby.p1.uid === user.uid;
  const isP2 = lobby.p2 && lobby.p2.uid === user.uid;
  const isPlayer = isP1 || isP2;

  const mySeatLabel = isP1 ? 'Player 1' : isP2 ? 'Player 2' : 'Spectator';
  const myCurrentDeck = isP1 ? lobby.p1Deck : isP2 ? lobby.p2Deck : null;

  const opponentHasDeck =
    isP1 ? !!lobby.p2Deck : isP2 ? !!lobby.p1Deck : false;
  const iHaveConfirmed = !!myCurrentDeck;
  const waitingForOpponent =
    isPlayer && iHaveConfirmed && !opponentHasDeck;

  const handleConfirmDeck = async () => {
    if (!user || !lobby) return;
    if (!isPlayer) return;

    if (!selectedDeckId) {
      setError('Select a deck first.');
      return;
    }

    const deck = decks.find((d) => d.id === selectedDeckId);
    if (!deck) {
      setError('Selected deck not found.');
      return;
    }

    setError(null);
    setConfirming(true);

    const field = isP1 ? 'p1Deck' : 'p2Deck';

    try {
      const lobbyRef = doc(db, 'lobbies', lobby.id);
      await updateDoc(lobbyRef, {
        [field]: {
          ownerUid: user.uid,
          deckId: deck.id,
          deckName: deck.name,
        },
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('[MatchDeckSelectPage] failed to confirm deck', err);
      setError('Failed to confirm deck. Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  const handleBackToLobby = () => {
    navigate(`/play/private/${lobby.id}`);
  };

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleBackToLobby}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-900/80 text-sm text-slate-100 hover:border-amber-400 hover:text-amber-200"
        >
          ←
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-amber-300">
            Choose Your Deck
          </h1>
          <p className="text-xs text-slate-400">
            {lobby.p1?.username ?? 'Player 1'} vs{' '}
            {lobby.p2?.username ?? 'Player 2'} • Best of {lobby.rules.bestOf}
            {lobby.rules.sideboard ? ' with sideboard' : ''}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            You are{' '}
            <span className="font-semibold text-amber-200">{mySeatLabel}</span>.
            Each player picks a deck, then the game will start on the playmat.
          </p>
        </div>
      </div>

      {/* If spectator, show readonly state */}
      {!isPlayer && (
        <div className="rounded-xl border border-amber-500/40 bg-slate-900/70 p-4 text-sm text-slate-200">
          You&apos;re spectating this match. Waiting for players to choose
          decks…
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[2fr,3fr]">
        {/* Your deck selection */}
        <div className="rounded-xl border border-amber-500/40 bg-slate-900/70 p-4 shadow-md">
          <h2 className="mb-2 text-lg font-semibold text-amber-200">
            {isPlayer ? 'Your Decks' : 'Player Decks'}
          </h2>

          {loadingDecks ? (
            <p className="text-sm text-slate-300">Loading your decks…</p>
          ) : decks.length === 0 ? (
            <p className="text-sm text-slate-300">
              You don&apos;t have any decks yet. Create one on the Decks page.
            </p>
          ) : (
            <ul className="divide-y divide-slate-800 text-sm">
              {decks.map((deck) => {
                const isSelected = deck.id === selectedDeckId;
                const legendCard =
                  deck.legendCardId && cardById.get(deck.legendCardId);

                return (
                  <li
                    key={deck.id}
                    className={`flex cursor-pointer items-center justify-between gap-3 py-2 ${
                      isSelected ? 'bg-slate-900/90' : 'hover:bg-slate-900/80'
                    } ${
                      !isPlayer || iHaveConfirmed
                        ? 'cursor-default opacity-75'
                        : ''
                    }`}
                    onClick={() =>
                      isPlayer &&
                      !iHaveConfirmed &&
                      setSelectedDeckId(deck.id)
                    }
                  >
                    <div className="flex items-center gap-3">
                      {/* pip */}
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-slate-400">
                        {isSelected && (
                          <span className="h-3 w-3 rounded-full bg-emerald-400" />
                        )}
                      </span>

                      <div className="h-14 w-10 flex-shrink-0">
                        {legendCard ? (
                          <img
                            src={legendCard.images.small}
                            alt={legendCard.name}
                            className="h-14 w-auto rounded-md border border-amber-500/60 bg-slate-950 object-cover"
                          />
                        ) : (
                          <div className="flex h-14 w-10 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-[10px] text-slate-400">
                            No Legend
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-slate-100">{deck.name}</div>
                        <div className="text-[11px] text-slate-400">
                          {deck.cardCount} cards
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {isPlayer && (
            <>
              {error && (
                <div className="mt-3 rounded border border-red-500/60 bg-red-950/60 px-3 py-1.5 text-xs text-red-200">
                  {error}
                </div>
              )}
              <button
                type="button"
                disabled={
                  confirming ||
                  !selectedDeckId ||
                  waitingForOpponent ||
                  iHaveConfirmed
                }
                onClick={handleConfirmDeck}
                className="mt-3 inline-flex w-full items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {waitingForOpponent
                  ? "Awaiting other player's selection…"
                  : confirming
                  ? 'Confirming…'
                  : iHaveConfirmed
                  ? 'Deck Confirmed'
                  : 'Confirm Deck'}
              </button>
              {iHaveConfirmed && (
                <p className="mt-2 text-[11px] text-slate-400">
                  Your deck is locked in. Waiting for the other player to
                  confirm theirs…
                </p>
              )}
            </>
          )}
        </div>

        {/* Overall status – no deck names, just ready state */}
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-500/40 bg-slate-900/70 p-4 shadow-md text-sm text-slate-100">
            <h2 className="mb-2 text-lg font-semibold text-amber-200">
              Match Status
            </h2>

            <ul className="space-y-2 text-xs">
              <li>
                <span className="font-semibold text-amber-200">Player 1</span> –{' '}
                {lobby.p1 ? lobby.p1.username : 'Empty slot'}{' '}
                {lobby.p1Deck && (
                  <span className="text-emerald-300">· ready</span>
                )}
              </li>
              <li>
                <span className="font-semibold text-amber-200">Player 2</span> –{' '}
                {lobby.p2 ? lobby.p2.username : 'Empty slot'}{' '}
                {lobby.p2Deck && (
                  <span className="text-emerald-300">· ready</span>
                )}
              </li>
            </ul>

            <p className="mt-3 text-[11px] text-slate-400">
              The game will automatically start once both players have confirmed
              their decks.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default MatchDeckSelectPage;

/**
 * Overlay version of the deck select UI, rendered on top of the playmat.
 * Small centred popup, auto-selects first deck, shows "awaiting other player"
 * and does NOT reveal which deck each player picked.
 */
export function MatchDeckSelectOverlay({ lobby }: { lobby: Lobby }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(true);

  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cardById = useMemo(() => {
    const map = new Map<string, RiftboundCard>();
    for (const card of ALL_CARDS) {
      map.set(card.id, card);
    }
    return map;
  }, []);

  // Load user's decks
  useEffect(() => {
    if (!user) {
      setDecks([]);
      setLoadingDecks(false);
      return;
    }

    setLoadingDecks(true);
    const decksRef = collection(db, 'users', user.uid, 'decks');
    const q = query(decksRef, orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: DeckSummary[] = snap.docs.map((d) => {
          const data = d.data() as DeckDoc;
          const cardCount = (data.cards ?? []).reduce(
            (sum, c) => sum + (c.quantity ?? 0),
            0,
          );
          return {
            id: d.id,
            name: data.name ?? 'Untitled Deck',
            legendCardId: data.legendCardId ?? null,
            championCardId: data.championCardId ?? null,
            cardCount,
          };
        });
        setDecks(list);
        setLoadingDecks(false);
      },
      (err) => {
        console.error('[MatchDeckSelectOverlay] failed to load decks', err);
        setLoadingDecks(false);
      },
    );

    return () => unsub();
  }, [user]);

  // Auto-select first deck
  useEffect(() => {
    if (!loadingDecks && decks.length > 0 && !selectedDeckId) {
      setSelectedDeckId(decks[0].id);
    }
  }, [loadingDecks, decks, selectedDeckId]);

  if (!user) {
    return (
      <section className="space-y-4">
        <div className="rounded-xl border border-amber-500/40 bg-slate-900/80 p-4 text-sm text-slate-200">
          You need an account to choose a deck.
        </div>
      </section>
    );
  }

  const isP1 = lobby.p1 && lobby.p1.uid === user.uid;
  const isP2 = lobby.p2 && lobby.p2.uid === user.uid;
  const isPlayer = isP1 || isP2;

  const mySeatLabel = isP1 ? 'Player 1' : isP2 ? 'Player 2' : 'Spectator';
  const myCurrentDeck = isP1 ? lobby.p1Deck : isP2 ? lobby.p2Deck : null;

  const opponentHasDeck =
    isP1 ? !!lobby.p2Deck : isP2 ? !!lobby.p1Deck : false;
  const iHaveConfirmed = !!myCurrentDeck;
  const waitingForOpponent =
    isPlayer && iHaveConfirmed && !opponentHasDeck;

  const handleConfirmDeck = async () => {
    if (!user || !lobby || !isPlayer) return;

    if (!selectedDeckId) {
      setError('Select a deck first.');
      return;
    }

    const deck = decks.find((d) => d.id === selectedDeckId);
    if (!deck) {
      setError('Selected deck not found.');
      return;
    }

    setError(null);
    setConfirming(true);

    const field = isP1 ? 'p1Deck' : 'p2Deck';

    try {
      const lobbyRef = doc(db, 'lobbies', lobby.id);
      await updateDoc(lobbyRef, {
        [field]: {
          ownerUid: user.uid,
          deckId: deck.id,
          deckName: deck.name,
        },
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('[MatchDeckSelectOverlay] failed to confirm deck', err);
      setError('Failed to confirm deck. Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  const handleBackToLobby = () => {
    navigate(`/play/private/${lobby.id}`);
  };

  return (
    <section className="space-y-4">
      {/* Compact header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-amber-300">
            Choose your deck
          </h1>
          <p className="mt-1 text-[11px] text-slate-400">
            Select one of your decks to use for this match. You can&apos;t
            change it once the game begins.
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            You are{' '}
            <span className="font-semibold text-amber-200">
              {mySeatLabel}
            </span>{' '}
            · {lobby.p1?.username ?? 'Player 1'} vs{' '}
            {lobby.p2?.username ?? 'Player 2'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleBackToLobby}
          className="inline-flex h-8 items-center justify-center rounded-full border border-slate-700 bg-slate-900/80 px-3 text-[11px] text-slate-100 hover:border-amber-400 hover:text-amber-200"
        >
          Back to Lobby
        </button>
      </div>

      {!isPlayer && (
        <div className="rounded-lg border border-amber-500/30 bg-slate-900/70 p-3 text-[12px] text-slate-200">
          You&apos;re spectating this match. Waiting for players to choose
          decks…
        </div>
      )}

      {/* Deck list: pip + legend + champ + name + card count */}
      <div className="space-y-3">
        {loadingDecks ? (
          <p className="text-sm text-slate-300">Loading your decks…</p>
        ) : decks.length === 0 ? (
          <p className="text-sm text-slate-300">
            You don&apos;t have any decks yet. Create one on the Decks page.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {decks.map((deck) => {
              const isSelected = deck.id === selectedDeckId;
              const legendCard =
                deck.legendCardId && cardById.get(deck.legendCardId);
              const championCard =
                deck.championCardId && cardById.get(deck.championCardId);

              return (
                <li key={deck.id} className="py-0.5">
                  <button
                    type="button"
                    disabled={!isPlayer || iHaveConfirmed}
                    onClick={() =>
                      isPlayer && !iHaveConfirmed && setSelectedDeckId(deck.id)
                    }
                    className={`flex w-full items-center gap-4 rounded-lg border px-4 py-3 text-left transition ${
                      isSelected
                        ? 'border-amber-400 bg-slate-900/90 shadow-md'
                        : 'border-slate-700/70 bg-slate-900/80 hover:border-amber-400/70 hover:bg-slate-900'
                    } ${
                      !isPlayer || iHaveConfirmed
                        ? 'cursor-default opacity-75'
                        : ''
                    }`}
                  >
                    {/* Pip */}
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-slate-400">
                      {isSelected && (
                        <span className="h-3 w-3 rounded-full bg-emerald-400" />
                      )}
                    </span>

                    {/* Legend / Champ thumbnails */}
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col items-center gap-1">
                        {legendCard ? (
                          <img
                            src={legendCard.images.small}
                            alt={legendCard.name}
                            className="h-14 w-10 rounded-md border border-amber-500/60 bg-slate-950 object-cover"
                          />
                        ) : (
                          <div className="flex h-14 w-10 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-[10px] text-slate-400">
                            —
                          </div>
                        )}
                        <span className="text-[9px] uppercase tracking-wide text-slate-400">
                          Legend
                        </span>
                      </div>

                      <div className="flex flex-col items-center gap-1">
                        {championCard ? (
                          <img
                            src={championCard.images.small}
                            alt={championCard.name}
                            className="h-14 w-10 rounded-md border border-amber-500/60 bg-slate-950 object-cover"
                          />
                        ) : (
                          <div className="flex h-14 w-10 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-[10px] text-slate-400">
                            —
                          </div>
                        )}
                        <span className="text-[9px] uppercase tracking-wide text-slate-400">
                          Champion
                        </span>
                      </div>
                    </div>

                    {/* Deck text */}
                    <div className="ml-2">
                      <div className="text-sm font-semibold text-slate-100">
                        {deck.name}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {deck.cardCount} cards
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {isPlayer && (
        <>
          {error && (
            <div className="mt-1 rounded border border-red-500/60 bg-red-950/60 px-3 py-1.5 text-xs text-red-200">
              {error}
            </div>
          )}

          <div className="mt-3 flex justify-end gap-3">
            <button
              type="button"
              disabled
              className="inline-flex items-center justify-center rounded-md border border-transparent px-3 py-2 text-[11px] text-slate-500"
            >
              {waitingForOpponent
                ? 'Your deck is locked in.'
                : iHaveConfirmed
                ? 'Deck confirmed.'
                : ''}
            </button>
            <button
              type="button"
              disabled={
                confirming ||
                !selectedDeckId ||
                waitingForOpponent ||
                iHaveConfirmed
              }
              onClick={handleConfirmDeck}
              className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 shadow hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {waitingForOpponent
                ? "Awaiting other player's selection…"
                : confirming
                ? 'Confirming…'
                : iHaveConfirmed
                ? 'Deck Confirmed'
                : 'Confirm Deck'}
            </button>
          </div>
        </>
      )}

      {/* Tiny match status, without deck names */}
      <div className="mt-4 rounded-lg border border-amber-500/30 bg-slate-900/80 p-3 text-[11px] text-slate-200">
        <div className="mb-1 font-semibold text-amber-200">
          Match Status
        </div>
        <ul className="space-y-1">
          <li>
            Player 1 – {lobby.p1 ? lobby.p1.username : 'Empty slot'}{' '}
            {lobby.p1Deck && (
              <span className="text-emerald-300">· ready</span>
            )}
          </li>
          <li>
            Player 2 – {lobby.p2 ? lobby.p2.username : 'Empty slot'}{' '}
            {lobby.p2Deck && (
              <span className="text-emerald-300">· ready</span>
            )}
          </li>
        </ul>
      </div>
    </section>
  );
}
