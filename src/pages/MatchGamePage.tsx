// src/pages/MatchGamePage.tsx
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../styles/gameplay.css';
import type { BoardZoneId } from '../game/boardConfig';
import { MatchDeckSelectOverlay, type Lobby } from './MatchDeckSelectPage';
import { useAuth } from '../contexts/AuthContext';
import {
  doc,
  onSnapshot,
  type DocumentData,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useLobbySession } from '../contexts/LobbyContext';

export type ZoneVisualKind = 'card' | 'rectWide';

export type LayoutCell = {
  id: string;
  zoneId: BoardZoneId;
  kind: ZoneVisualKind;
  row: number;
  colStart: number;
  colSpan: number;
  debugLabel?: string;
  offsetLeft?: number;
  offsetRight?: number;
  offsetTop?: number;
  offsetBottom?: number;
};

const ROW_GAP_DEFAULT = 16;
const COL_GAP_DEFAULT = 8;

type ZoneKey =
  | 'deck'
  | 'discard'
  | 'champion'
  | 'legend'
  | 'base'
  | 'runeChannel'
  | 'runes'
  | 'hand'
  | 'battle1'
  | 'battle2';

type SideZones = Record<ZoneKey, BoardZoneId>;

function makeSideZones(player: 'p1' | 'p2'): SideZones {
  const up = player.toUpperCase() as 'P1' | 'P2';

  return {
    deck: `${player}Deck` as BoardZoneId,
    discard: `${player}Discard` as BoardZoneId,
    champion: `${player}ChampionZone` as BoardZoneId,
    legend: `${player}LegendZone` as BoardZoneId,
    base: `${player}Base` as BoardZoneId,
    runeChannel: `${player}RuneChannel` as BoardZoneId,
    runes: `${player}RuneDeck` as BoardZoneId,
    hand: `${player}Hand` as BoardZoneId,
    battle1: `battlefieldLeft${up}` as BoardZoneId,
    battle2: `battlefieldRight${up}` as BoardZoneId,
  };
}

function mapLobby(id: string, data: DocumentData): Lobby {
  const rawRules = (data.rules ?? {}) as Partial<Lobby['rules']>;
  const rules: Lobby['rules'] = {
    bestOf: rawRules.bestOf === 3 ? 3 : 1,
    sideboard: !!rawRules.sideboard,
  };

  const rawP1Deck = (data.p1Deck ?? null) as Partial<Lobby['p1Deck']> | null;
  const rawP2Deck = (data.p2Deck ?? null) as Partial<Lobby['p2Deck']> | null;

  const p1Deck: Lobby['p1Deck'] =
    rawP1Deck && rawP1Deck.deckId
      ? {
          ownerUid: rawP1Deck.ownerUid ?? '',
          deckId: rawP1Deck.deckId ?? '',
          deckName: rawP1Deck.deckName ?? 'Unknown Deck',
        }
      : null;

  const p2Deck: Lobby['p2Deck'] =
    rawP2Deck && rawP2Deck.deckId
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

function MatchGamePage() {
  const { user } = useAuth();
  const { lobbyId } = useParams<{ lobbyId: string }>();
  const navigate = useNavigate();
  const { setActiveLobbyId } = useLobbySession();

  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [loadingLobby, setLoadingLobby] = useState(true);

  useEffect(() => {
    if (!lobbyId) {
      setLobby(null);
      setLoadingLobby(false);
      return;
    }

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
        console.error('[MatchGamePage] Failed to subscribe to lobby', err);
        setLoadingLobby(false);
      },
    );

    return () => unsub();
  }, [lobbyId, navigate, setActiveLobbyId]);

  useEffect(() => {
    if (!lobby) return;
    if (!lobby.p1Deck || !lobby.p2Deck) return;
    if (!user || user.uid !== lobby.hostUid) return;
    if (lobby.status === 'in-game') return;

    const lobbyRef = doc(db, 'lobbies', lobby.id);
    void updateDoc(lobbyRef, {
      status: 'in-game',
      updatedAt: serverTimestamp(),
    }).catch((err) =>
      console.error('[MatchGamePage] failed to move lobby to in-game', err),
    );
  }, [lobby, user]);

  if (!user) {
    return (
      <section className="rb-game-root flex flex-col items-center justify-center">
        <p className="text-sm text-slate-300">
          You need an account and a valid lobby to play a match.
        </p>
      </section>
    );
  }

  if (loadingLobby || !lobby) {
    return (
      <section className="rb-game-root flex flex-col items-center justify-center">
        <p className="text-sm text-slate-300">Loading match…</p>
      </section>
    );
  }

  // Top is p2, bottom is p1
  const bottomZones = makeSideZones('p1');
  const topZones = makeSideZones('p2');

  const layoutCells: LayoutCell[] = [
    // Row 1 – top deck / discard / hand
    { id: 'top_deck', zoneId: topZones.deck, kind: 'card', row: 1, colStart: 1, colSpan: 1, debugLabel: 'Top Deck' },
    { id: 'top_discard', zoneId: topZones.discard, kind: 'card', row: 1, colStart: 2, colSpan: 1, debugLabel: 'Top Discard' },
    { id: 'top_hand', zoneId: topZones.hand, kind: 'rectWide', row: 1, colStart: 3, colSpan: 2, debugLabel: 'Top Hand' },

    // Row 2 – champs/legend + base + rune channel + runes
    { id: 'top_champion', zoneId: topZones.champion, kind: 'card', row: 2, colStart: 1, colSpan: 1, debugLabel: 'Top Champion' },
    { id: 'top_legend', zoneId: topZones.legend, kind: 'card', row: 2, colStart: 2, colSpan: 1, debugLabel: 'Top Legend' },
    { id: 'top_base', zoneId: topZones.base, kind: 'rectWide', row: 2, colStart: 3, colSpan: 1, debugLabel: 'Top Base' },
    { id: 'top_rune_channel', zoneId: topZones.runeChannel, kind: 'rectWide', row: 2, colStart: 4, colSpan: 2, debugLabel: 'Top Rune Channel' },
    { id: 'top_runes', zoneId: topZones.runes, kind: 'card', row: 2, colStart: 6, colSpan: 1, debugLabel: 'Top Runes' },

    // Row 3 – top battlefield lanes
    { id: 'top_battle1', zoneId: topZones.battle1, kind: 'rectWide', row: 3, colStart: 1, colSpan: 3, debugLabel: 'Top Battle 1' },
    { id: 'top_battle2', zoneId: topZones.battle2, kind: 'rectWide', row: 3, colStart: 4, colSpan: 3, debugLabel: 'Top Battle 2' },

    // Row 4 – bottom battlefield lanes; pull up to overlap row 3 slightly
    { id: 'bot_battle1', zoneId: bottomZones.battle1, kind: 'rectWide', row: 4, colStart: 1, colSpan: 3, debugLabel: 'Bot Battle 1', offsetTop: -(ROW_GAP_DEFAULT + 2) },
    { id: 'bot_battle2', zoneId: bottomZones.battle2, kind: 'rectWide', row: 4, colStart: 4, colSpan: 3, debugLabel: 'Bot Battle 2', offsetTop: -(ROW_GAP_DEFAULT + 2) },

    // Row 5 – bottom runes / rune channel / base / legend / champion
    { id: 'bot_runes', zoneId: bottomZones.runes, kind: 'card', row: 5, colStart: 1, colSpan: 1, debugLabel: 'Bot Runes' },
    { id: 'bot_rune_channel', zoneId: bottomZones.runeChannel, kind: 'rectWide', row: 5, colStart: 2, colSpan: 2, debugLabel: 'Bot Rune Channel' },
    { id: 'bot_base', zoneId: bottomZones.base, kind: 'rectWide', row: 5, colStart: 4, colSpan: 1, debugLabel: 'Bot Base' },
    { id: 'bot_legend', zoneId: bottomZones.legend, kind: 'card', row: 5, colStart: 5, colSpan: 1, debugLabel: 'Bot Legend' },
    { id: 'bot_champion', zoneId: bottomZones.champion, kind: 'card', row: 5, colStart: 6, colSpan: 1, debugLabel: 'Bot Champion' },

    // Row 6 – bottom hand / deck / discard
    { id: 'bot_hand', zoneId: bottomZones.hand, kind: 'rectWide', row: 6, colStart: 3, colSpan: 2, debugLabel: 'Bot Hand' },
    { id: 'bot_deck', zoneId: bottomZones.deck, kind: 'card', row: 6, colStart: 5, colSpan: 1, debugLabel: 'Bot Deck' },
    { id: 'bot_discard', zoneId: bottomZones.discard, kind: 'card', row: 6, colStart: 6, colSpan: 1, debugLabel: 'Bot Discard' },
  ];

  const showDeckSelectOverlay = !lobby.p1Deck || !lobby.p2Deck;

  return (
    <>
      <section className="rb-game-root flex flex-col">
        <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950/90 px-4 py-2">
          <div className="text-sm font-semibold text-amber-200">
            Riftbound — Match Layout
          </div>
          <div className="text-xs text-slate-400">
            {(lobby.p1 && lobby.p1.username) || 'Player 1'} vs{' '}
            {(lobby.p2 && lobby.p2.username) || 'Player 2'}
          </div>
        </header>

        <div className="flex h-full">
          <div className="rb-game-main flex flex-1 flex-col">
            <div className="flex-1 px-2 pb-2 pt-2">
              <GameBoardLayout layoutCells={layoutCells} />
            </div>
          </div>

          <div className="rb-game-chat-spacer flex h-full w-80 flex-col justify-end px-2 pb-2 pt-2" />
        </div>
      </section>

      {showDeckSelectOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-xl rounded-xl border border-amber-500/60 bg-slate-950/95 p-4 shadow-2xl">
            <MatchDeckSelectOverlay lobby={lobby} />
          </div>
        </div>
      )}
    </>
  );
}

type GameBoardLayoutProps = {
  layoutCells: LayoutCell[];
};

function getRowMarginTop(row: number): number {
  if (row === 1) return 0;
  return ROW_GAP_DEFAULT;
}

function GameBoardLayout({ layoutCells }: GameBoardLayoutProps) {
  return (
    <div className="rb-game-board relative h-full rounded-xl bg-slate-950/80 px-4 py-4">
      <div
        className="h-full w-full"
        style={{
          display: 'grid',
          gridTemplateColumns:
            'minmax(var(--rb-card-width), auto) minmax(var(--rb-card-width), auto) minmax(0, 2.5fr) minmax(0, 2.5fr) minmax(var(--rb-card-width), auto) minmax(var(--rb-card-width), auto)',
          gridAutoRows: 'auto',
          rowGap: ROW_GAP_DEFAULT,
          columnGap: COL_GAP_DEFAULT,
          alignItems: 'stretch',
        }}
      >
        {layoutCells.map((cell) => {
          const style: CSSProperties = {
            gridRow: cell.row,
            gridColumn: `${cell.colStart} / span ${cell.colSpan}`,
            marginLeft: cell.offsetLeft ?? 0,
            marginRight: cell.offsetRight ?? 0,
            marginTop:
              typeof cell.offsetTop === 'number'
                ? cell.offsetTop
                : getRowMarginTop(cell.row),
            marginBottom: cell.offsetBottom ?? 0,
          };

          const base =
            'relative flex h-full items-center justify-center overflow-visible rounded-xl border border-amber-500/40 px-3';

          const kindClass =
            cell.kind === 'card'
              ? 'rb-zone-card-slot-inner bg-slate-900/60'
              : 'rb-zone-rect bg-slate-900/40';

          return (
            <div
              key={cell.id}
              style={style}
              className={`${base} ${kindClass}`}
              data-zone-id={cell.zoneId}
            >
              {cell.debugLabel && (
                <span className="rb-zone-label text-[10px] uppercase tracking-wide text-slate-400">
                  {cell.debugLabel}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default MatchGamePage;
