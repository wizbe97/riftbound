// src/pages/MatchGamePage.tsx
import type { CSSProperties, MouseEvent } from 'react';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../styles/gameplay.css';
import { useAuth } from '../contexts/AuthContext';
import ChatBox from '../components/ChatBox';
import type { BoardZoneId, CardKey } from '../game/boardConfig';
import type { Role } from '../types/riftboundGame';
import { InteractiveCard } from '../components/cards/InteractiveCard';
import type { RiftboundCard } from '../data/riftboundCards';

import {
  useMatchBoard,
  type ZoneCardsMap,
} from '../hooks/useMatchBoard';
import { MatchDeckSelectOverlay } from './MatchDeckSelectPage';

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

// Helper: who owns a card key (for isOwn flag)
function getOwnerFromCardKey(cardKey: CardKey): 'p1' | 'p2' {
  return cardKey.startsWith('p1') ? 'p1' : 'p2';
}

function MatchGamePage() {
  const { user, profile } = useAuth();
  const { lobbyId } = useParams<{ lobbyId: string }>();
  const navigate = useNavigate();

  const {
    loading,
    lobby,
    currentRole,
    bottomPlayer,
    topPlayer,
    bottomName,
    topName,
    zoneCards,
  } = useMatchBoard(lobbyId, user?.uid);

  useEffect(() => {
    if (!loading && !lobby) {
      navigate('/play');
    }
  }, [loading, lobby, navigate]);

  if (!user || !profile || !lobbyId) {
    return (
      <section className="rb-game-root flex flex-col items-center justify-center">
        <p className="text-sm text-slate-300">
          You need an account and a valid lobby to play a match.
        </p>
      </section>
    );
  }

  if (loading || !lobby) {
    return (
      <section className="rb-game-root flex flex-col items-center justify-center">
        <p className="text-sm text-slate-300">Loading match…</p>
      </section>
    );
  }

  const bottomZones = makeSideZones(bottomPlayer);
  const topZones = makeSideZones(topPlayer);

  const layoutCells: LayoutCell[] = [
    { id: 'top_deck', zoneId: topZones.deck, kind: 'card', row: 1, colStart: 1, colSpan: 1, debugLabel: 'Top Deck' },
    { id: 'top_discard', zoneId: topZones.discard, kind: 'card', row: 1, colStart: 2, colSpan: 1, debugLabel: 'Top Discard' },
    { id: 'top_hand', zoneId: topZones.hand, kind: 'rectWide', row: 1, colStart: 3, colSpan: 2, debugLabel: 'Top Hand' },

    { id: 'top_champion', zoneId: topZones.champion, kind: 'card', row: 2, colStart: 1, colSpan: 1, debugLabel: 'Top Champion' },
    { id: 'top_legend', zoneId: topZones.legend, kind: 'card', row: 2, colStart: 2, colSpan: 1, debugLabel: 'Top Legend' },
    { id: 'top_base', zoneId: topZones.base, kind: 'rectWide', row: 2, colStart: 3, colSpan: 1, debugLabel: 'Top Base' },
    { id: 'top_rune_channel', zoneId: topZones.runeChannel, kind: 'rectWide', row: 2, colStart: 4, colSpan: 2, debugLabel: 'Top Rune Channel' },
    { id: 'top_runes', zoneId: topZones.runes, kind: 'card', row: 2, colStart: 6, colSpan: 1, debugLabel: 'Top Runes' },

    { id: 'top_battle1', zoneId: topZones.battle1, kind: 'rectWide', row: 3, colStart: 1, colSpan: 3, debugLabel: 'Top Battle 1' },
    { id: 'top_battle2', zoneId: topZones.battle2, kind: 'rectWide', row: 3, colStart: 4, colSpan: 3, debugLabel: 'Top Battle 2' },

    { id: 'bot_battle1', zoneId: bottomZones.battle1, kind: 'rectWide', row: 4, colStart: 1, colSpan: 3, debugLabel: 'Bot Battle 1' },
    { id: 'bot_battle2', zoneId: bottomZones.battle2, kind: 'rectWide', row: 4, colStart: 4, colSpan: 3, debugLabel: 'Bot Battle 2' },

    { id: 'bot_runes', zoneId: bottomZones.runes, kind: 'card', row: 5, colStart: 1, colSpan: 1, debugLabel: 'Bot Runes' },
    { id: 'bot_rune_channel', zoneId: bottomZones.runeChannel, kind: 'rectWide', row: 5, colStart: 2, colSpan: 2, debugLabel: 'Bot Rune Channel' },
    { id: 'bot_base', zoneId: bottomZones.base, kind: 'rectWide', row: 5, colStart: 4, colSpan: 1, debugLabel: 'Bot Base' },
    { id: 'bot_legend', zoneId: bottomZones.legend, kind: 'card', row: 5, colStart: 5, colSpan: 1, debugLabel: 'Bot Legend' },
    { id: 'bot_champion', zoneId: bottomZones.champion, kind: 'card', row: 5, colStart: 6, colSpan: 1, debugLabel: 'Bot Champion' },

    { id: 'bot_hand', zoneId: bottomZones.hand, kind: 'rectWide', row: 6, colStart: 3, colSpan: 2, debugLabel: 'Bot Hand' },
    { id: 'bot_deck', zoneId: bottomZones.deck, kind: 'card', row: 6, colStart: 5, colSpan: 1, debugLabel: 'Bot Deck' },
    { id: 'bot_discard', zoneId: bottomZones.discard, kind: 'card', row: 6, colStart: 6, colSpan: 1, debugLabel: 'Bot Discard' },
  ];

  // Show deck-select overlay if either player hasn't chosen a deck yet
  const showDeckSelectOverlay = !lobby.p1Deck || !lobby.p2Deck;

  return (
    <>
      <section className="rb-game-root flex flex-col">
        <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950/90 px-4 py-2">
          <div className="text-sm font-semibold text-amber-200">
            Riftbound — Match Layout
          </div>
          <div className="text-xs text-slate-400">
            {bottomName} vs {topName}
          </div>
        </header>

        <div className="flex h-full">
          <div className="rb-game-main flex flex-1 flex-col">
            <div className="flex-1 px-2 pb-2 pt-2">
              <GameBoardLayout
                layoutCells={layoutCells}
                zoneCards={zoneCards}
                currentRole={currentRole}
              />
            </div>
          </div>

          <div className="rb-game-chat-spacer flex h-full w-80 flex-col justify-end px-2 pb-2 pt-2">
            {user && profile && lobbyId && (
              <ChatBox
                lobbyId={lobbyId}
                currentRole={currentRole}
                userUid={user.uid}
                username={profile.username}
                title="Match Chat"
                fullHeight={false}
              />
            )}
          </div>
        </div>
      </section>

      {showDeckSelectOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-5xl rounded-xl border border-amber-500/40 bg-slate-950/95 p-4 shadow-2xl">
            <MatchDeckSelectOverlay lobby={lobby} />
          </div>
        </div>
      )}
    </>
  );
}

type GameBoardLayoutProps = {
  layoutCells: LayoutCell[];
  zoneCards: ZoneCardsMap;
  currentRole: Role;
};

function getRowMarginTop(row: number): number {
  if (row === 1) return 0;
  if (row === 4) return -2;
  return ROW_GAP_DEFAULT;
}

function GameBoardLayout({
  layoutCells,
  zoneCards,
  currentRole,
}: GameBoardLayoutProps) {
  // For now: stubbed handlers – only needed to satisfy InteractiveCard’s API
  const handleRotate = (_key: CardKey, _isOwn: boolean) => {};
  const handleContextMenu =
    (_key: CardKey, _isOwn: boolean) =>
    (e: MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
    };
  const handleHoverStart = (
    _card: RiftboundCard,
    _x: number,
    _y: number,
  ) => {};
  const handleHoverEnd = () => {};
  const handleBeginDrag = (
    _key: CardKey,
    _card: RiftboundCard,
    _rotation: number,
    _x: number,
    _y: number,
  ) => {};

  return (
    <div className="rb-game-board relative h-full rounded-xl bg-slate-950/80 px-4 py-4">
      <div
        className="h-full w-full"
        style={{
          display: 'grid',
          gridTemplateColumns:
            'minmax(var(--rb-card-width), auto) minmax(var(--rb-card-width), auto) minmax(0, 2.5fr) minmax(0, 2.5fr) minmax(var(--rb-card-width), auto) minmax(var(--rb-card-width), auto)',
          gridAutoRows: 'auto',
          rowGap: 0,
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

          const kind =
            cell.kind === 'card'
              ? 'rb-zone-card-slot-inner bg-slate-900/60'
              : 'rb-zone-rect bg-slate-900/40';

          const zoneCard = zoneCards[cell.zoneId];

          return (
            <div
              key={cell.id}
              style={style}
              className={`${base} ${kind}`}
              data-zone-id={cell.zoneId}
            >
              {zoneCard && (
                <InteractiveCard
                  cardKey={zoneCard.cardKey}
                  card={zoneCard.card}
                  rotation={zoneCard.rotation}
                  isOwn={
                    currentRole ===
                    (getOwnerFromCardKey(zoneCard.cardKey) as Role)
                  }
                  onRotate={handleRotate}
                  onContextMenu={handleContextMenu}
                  onHoverStart={handleHoverStart}
                  onHoverEnd={handleHoverEnd}
                  onBeginDrag={handleBeginDrag}
                  draggingKey={null}
                  stackStyle={{
                    width: '100%',
                    height: '100%',
                  }}
                />
              )}

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
