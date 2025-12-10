import React, { useState, useEffect } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import '../styles/gameplay.css';
import type { BoardZoneId } from '../game/boardConfig';
import {
  useMatchGameState,
  type ZoneCardMap,
  type PlayerSeat,
} from '../game/useMatchGameState';
import { MatchDeckSelectOverlay } from './MatchDeckSelectPage';
import runeBackImg from '../assets/rune-back.png';
import cardBackImg from '../assets/back-of-card.jpg';
import { CardInteraction } from '../components/CardInteraction';

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

type PileCounts = {
  p1Rune: number;
  p2Rune: number;
  p1Deck: number;
  p2Deck: number;
  p1Discard: number;
  p2Discard: number;
};

function MatchGamePage() {
  const { lobbyId } = useParams<{ lobbyId: string }>();

  const {
    user,
    lobby,
    loadingLobby,
    zoneCards,
    bothDecksChosen,
    p1RuneCount,
    p2RuneCount,
    p1DeckCount,
    p2DeckCount,
    mySeat,
    moveCardBetweenZones,
    sendCardToDiscard,
    sendCardToBottomOfDeck,
    drawFromDeck,
  } = useMatchGameState(lobbyId);

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

  // Figure out which absolute seat we are in this lobby (for perspective)
  const mySeatFromLobby: PlayerSeat | null =
    lobby.p1?.uid === user.uid ? 'p1' : lobby.p2?.uid === user.uid ? 'p2' : null;

  // Perspective:
  // - If I'm p1 => bottom = p1, top = p2
  // - If I'm p2 => bottom = p2, top = p1
  // - If spectator => bottom = p1, top = p2
  const bottomPlayer: 'p1' | 'p2' = mySeatFromLobby ?? 'p1';
  const topPlayer: 'p1' | 'p2' = bottomPlayer === 'p1' ? 'p2' : 'p1';

  const bottomZones = makeSideZones(bottomPlayer);
  const topZones = makeSideZones(topPlayer);

  const layoutCells: LayoutCell[] = [
    // Row 1 – top deck / discard / hand
    {
      id: 'top_deck',
      zoneId: topZones.deck,
      kind: 'card',
      row: 1,
      colStart: 1,
      colSpan: 1,
      debugLabel: 'Top Deck',
    },
    {
      id: 'top_discard',
      zoneId: topZones.discard,
      kind: 'card',
      row: 1,
      colStart: 2,
      colSpan: 1,
      debugLabel: 'Top Discard',
    },
    {
      id: 'top_hand',
      zoneId: topZones.hand,
      kind: 'rectWide',
      row: 1,
      colStart: 3,
      colSpan: 2,
      debugLabel: 'Top Hand',
    },

    // Row 2 – champs/legend + base + rune channel + runes
    {
      id: 'top_champion',
      zoneId: topZones.champion,
      kind: 'card',
      row: 2,
      colStart: 1,
      colSpan: 1,
      debugLabel: 'Top Champion',
    },
    {
      id: 'top_legend',
      zoneId: topZones.legend,
      kind: 'card',
      row: 2,
      colStart: 2,
      colSpan: 1,
      debugLabel: 'Top Legend',
    },
    {
      id: 'top_base',
      zoneId: topZones.base,
      kind: 'rectWide',
      row: 2,
      colStart: 3,
      colSpan: 1,
      debugLabel: 'Top Base',
    },
    {
      id: 'top_rune_channel',
      zoneId: topZones.runeChannel,
      kind: 'rectWide',
      row: 2,
      colStart: 4,
      colSpan: 2,
      debugLabel: 'Top Rune Channel',
    },
    {
      id: 'top_runes',
      zoneId: topZones.runes,
      kind: 'card',
      row: 2,
      colStart: 6,
      colSpan: 1,
      debugLabel: 'Top Runes',
    },

    // Row 3 – top battlefield lanes
    {
      id: 'top_battle1',
      zoneId: topZones.battle1,
      kind: 'rectWide',
      row: 3,
      colStart: 1,
      colSpan: 3,
      debugLabel: 'Top Battle 1',
    },
    {
      id: 'top_battle2',
      zoneId: topZones.battle2,
      kind: 'rectWide',
      row: 3,
      colStart: 4,
      colSpan: 3,
      debugLabel: 'Top Battle 2',
    },

    // Row 4 – bottom battlefield lanes
    {
      id: 'bot_battle1',
      zoneId: bottomZones.battle1,
      kind: 'rectWide',
      row: 4,
      colStart: 1,
      colSpan: 3,
      debugLabel: 'Bot Battle 1',
      offsetTop: -(ROW_GAP_DEFAULT + 2),
    },
    {
      id: 'bot_battle2',
      zoneId: bottomZones.battle2,
      kind: 'rectWide',
      row: 4,
      colStart: 4,
      colSpan: 3,
      debugLabel: 'Bot Battle 2',
      offsetTop: -(ROW_GAP_DEFAULT + 2),
    },

    // Row 5 – bottom runes / rune channel / base / legend / champion
    {
      id: 'bot_runes',
      zoneId: bottomZones.runes,
      kind: 'card',
      row: 5,
      colStart: 1,
      colSpan: 1,
      debugLabel: 'Bot Runes',
    },
    {
      id: 'bot_rune_channel',
      zoneId: bottomZones.runeChannel,
      kind: 'rectWide',
      row: 5,
      colStart: 2,
      colSpan: 2,
      debugLabel: 'Bot Rune Channel',
    },
    {
      id: 'bot_base',
      zoneId: bottomZones.base,
      kind: 'rectWide',
      row: 5,
      colStart: 4,
      colSpan: 1,
      debugLabel: 'Bot Base',
    },
    {
      id: 'bot_legend',
      zoneId: bottomZones.legend,
      kind: 'card',
      row: 5,
      colStart: 5,
      colSpan: 1,
      debugLabel: 'Bot Legend',
    },
    {
      id: 'bot_champion',
      zoneId: bottomZones.champion,
      kind: 'card',
      row: 5,
      colStart: 6,
      colSpan: 1,
      debugLabel: 'Bot Champion',
    },

    // Row 6 – bottom hand / deck / discard
    {
      id: 'bot_hand',
      zoneId: bottomZones.hand,
      kind: 'rectWide',
      row: 6,
      colStart: 3,
      colSpan: 2,
      debugLabel: 'Bot Hand',
    },
    {
      id: 'bot_deck',
      zoneId: bottomZones.deck,
      kind: 'card',
      row: 6,
      colStart: 5,
      colSpan: 1,
      debugLabel: 'Bot Deck',
    },
    {
      id: 'bot_discard',
      zoneId: bottomZones.discard,
      kind: 'card',
      row: 6,
      colStart: 6,
      colSpan: 1,
      debugLabel: 'Bot Discard',
    },
  ];

  const showDeckSelectOverlay = !bothDecksChosen;

  const p1DiscardCount = (zoneCards['p1Discard'] ?? []).length;
  const p2DiscardCount = (zoneCards['p2Discard'] ?? []).length;

  const pileCounts: PileCounts = {
    p1Rune: p1RuneCount,
    p2Rune: p2RuneCount,
    p1Deck: p1DeckCount,
    p2Deck: p2DeckCount,
    p1Discard: p1DiscardCount,
    p2Discard: p2DiscardCount,
  };

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
              <GameBoardLayout
                layoutCells={layoutCells}
                zoneCards={zoneCards}
                mySeat={mySeat}
                pileCounts={pileCounts}
                lobbyId={lobbyId ?? ''}
                moveCardBetweenZones={moveCardBetweenZones}
                sendCardToDiscard={sendCardToDiscard}
                sendCardToBottomOfDeck={sendCardToBottomOfDeck}
                drawFromDeck={drawFromDeck}
              />
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

// ---------- Board layout ----------

type GameBoardLayoutProps = {
  layoutCells: LayoutCell[];
  zoneCards: ZoneCardMap;
  mySeat: PlayerSeat | null;
  pileCounts: PileCounts;
  lobbyId: string;
  moveCardBetweenZones: (
    fromZoneId: BoardZoneId,
    fromIndex: number,
    toZoneId: BoardZoneId,
  ) => void;
  sendCardToDiscard: (
    fromZoneId: BoardZoneId,
    fromIndex: number,
    toDiscardZoneId: BoardZoneId,
  ) => void;
  sendCardToBottomOfDeck: (
    fromZoneId: BoardZoneId,
    fromIndex: number,
    deckZoneId: BoardZoneId,
  ) => void;
  drawFromDeck: (seat: PlayerSeat) => void;
};

function getRowMarginTop(row: number): number {
  if (row === 1) return 0;
  return ROW_GAP_DEFAULT;
}

function getZoneOwnerFromId(zoneId: BoardZoneId): PlayerSeat | null {
  const id = zoneId as string;
  if (id.startsWith('p1') || id.includes('P1')) return 'p1';
  if (id.startsWith('p2') || id.includes('P2')) return 'p2';
  return null;
}

function isDiscardZoneId(zoneId: BoardZoneId): boolean {
  const id = zoneId as string;
  return id.endsWith('Discard');
}

// Helper to choose how many cards can sit full-width before overlapping
function getMaxFullWidthCards(width: number, height: number): number {
  if (!width || !height) return 5; // fallback
  if (width >= 2560) return 10;
  if (width >= 1960 && height >= 1080) return 8;
  return 5;
}

function GameBoardLayout({
  layoutCells,
  zoneCards,
  mySeat,
  pileCounts,
  lobbyId,
  moveCardBetweenZones,
  sendCardToDiscard,
  sendCardToBottomOfDeck,
  drawFromDeck,
}: GameBoardLayoutProps) {
  // Track window size so layout responds to resizes
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const maxFullWidthCards = getMaxFullWidthCards(
    windowSize.width,
    windowSize.height,
  );

  const handleDragOverCell = (
    e: React.DragEvent<HTMLDivElement>,
    _cell: LayoutCell,
  ) => {
    e.preventDefault();
  };

  const handleDropOnCell = (
    e: React.DragEvent<HTMLDivElement>,
    cell: LayoutCell,
  ) => {
    e.preventDefault();

    const raw = e.dataTransfer.getData('application/json');
    if (!raw) return;

    let payload: { fromZoneId: BoardZoneId; fromIndex: number } | null = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    if (!payload) return;

    const { fromZoneId, fromIndex } = payload;
    const toZoneId = cell.zoneId;

    // Dropping back into same zone = keep same position (no-op)
    if (fromZoneId === toZoneId) return;
    if (!mySeat) return;

    const fromOwner = getZoneOwnerFromId(fromZoneId);
    const toOwner = getZoneOwnerFromId(toZoneId);

    // Only allow moves where both zones belong to me
    if (fromOwner !== mySeat || toOwner !== mySeat) return;

    // Don't allow dropping onto deck or rune-deck zones
    if (
      (toZoneId as string) === 'p1Deck' ||
      (toZoneId as string) === 'p2Deck' ||
      (toZoneId as string) === 'p1RuneDeck' ||
      (toZoneId as string) === 'p2RuneDeck'
    ) {
      return;
    }

    if (isDiscardZoneId(toZoneId)) {
      // Discard: zone + list update
      sendCardToDiscard(fromZoneId, fromIndex, toZoneId);
      return;
    }

    // For single-card slots, only allow drop if empty (EXCEPT discard, already handled)
    const existingInTarget = zoneCards[toZoneId] ?? [];

    if (cell.kind === 'card' && existingInTarget.length > 0) {
      return;
    }

    moveCardBetweenZones(fromZoneId, fromIndex, toZoneId);
  };

  const handleSendToDiscardFromCard = (
    zoneId: BoardZoneId,
    index: number,
  ) => {
    const owner = getZoneOwnerFromId(zoneId);
    if (!owner) return;

    const discardZoneId: BoardZoneId =
      owner === 'p1' ? 'p1Discard' : 'p2Discard';

    sendCardToDiscard(zoneId, index, discardZoneId);
  };

  const handleSendToBottomFromCard = (
    zoneId: BoardZoneId,
    index: number,
  ) => {
    const owner = getZoneOwnerFromId(zoneId);
    if (!owner) return;

    const deckZoneId: BoardZoneId = owner === 'p1' ? 'p1Deck' : 'p2Deck';

    sendCardToBottomOfDeck(zoneId, index, deckZoneId);
  };

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
            'relative flex items-center justify-center rounded-xl border border-amber-500/40 ' +
            (cell.kind === 'rectWide' ? 'overflow-hidden' : 'overflow-visible');

          const paddingClass =
            cell.kind === 'card' ? 'p-0' : 'px-3';

          const kindClass =
            cell.kind === 'card'
              ? 'rb-zone-card-slot-inner bg-slate-900/60'
              : 'rb-zone-rect bg-slate-900/40';

          const cardsInZone = zoneCards[cell.zoneId] ?? [];
          const zoneOwner = getZoneOwnerFromId(cell.zoneId);
          const canInteract =
            mySeat !== null && zoneOwner !== null && mySeat === zoneOwner;

          const discardZone = isDiscardZoneId(cell.zoneId);
          const isHandZone =
            (cell.zoneId as string) === 'p1Hand' ||
            (cell.zoneId as string) === 'p2Hand';

          // Show real cards for:
          //  - any non-hand rect zone
          //  - hand zones only if it's *my* hand
          const showRealCardsInRectZone =
            !isHandZone || (mySeat !== null && zoneOwner === mySeat);

          let innerContent: ReactNode = null;

          // Rune piles (P1 / P2)
          if (
            (cell.zoneId as string) === 'p1RuneDeck' ||
            (cell.zoneId as string) === 'p2RuneDeck'
          ) {
            const count =
              (cell.zoneId as string) === 'p1RuneDeck'
                ? pileCounts.p1Rune
                : pileCounts.p2Rune;

            if (count > 0) {
              innerContent = (
                <div className="rb-pile-inner">
                  <img
                    src={runeBackImg}
                    alt="Rune pile"
                    className="rb-pile-image"
                  />
                  <span className="rb-pile-count">{count}</span>
                </div>
              );
            }
          }
          // Main deck piles (P1 / P2) – clickable to draw
          else if (
            (cell.zoneId as string) === 'p1Deck' ||
            (cell.zoneId as string) === 'p2Deck'
          ) {
            const isP1 = (cell.zoneId as string) === 'p1Deck';
            const count = isP1 ? pileCounts.p1Deck : pileCounts.p2Deck;
            const deckOwner: PlayerSeat = isP1 ? 'p1' : 'p2';
            const canDraw =
              mySeat !== null && mySeat === deckOwner && count > 0;

            if (count > 0) {
              innerContent = (
                <div
                  className={`rb-pile-inner ${
                    canDraw ? 'cursor-pointer' : 'cursor-default'
                  }`}
                  onClick={
                    canDraw ? () => drawFromDeck(deckOwner) : undefined
                  }
                >
                  <img
                    src={cardBackImg}
                    alt="Deck pile"
                    className="rb-pile-image"
                  />
                  <span className="rb-pile-count">{count}</span>
                </div>
              );
            }
          }
          // Discard piles (P1 / P2) – top card face-up + count overlay
          else if (discardZone) {
            const discardCards = cardsInZone;
            const count = discardCards.length;

            if (count > 0) {
              const topCard = discardCards[discardCards.length - 1].card;
              innerContent = (
                <div className="rb-pile-inner">
                  <img
                    src={topCard.images.small}
                    alt={topCard.name}
                    className="rb-pile-image"
                  />
                  <span className="rb-pile-count">{count}</span>
                </div>
              );
            }
          }
          // Zones containing direct cards (legend/champion/hand/battlefields/base/runeChannel/etc.)
          else if (cardsInZone.length > 0) {
            if (cell.kind === 'card') {
              // Single-card zone (legend, champion, etc.)
              const zoneCard = cardsInZone[0];

              innerContent = (
                <CardInteraction
                  card={zoneCard.card}
                  canInteract={canInteract}
                  lobbyId={lobbyId}
                  zoneId={cell.zoneId}
                  indexInZone={0}
                  onSendToDiscard={handleSendToDiscardFromCard}
                  onSendToBottomOfDeck={handleSendToBottomFromCard}
                />
              );
            } else {
              // Rect zones (hand, base, rune channel, battle lanes) – all fan with overlap
              const count = cardsInZone.length;

              let overlapPx = 0;
              if (count > maxFullWidthCards) {
                const overflow = count - maxFullWidthCards;
                // Increase overlap only every 4 cards past the threshold.
                // First overlap (~16px) is same as before, then grows slowly.
                const stepIndex = Math.floor((overflow - 1) / 4); // 0 for 1..4 extra, 1 for 5..8, etc.
                const raw = 16 + stepIndex * 6;
                overlapPx = -Math.min(80, raw);
              }

              innerContent = (
                <div className="flex h-full w-full items-center justify-center">
                  <div className="flex h-full items-center justify-center">
                    {cardsInZone.map((zc, idx) => {
                      const marginLeft =
                        idx === 0 || count <= 1 ? 0 : overlapPx;

                      // If this is an opponent hand, show only card backs
                      if (isHandZone && !showRealCardsInRectZone) {
                        return (
                          <div
                            key={`${cell.zoneId}-${idx}-${zc.card.id}`}
                            className="rb-zone-card-slot-inner"
                            style={{ marginLeft }}
                          >
                            <img
                              src={cardBackImg}
                              alt="Opponent hand card"
                              className="rb-pile-image"
                              draggable={false}
                            />
                          </div>
                        );
                      }

                      // Normal rect zone (or my own hand): show real cards
                      return (
                        <div
                          key={`${cell.zoneId}-${idx}-${zc.card.id}`}
                          className="rb-zone-card-slot-inner"
                          style={{ marginLeft }}
                        >
                          <CardInteraction
                            card={zc.card}
                            canInteract={canInteract}
                            lobbyId={lobbyId}
                            zoneId={cell.zoneId}
                            indexInZone={idx}
                            onSendToDiscard={handleSendToDiscardFromCard}
                            onSendToBottomOfDeck={handleSendToBottomFromCard}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }
          }

          return (
            <div
              key={cell.id}
              style={style}
              className={`${base} ${kindClass} ${paddingClass}`}
              data-zone-id={cell.zoneId}
              onDragOver={(e) => handleDragOverCell(e, cell)}
              onDrop={(e) => handleDropOnCell(e, cell)}
            >
              {cell.debugLabel && (
                <span className="rb-zone-label pointer-events-none absolute left-1 top-1 text-slate-400">
                  {cell.debugLabel}
                </span>
              )}

              {innerContent}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default MatchGamePage;
