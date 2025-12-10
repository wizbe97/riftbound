import React, {
  useState,
  useEffect,
  useRef,
} from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import '../styles/gameplay.css';
import type { BoardZoneId } from '../game/boardConfig';
import {
  useMatchGameState,
  type ZoneCardMap,
  type PlayerSeat,
  type ZoneCard,
} from '../game/useMatchGameState';
import { MatchDeckSelectOverlay } from './MatchDeckSelectPage';
import runeBackImg from '../assets/rune-back.png';
import cardBackImg from '../assets/back-of-card.jpg';
import { CardInteraction } from '../components/CardInteraction';
import type { RiftboundCard } from '../data/riftboundCards';

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
    moveCardFromDiscardToBottomOfDeck,
    moveCardFromDiscardToHand,
    drawFromDeck,
    drawRuneFromPile,
    p1Score,
    p2Score,
    incrementScore,
    decrementScore,
    p1MainDeckCards,
    p2MainDeckCards,
    shuffleMainDeck,
    shuffleRuneDeck,
    p1Reveals,
    p2Reveals,
    syncRevealsForSeat,
    clearRevealsForSeat,
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

  const mySeatFromLobby: PlayerSeat | null =
    lobby.p1?.uid === user.uid
      ? 'p1'
      : lobby.p2?.uid === user.uid
      ? 'p2'
      : null;

  const bottomPlayer: 'p1' | 'p2' = mySeatFromLobby ?? 'p1';
  const topPlayer: 'p1' | 'p2' = bottomPlayer === 'p1' ? 'p2' : 'p1';

  const bottomZones = makeSideZones(bottomPlayer);
  const topZones = makeSideZones(topPlayer);

  const layoutCells: LayoutCell[] = [
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

  const p1Name = lobby.p1?.username ?? 'Player 1';
  const p2Name = lobby.p2?.username ?? 'Player 2';

  // Map seat scores to top/bottom for this client
  const topScore = topPlayer === 'p1' ? p1Score : p2Score;
  const bottomScore = bottomPlayer === 'p1' ? p1Score : p2Score;

  const canEditTopScore = mySeat === topPlayer;
  const canEditBottomScore = mySeat === bottomPlayer;

  const incrementMyScore = () => {
    if (!mySeat) return;
    incrementScore(mySeat);
  };

  const decrementMyScore = () => {
    if (!mySeat) return;
    decrementScore(mySeat);
  };

  const opponentRevealedCards: RiftboundCard[] =
    mySeat === 'p1'
      ? p2Reveals
      : mySeat === 'p2'
      ? p1Reveals
      : [];

  return (
    <>
      <section className="rb-game-root flex flex-col">
        <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950/90 px-4 py-2">
          <div className="text-sm font-semibold text-amber-200">
            Riftbound — Match Layout
          </div>
          <div className="text-xs text-slate-400">
            {p1Name} vs {p2Name}
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
                p1Name={p1Name}
                p2Name={p2Name}
                moveCardBetweenZones={moveCardBetweenZones}
                sendCardToDiscard={sendCardToDiscard}
                sendCardToBottomOfDeck={sendCardToBottomOfDeck}
                moveCardFromDiscardToBottomOfDeck={
                  moveCardFromDiscardToBottomOfDeck
                }
                moveCardFromDiscardToHand={moveCardFromDiscardToHand}
                drawFromDeck={drawFromDeck}
                drawRuneFromPile={drawRuneFromPile}
                topScore={topScore}
                bottomScore={bottomScore}
                incrementMyScore={incrementMyScore}
                decrementMyScore={decrementMyScore}
                canEditTopScore={canEditTopScore}
                canEditBottomScore={canEditBottomScore}
                p1MainDeckCards={p1MainDeckCards}
                p2MainDeckCards={p2MainDeckCards}
                shuffleMainDeck={shuffleMainDeck}
                shuffleRuneDeck={shuffleRuneDeck}
                syncRevealsForSeat={syncRevealsForSeat}
                clearRevealsForSeat={clearRevealsForSeat}
                opponentRevealedCards={opponentRevealedCards}
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

type GameBoardLayoutProps = {
  layoutCells: LayoutCell[];
  zoneCards: ZoneCardMap;
  mySeat: PlayerSeat | null;
  pileCounts: PileCounts;
  lobbyId: string;
  p1Name: string;
  p2Name: string;
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
  moveCardFromDiscardToBottomOfDeck: (
    discardZoneId: BoardZoneId,
    index: number,
  ) => void;
  moveCardFromDiscardToHand: (
    discardZoneId: BoardZoneId,
    index: number,
  ) => void;
  drawFromDeck: (seat: PlayerSeat) => void;
  drawRuneFromPile: (seat: PlayerSeat) => void;
  topScore: number;
  bottomScore: number;
  incrementMyScore: () => void;
  decrementMyScore: () => void;
  canEditTopScore: boolean;
  canEditBottomScore: boolean;
  p1MainDeckCards: RiftboundCard[];
  p2MainDeckCards: RiftboundCard[];
  shuffleMainDeck: (seat: PlayerSeat) => void;
  shuffleRuneDeck: (seat: PlayerSeat) => void;
  syncRevealsForSeat: (seat: PlayerSeat, count: number) => void;
  clearRevealsForSeat: (seat: PlayerSeat) => void;
  opponentRevealedCards: RiftboundCard[];
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

function getMaxFullWidthCards(width: number, height: number): number {
  if (!width || !height) return 5;
  if (width >= 2560) return 10;
  if (width >= 1960 && height >= 1080) return 8;
  return 5;
}

type DiscardMenuState = {
  visible: boolean;
  x: number;
  y: number;
  zoneId: BoardZoneId | null;
  ownerSeat: PlayerSeat | null;
  ownerName: string;
};

type DiscardModalState = {
  open: boolean;
  zoneId: BoardZoneId | null;
  ownerSeat: PlayerSeat | null;
  ownerName: string;
};

type DeckMenuState = {
  visible: boolean;
  x: number;
  y: number;
  zoneId: BoardZoneId | null;
  ownerSeat: PlayerSeat | null;
  ownerName: string;
  isRuneDeck: boolean;
};

type DeckManageModalState = {
  open: boolean;
  ownerSeat: PlayerSeat | null;
  ownerName: string;
};

function GameBoardLayout({
  layoutCells,
  zoneCards,
  mySeat,
  pileCounts,
  lobbyId,
  p1Name,
  p2Name,
  moveCardBetweenZones,
  sendCardToDiscard,
  sendCardToBottomOfDeck,
  moveCardFromDiscardToBottomOfDeck,
  moveCardFromDiscardToHand,
  drawFromDeck,
  drawRuneFromPile,
  topScore,
  bottomScore,
  incrementMyScore,
  decrementMyScore,
  canEditTopScore,
  canEditBottomScore,
  p1MainDeckCards,
  p2MainDeckCards,
  shuffleMainDeck,
  shuffleRuneDeck,
  syncRevealsForSeat,
  clearRevealsForSeat,
  opponentRevealedCards,
}: GameBoardLayoutProps) {
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });

  const [discardMenu, setDiscardMenu] = useState<DiscardMenuState>({
    visible: false,
    x: 0,
    y: 0,
    zoneId: null,
    ownerSeat: null,
    ownerName: '',
  });

  const [discardModal, setDiscardModal] = useState<DiscardModalState>({
    open: false,
    zoneId: null,
    ownerSeat: null,
    ownerName: '',
  });

  const [deckMenu, setDeckMenu] = useState<DeckMenuState>({
    visible: false,
    x: 0,
    y: 0,
    zoneId: null,
    ownerSeat: null,
    ownerName: '',
    isRuneDeck: false,
  });

  const [deckManageModal, setDeckManageModal] =
    useState<DeckManageModalState>({
      open: false,
      ownerSeat: null,
      ownerName: '',
    });

  const [topScoreFlash, setTopScoreFlash] = useState(false);
  const [bottomScoreFlash, setBottomScoreFlash] = useState(false);

  const discardMenuRef = useRef<HTMLDivElement | null>(null);
  const deckMenuRef = useRef<HTMLDivElement | null>(null);

  // Close discard cell menu
  useEffect(() => {
    if (!discardMenu.visible) return;

    const handleDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (discardMenuRef.current?.contains(target)) return;

      setDiscardMenu((prev) => ({ ...prev, visible: false }));
    };

    document.addEventListener('mousedown', handleDocMouseDown);
    return () => document.removeEventListener('mousedown', handleDocMouseDown);
  }, [discardMenu.visible]);

  // Close deck cell menu
  useEffect(() => {
    if (!deckMenu.visible) return;

    const handleDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (deckMenuRef.current?.contains(target)) return;

      setDeckMenu((prev) => ({ ...prev, visible: false }));
    };

    document.addEventListener('mousedown', handleDocMouseDown);
    return () => document.removeEventListener('mousedown', handleDocMouseDown);
  }, [deckMenu.visible]);

  // Window size for hand / rune fan overlap logic
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

  // Score flash when value changes
  useEffect(() => {
    setTopScoreFlash(true);
    const t = setTimeout(() => setTopScoreFlash(false), 250);
    return () => clearTimeout(t);
  }, [topScore]);

  useEffect(() => {
    setBottomScoreFlash(true);
    const t = setTimeout(() => setBottomScoreFlash(false), 250);
    return () => clearTimeout(t);
  }, [bottomScore]);

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

    let payload: { fromZoneId: BoardZoneId; fromIndex: number } | null =
      null;

    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    if (!payload) return;

    const { fromZoneId, fromIndex } = payload;
    const toZoneId = cell.zoneId;
    if (fromZoneId === toZoneId) return;
    if (!mySeat) return;

    const fromOwner = getZoneOwnerFromId(fromZoneId);
    const toOwner = getZoneOwnerFromId(toZoneId);

    if (fromOwner !== mySeat || toOwner !== mySeat) return;

    // Legend zone is immutable
    if (
      (fromZoneId as string) === 'p1LegendZone' ||
      (fromZoneId as string) === 'p2LegendZone'
    ) {
      return;
    }

    // Can't drag into decks / rune piles
    if (
      (toZoneId as string) === 'p1Deck' ||
      (toZoneId as string) === 'p2Deck' ||
      (toZoneId as string) === 'p1RuneDeck' ||
      (toZoneId as string) === 'p2RuneDeck'
    ) {
      return;
    }

    if (isDiscardZoneId(toZoneId)) {
      sendCardToDiscard(fromZoneId, fromIndex, toZoneId);
      return;
    }

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
    const deckZoneId: BoardZoneId =
      owner === 'p1' ? 'p1Deck' : 'p2Deck';
    sendCardToBottomOfDeck(zoneId, index, deckZoneId);
  };

  const handleSendRuneToBottomFromCard = (
    zoneId: BoardZoneId,
    index: number,
  ) => {
    const owner = getZoneOwnerFromId(zoneId);
    if (!owner) return;
    const runeDeckZoneId: BoardZoneId =
      owner === 'p1' ? 'p1RuneDeck' : 'p2RuneDeck';
    sendCardToBottomOfDeck(zoneId, index, runeDeckZoneId);
  };

  const openDiscardMenu = (
    clientX: number,
    clientY: number,
    cell: LayoutCell,
    zoneOwner: PlayerSeat | null,
  ) => {
    if (!zoneOwner) return;

    const ownerName = zoneOwner === 'p1' ? p1Name : p2Name;

    setDiscardMenu({
      visible: true,
      x: clientX,
      y: clientY,
      zoneId: cell.zoneId,
      ownerSeat: zoneOwner,
      ownerName:
        ownerName || (zoneOwner === 'p1' ? 'Player 1' : 'Player 2'),
    });
  };

  const handleDiscardCellContextMenu = (
    e: React.MouseEvent<HTMLDivElement>,
    cell: LayoutCell,
    zoneOwner: PlayerSeat | null,
  ) => {
    e.preventDefault();
    openDiscardMenu(e.clientX, e.clientY, cell, zoneOwner);
  };

  const handleDiscardCellClick = (
    e: React.MouseEvent<HTMLDivElement>,
    cell: LayoutCell,
    zoneOwner: PlayerSeat | null,
  ) => {
    e.preventDefault();
    openDiscardMenu(e.clientX, e.clientY, cell, zoneOwner);
  };

  const openDiscardModalFromMenu = () => {
    if (!discardMenu.zoneId) return;
    setDiscardModal({
      open: true,
      zoneId: discardMenu.zoneId,
      ownerSeat: discardMenu.ownerSeat,
      ownerName: discardMenu.ownerName,
    });
    setDiscardMenu((prev) => ({ ...prev, visible: false }));
  };

  const closeDiscardModal = () => {
    setDiscardModal({
      open: false,
      zoneId: null,
      ownerSeat: null,
      ownerName: '',
    });
  };

  const openDeckMenu = (
    clientX: number,
    clientY: number,
    cell: LayoutCell,
    zoneOwner: PlayerSeat | null,
    isRuneDeck: boolean,
  ) => {
    if (!zoneOwner) return;
    if (!mySeat || mySeat !== zoneOwner) return;

    const ownerName = zoneOwner === 'p1' ? p1Name : p2Name;

    setDeckMenu({
      visible: true,
      x: clientX,
      y: clientY,
      zoneId: cell.zoneId,
      ownerSeat: zoneOwner,
      ownerName:
        ownerName || (zoneOwner === 'p1' ? 'Player 1' : 'Player 2'),
      isRuneDeck,
    });
  };

  const handleDeckCellContextMenu = (
    e: React.MouseEvent<HTMLDivElement>,
    cell: LayoutCell,
    zoneOwner: PlayerSeat | null,
    isRuneDeck: boolean,
  ) => {
    e.preventDefault();
    openDeckMenu(e.clientX, e.clientY, cell, zoneOwner, isRuneDeck);
  };

  const handleDeckMenuShuffle = () => {
    if (!deckMenu.ownerSeat) return;
    if (deckMenu.isRuneDeck) {
      shuffleRuneDeck(deckMenu.ownerSeat);
    } else {
      shuffleMainDeck(deckMenu.ownerSeat);
    }
    setDeckMenu((prev) => ({ ...prev, visible: false }));
  };

  const openDeckManageModalFromMenu = () => {
    if (!deckMenu.ownerSeat || deckMenu.isRuneDeck) return;
    setDeckManageModal({
      open: true,
      ownerSeat: deckMenu.ownerSeat,
      ownerName: deckMenu.ownerName,
    });
    setDeckMenu((prev) => ({ ...prev, visible: false }));
  };

  const closeDeckManageModal = () => {
    setDeckManageModal({
      open: false,
      ownerSeat: null,
      ownerName: '',
    });
  };

  const handleDeckManageClose = () => {
    if (deckManageModal.ownerSeat) {
      clearRevealsForSeat(deckManageModal.ownerSeat);
    }
    closeDeckManageModal();
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
          const canInteractBase =
            mySeat !== null && zoneOwner !== null && mySeat === zoneOwner;

          const discardZone = isDiscardZoneId(cell.zoneId);

          const zoneIdStr = cell.zoneId as string;
          const isHandZone =
            zoneIdStr === 'p1Hand' || zoneIdStr === 'p2Hand';
          const isRuneChannelZone =
            zoneIdStr === 'p1RuneChannel' ||
            zoneIdStr === 'p2RuneChannel';
          const isLegendZone =
            zoneIdStr === 'p1LegendZone' ||
            zoneIdStr === 'p2LegendZone';

          const isRuneDeckZone =
            zoneIdStr === 'p1RuneDeck' || zoneIdStr === 'p2RuneDeck';
          const isMainDeckZone =
            zoneIdStr === 'p1Deck' || zoneIdStr === 'p2Deck';

          const showRealCardsInRectZone =
            !isHandZone ||
            (mySeat !== null && zoneOwner === mySeat);

          let innerContent: ReactNode = null;

          // Rune piles
          if (isRuneDeckZone) {
            const isP1Rune = zoneIdStr === 'p1RuneDeck';
            const count = isP1Rune
              ? pileCounts.p1Rune
              : pileCounts.p2Rune;
            const ownerSeat: PlayerSeat = isP1Rune ? 'p1' : 'p2';
            const canDraw =
              mySeat !== null && mySeat === ownerSeat && count > 0;

            if (count > 0) {
              innerContent = (
                <div
                  className={`rb-pile-inner ${
                    canDraw ? 'cursor-pointer' : 'cursor-default'
                  }`}
                  onClick={
                    canDraw ? () => drawRuneFromPile(ownerSeat) : undefined
                  }
                >
                  <img
                    src={runeBackImg}
                    alt="Rune pile"
                    className="rb-pile-image"
                  />
                  <span className="rb-pile-count">{count}</span>
                </div>
              );
            }
          } else if (zoneIdStr === 'p1Deck' || zoneIdStr === 'p2Deck') {
            const isP1 = zoneIdStr === 'p1Deck';
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
          } else if (discardZone) {
            const discardCards = cardsInZone;
            const count = discardCards.length;

            if (count > 0) {
              const topIndex = discardCards.length - 1;
              const topZc = discardCards[topIndex];

              if (mySeat && zoneOwner && mySeat === zoneOwner) {
                // Our discard: top card is draggable with preview,
                // no rotation, no card menu
                innerContent = (
                  <div className="rb-pile-inner cursor-pointer">
                    <CardInteraction
                      card={topZc.card}
                      canInteract
                      lobbyId={lobbyId}
                      zoneId={cell.zoneId}
                      indexInZone={topIndex}
                      onSendToDiscard={undefined}
                      onSendToBottomOfDeck={handleSendToBottomFromCard}
                      mode="discard-top"
                      disableRotate
                      disableContextMenu
                    />
                    <span className="rb-pile-count">{count}</span>
                  </div>
                );
              } else {
                // Opponent discard: show face-up top card
                innerContent = (
                  <div className="rb-pile-inner cursor-pointer">
                    <img
                      src={topZc.card.images.small}
                      alt={topZc.card.name}
                      className="rb-pile-image"
                    />
                    <span className="rb-pile-count">{count}</span>
                  </div>
                );
              }
            } else {
              innerContent = (
                <div className="rb-pile-inner cursor-pointer">
                  <span className="rb-pile-count text-xs text-slate-400">
                    0
                  </span>
                </div>
              );
            }
          } else if (cardsInZone.length > 0) {
            if (cell.kind === 'card') {
              const zoneCard = cardsInZone[0];
              const canInteract = canInteractBase && !isLegendZone; // legend immutable

              innerContent = (
                <CardInteraction
                  card={zoneCard.card}
                  canInteract={canInteract}
                  lobbyId={lobbyId}
                  zoneId={cell.zoneId}
                  indexInZone={0}
                  onSendToDiscard={
                    discardZone || isLegendZone
                      ? undefined
                      : handleSendToDiscardFromCard
                  }
                  onSendToBottomOfDeck={
                    isLegendZone ? undefined : handleSendToBottomFromCard
                  }
                  disableRotate={isLegendZone}
                />
              );
            } else {
              const count = cardsInZone.length;

              // Base overlap for non-rune zones
              let overlapPx = 0;
              if (count > maxFullWidthCards) {
                const overflow = count - maxFullWidthCards;
                const stepIndex = Math.floor((overflow - 1) / 4);
                const raw = 16 + stepIndex * 6;
                overlapPx = -Math.min(80, raw);
              }

              innerContent = (
                <div className="flex h-full w-full items-center justify-center">
                  <div className="flex h-full items-center justify-center">
                    {cardsInZone.map((zc, idx) => {
                      const isRuneCardInChannel = isRuneChannelZone;

                      let marginLeft = 0;
                      if (idx !== 0 && count > 1) {
                        if (isRuneCardInChannel) {
                          const isBigScreen =
                            windowSize.width >= 1960 &&
                            windowSize.height >= 1080;
                          const runeThreshold = isBigScreen ? 10 : 8;
                          const baseSpacing = 4; // tighter spacing for small rune counts

                          if (count <= runeThreshold) {
                            marginLeft = baseSpacing;
                          } else {
                            // Gradually reduce spacing (and eventually overlap)
                            const maxNegative = -40;
                            const steps = Math.max(
                              1,
                              12 - runeThreshold,
                            );
                            const t =
                              (count - runeThreshold) / steps; // 0..1
                            const spacing =
                              baseSpacing +
                              t * (maxNegative - baseSpacing);
                            marginLeft = spacing;
                          }
                        } else {
                          marginLeft = overlapPx;
                        }
                      }

                      const canInteract =
                        canInteractBase && !isLegendZone;

                      // Hand: hide opponent cards
                      if (
                        isHandZone &&
                        !showRealCardsInRectZone
                      ) {
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

                      return (
                        <div
                          key={`${cell.zoneId}-${idx}-${zc.card.id}`}
                          className="rb-zone-card-slot-inner"
                          style={{
                            marginLeft,
                            // Left-most card should be on top when fanning
                            zIndex: 10 + (count - idx),
                          }}
                        >
                          <div className="relative h-full w-full">
                            <CardInteraction
                              card={zc.card}
                              canInteract={canInteract}
                              lobbyId={lobbyId}
                              zoneId={cell.zoneId}
                              indexInZone={idx}
                              onSendToDiscard={
                                isRuneCardInChannel
                                  ? undefined
                                  : handleSendToDiscardFromCard
                              }
                              onSendToBottomOfDeck={
                                isRuneCardInChannel
                                  ? handleSendRuneToBottomFromCard
                                  : handleSendToBottomFromCard
                              }
                              mode={
                                isRuneCardInChannel
                                  ? 'rune'
                                  : 'default'
                              }
                              overlay={
                                isRuneCardInChannel && canInteract ? (
                                  <button
                                    type="button"
                                    className="absolute left-1 top-1 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-slate-600 bg-slate-950/90 text-[11px] text-slate-100 shadow hover:border-amber-400 hover:text-amber-200"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSendRuneToBottomFromCard(
                                        cell.zoneId,
                                        idx,
                                      );
                                    }}
                                  >
                                    ↻
                                  </button>
                                ) : undefined
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }
          }

          const isDiscardCell = discardZone;

          const onContextMenu = (
            e: React.MouseEvent<HTMLDivElement>,
          ) => {
            if (isDiscardCell) {
              handleDiscardCellContextMenu(e, cell, zoneOwner);
              return;
            }

            const idStr = cell.zoneId as string;
            const isRuneDeckCell =
              idStr === 'p1RuneDeck' || idStr === 'p2RuneDeck';
            const isMainDeckCell =
              idStr === 'p1Deck' || idStr === 'p2Deck';

            if (
              (isRuneDeckCell || isMainDeckCell) &&
              zoneOwner &&
              mySeat &&
              mySeat === zoneOwner
            ) {
              handleDeckCellContextMenu(
                e,
                cell,
                zoneOwner,
                isRuneDeckCell,
              );
            }
          };

          return (
            <div
              key={cell.id}
              style={style}
              className={`${base} ${kindClass} ${paddingClass} ${
                isDiscardCell ? 'cursor-pointer' : ''
              }`}
              data-zone-id={cell.zoneId}
              onDragOver={(e) => handleDragOverCell(e, cell)}
              onDrop={(e) => handleDropOnCell(e, cell)}
              onContextMenu={onContextMenu}
              onClick={(e) =>
                isDiscardCell
                  ? handleDiscardCellClick(e, cell, zoneOwner)
                  : undefined
              }
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

        {/* TOP SCORE (row 1, next to opponent hand) */}
        <div
          style={{
            gridRow: 1,
            gridColumn: '5 / span 2',
            marginTop: getRowMarginTop(1),
            marginLeft: 0,
            marginRight: 0,
            marginBottom: 0,
          }}
          className="rb-zone-rect relative flex flex-col items-center justify-center rounded-xl border border-amber-500/40 bg-slate-900/40 p-0"
        >
          <div className="flex flex-col items-center justify-center gap-1">
            <div className="flex items-center justify-center gap-2 text-xs text-slate-100">
              {canEditTopScore && (
                <button
                  type="button"
                  onClick={incrementMyScore}
                  className="h-6 w-6 rounded-full border border-slate-600 bg-slate-950 text-[10px] leading-none hover:border-amber-400 hover:text-amber-200"
                >
                  ▲
                </button>
              )}
              <span
                className={`rb-score-value min-w-[1.5rem] text-center ${
                  topScoreFlash ? 'text-red-400' : 'text-slate-50'
                }`}
              >
                {topScore}
              </span>
              {canEditTopScore && (
                <button
                  type="button"
                  onClick={decrementMyScore}
                  className="h-6 w-6 rounded-full border border-slate-600 bg-slate-950 text-[10px] leading-none hover:border-amber-400 hover:text-amber-200"
                >
                  ▼
                </button>
              )}
            </div>
            <div className="mt-1 text-[10px] tracking-wide text-slate-400">
              SCORE
            </div>
          </div>
        </div>

        {/* BOTTOM SCORE (row 6, next to our hand) */}
        <div
          style={{
            gridRow: 6,
            gridColumn: '1 / span 2',
            marginTop: getRowMarginTop(6),
            marginLeft: 0,
            marginRight: 0,
            marginBottom: 0,
          }}
          className="rb-zone-rect relative flex flex-col items-center justify-center rounded-xl border border-amber-500/40 bg-slate-900/40 p-0"
        >
          <div className="flex flex-col items-center justify-center gap-1">
            <div className="flex items-center justify-center gap-2 text-xs text-slate-100">
              {canEditBottomScore && (
                <button
                  type="button"
                  onClick={incrementMyScore}
                  className="h-6 w-6 rounded-full border border-slate-600 bg-slate-950 text-[10px] leading-none hover:border-amber-400 hover:text-amber-200"
                >
                  ▲
                </button>
              )}
              <span
                className={`rb-score-value min-w-[1.5rem] text-center ${
                  bottomScoreFlash ? 'text-red-400' : 'text-slate-50'
                }`}
              >
                {bottomScore}
              </span>
              {canEditBottomScore && (
                <button
                  type="button"
                  onClick={decrementMyScore}
                  className="h-6 w-6 rounded-full border border-slate-600 bg-slate-950 text-[10px] leading-none hover:border-amber-400 hover:text-amber-200"
                >
                  ▼
                </button>
              )}
            </div>
            <div className="mt-1 text-[10px] tracking-wide text-slate-400">
              SCORE
            </div>
          </div>
        </div>
      </div>

      {/* Discard cell context menu */}
      {discardMenu.visible && discardMenu.zoneId && (
        <div
          ref={discardMenuRef}
          className="fixed z-[160] rounded-md border border-slate-600 bg-slate-900/95 px-2 py-1 text-xs text-slate-100 shadow-lg"
          style={{ top: discardMenu.y, left: discardMenu.x }}
        >
          <button
            type="button"
            className="block w-full cursor-pointer rounded px-2 py-1 text-left hover:bg-slate-700"
            onClick={openDiscardModalFromMenu}
          >
            View discard pile
          </button>
        </div>
      )}

      {/* Main deck / rune deck context menu */}
      {deckMenu.visible && deckMenu.zoneId && (
        <div
          ref={deckMenuRef}
          className="fixed z-[170] rounded-md border border-slate-600 bg-slate-900/95 px-2 py-1 text-xs text-slate-100 shadow-lg"
          style={{ top: deckMenu.y, left: deckMenu.x }}
        >
          <button
            type="button"
            className="block w-full cursor-pointer rounded px-2 py-1 text-left hover:bg-slate-700"
            onClick={handleDeckMenuShuffle}
          >
            {deckMenu.isRuneDeck ? 'Shuffle runes' : 'Shuffle deck'}
          </button>

          {!deckMenu.isRuneDeck && (
            <button
              type="button"
              className="mt-0.5 block w-full cursor-pointer rounded px-2 py-1 text-left hover:bg-slate-700"
              onClick={openDeckManageModalFromMenu}
            >
              Manage cards
            </button>
          )}
        </div>
      )}

      {/* Discard pile modal */}
      {discardModal.open && discardModal.zoneId && (
        <DiscardPileModal
          isOpen={discardModal.open}
          onClose={closeDiscardModal}
          cards={zoneCards[discardModal.zoneId] ?? []}
          ownerSeat={discardModal.ownerSeat}
          ownerName={discardModal.ownerName}
          mySeat={mySeat}
          discardZoneId={discardModal.zoneId}
          lobbyId={lobbyId}
          moveCardFromDiscardToBottomOfDeck={
            moveCardFromDiscardToBottomOfDeck
          }
          moveCardFromDiscardToHand={moveCardFromDiscardToHand}
        />
      )}

      {/* Deck manage modal (for main deck) */}
      {deckManageModal.open && deckManageModal.ownerSeat && (
        <DeckManageModal
          isOpen={deckManageModal.open}
          onClose={handleDeckManageClose}
          ownerSeat={deckManageModal.ownerSeat}
          ownerName={deckManageModal.ownerName}
          mySeat={mySeat}
          cards={
            deckManageModal.ownerSeat === 'p1'
              ? p1MainDeckCards
              : p2MainDeckCards
          }
          lobbyId={lobbyId}
          onShuffle={() =>
            shuffleMainDeck(deckManageModal.ownerSeat as PlayerSeat)
          }
          onRevealTopCount={(count, revealToOpponent) => {
            if (
              revealToOpponent &&
              deckManageModal.ownerSeat
            ) {
              syncRevealsForSeat(
                deckManageModal.ownerSeat as PlayerSeat,
                count,
              );
            }
          }}
        />
      )}

      {/* Opponent reveal window */}
      <OpponentRevealWindow cards={opponentRevealedCards} />
    </div>
  );
}

type DiscardPileModalProps = {
  isOpen: boolean;
  onClose: () => void;
  cards: ZoneCard[];
  ownerSeat: PlayerSeat | null;
  ownerName: string;
  mySeat: PlayerSeat | null;
  discardZoneId: BoardZoneId;
  lobbyId: string;
  moveCardFromDiscardToBottomOfDeck: (
    discardZoneId: BoardZoneId,
    index: number,
  ) => void;
  moveCardFromDiscardToHand: (
    discardZoneId: BoardZoneId,
    index: number,
  ) => void;
};

function DiscardPileModal({
  isOpen,
  onClose,
  cards,
  ownerSeat,
  ownerName,
  mySeat,
  discardZoneId,
  lobbyId,
  moveCardFromDiscardToBottomOfDeck,
  moveCardFromDiscardToHand,
}: DiscardPileModalProps) {
  if (!isOpen) return null;

  const canEdit =
    mySeat !== null && ownerSeat !== null && mySeat === ownerSeat;

  return (
    <div
      className="fixed inset-0 z-[180] flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="relative max-h-[80vh] w-full max-w-md rounded-xl border border-amber-500/60 bg-slate-950/95 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-amber-200">
            Discard Pile — {ownerName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-slate-600 bg-slate-900 text-xs text-slate-200 hover:border-amber-400 hover:text-amber-200"
          >
            ×
          </button>
        </div>

        {cards.length === 0 ? (
          <p className="text-xs text-slate-300">
            No cards in discard pile.
          </p>
        ) : (
          <div className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto pr-1">
            {cards.map((zc, index) => (
              <div
                key={`${zc.card.id}-${index}`}
                className="rb-zone-card-slot-inner cursor-pointer"
              >
                <CardInteraction
                  card={zc.card}
                  canInteract={canEdit}
                  lobbyId={lobbyId}
                  zoneId={discardZoneId}
                  indexInZone={index}
                  mode="discard-modal"
                  disableRotate
                  onSendToBottomOfDeck={() =>
                    moveCardFromDiscardToBottomOfDeck(
                      discardZoneId,
                      index,
                    )
                  }
                  onSendToHandFromDiscard={() =>
                    moveCardFromDiscardToHand(discardZoneId, index)
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type DeckManageModalProps = {
  isOpen: boolean;
  onClose: () => void;
  ownerSeat: PlayerSeat | null;
  ownerName: string;
  mySeat: PlayerSeat | null;
  cards: RiftboundCard[];
  lobbyId: string;
  onShuffle: () => void;
  onRevealTopCount: (count: number, revealToOpponent: boolean) => void;
};

function DeckManageModal({
  isOpen,
  onClose,
  ownerSeat,
  ownerName,
  mySeat,
  cards,
  lobbyId,
  onShuffle,
  onRevealTopCount,
}: DeckManageModalProps) {
  const [showAll, setShowAll] = useState(false);
  const [revealToOpponent, setRevealToOpponent] = useState(false);
  const [revealedCards, setRevealedCards] = useState<RiftboundCard[]>([]);

  useEffect(() => {
    if (!isOpen) {
      setShowAll(false);
      setRevealToOpponent(false);
      setRevealedCards([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const canEdit =
    mySeat !== null && ownerSeat !== null && mySeat === ownerSeat;

  const visibleCards = showAll ? cards : revealedCards;

  const handleRevealClick = () => {
    if (!cards.length) return;
    const nextCount = Math.min(revealedCards.length + 1, cards.length);
    const nextCards = cards.slice(0, nextCount);
    setRevealedCards(nextCards);
    onRevealTopCount(nextCount, revealToOpponent);
  };

  const deckZoneId: BoardZoneId =
    ownerSeat === 'p1' ? 'p1Deck' : 'p2Deck';

  return (
    <div
      className="fixed inset-0 z-[185] flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="relative max-h-[80vh] w-full max-w-xl rounded-xl border border-amber-500/60 bg-slate-950/95 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-amber-200">
            Manage Deck — {ownerName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-slate-600 bg-slate-900 text-xs text-slate-200 hover:border-amber-400 hover:text-amber-200"
          >
            ×
          </button>
        </div>

        {!canEdit && (
          <p className="mb-2 text-[11px] text-slate-400">
            You can only manage your own deck.
          </p>
        )}

        <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-200">
          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              className="h-3 w-3 rounded border-slate-500 bg-slate-900"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              disabled={!canEdit}
            />
            <span>Show all cards</span>
          </label>

          <button
            type="button"
            disabled={!canEdit || cards.length <= 1}
            onClick={onShuffle}
            className="inline-flex items-center justify-center rounded-md border border-amber-500/50 bg-slate-900 px-2 py-1 text-[11px] font-semibold text-amber-200 hover:border-amber-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Shuffle
          </button>

          <button
            type="button"
            disabled={!canEdit || cards.length === 0}
            onClick={handleRevealClick}
            className="inline-flex items-center justify-center rounded-md border border-emerald-500/60 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-300 hover:border-emerald-300 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reveal top card
          </button>

          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              className="h-3 w-3 rounded border-slate-500 bg-slate-900"
              checked={revealToOpponent}
              onChange={(e) =>
                setRevealToOpponent(e.target.checked)
              }
              disabled={!canEdit}
            />
            <span>Reveal to opponent</span>
          </label>
        </div>

        {visibleCards.length === 0 ? (
          <p className="mt-2 text-xs text-slate-300">
            No cards to display yet. Use "Reveal top card", or tick
            "Show all cards".
          </p>
        ) : (
          <div className="mt-2 grid max-h-[60vh] grid-cols-4 gap-2 overflow-y-auto pr-1">
            {visibleCards.map((card, index) => (
              <div
                key={`${card.id}-${index}`}
                className="rb-zone-card-slot-inner cursor-pointer"
              >
                <CardInteraction
                  card={card}
                  canInteract={false}
                  lobbyId={lobbyId}
                  zoneId={deckZoneId}
                  indexInZone={index}
                  disableRotate
                  disableContextMenu
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type OpponentRevealWindowProps = {
  cards: RiftboundCard[];
};

function OpponentRevealWindow({
  cards,
}: OpponentRevealWindowProps) {
  if (!cards.length) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[190] flex items-center justify-center">
      <div className="pointer-events-auto rounded-xl border border-amber-500/60 bg-slate-950/95 px-3 py-2 shadow-2xl">
        <div className="mb-2 text-center text-[11px] text-slate-200">
          Opponent revealed {cards.length} card
          {cards.length > 1 ? 's' : ''}
        </div>
        <div className="flex items-center justify-center gap-2">
          {cards.map((card, idx) => (
            <img
              key={`${card.id}-reveal-${idx}`}
              src={card.images.small}
              alt={card.name}
              className="h-24 w-auto rounded-md border border-amber-500/60 bg-slate-900 object-contain"
              draggable={false}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default MatchGamePage;
