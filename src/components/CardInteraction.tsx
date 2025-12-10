import type React from 'react';
import {
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { RiftboundCard } from '../data/riftboundCards';
import type { BoardZoneId } from '../game/boardConfig';
import cardBackImg from '../assets/back-of-card.jpg';

type CardInteractionProps = {
  card: RiftboundCard;
  canInteract?: boolean;
  lobbyId: string;
  zoneId: BoardZoneId;
  indexInZone?: number;
  onSendToDiscard?: (zoneId: BoardZoneId, indexInZone: number) => void;
  onSendToBottomOfDeck?: (zoneId: BoardZoneId, indexInZone: number) => void;
  onSendToHandFromDiscard?: (
    zoneId: BoardZoneId,
    indexInZone: number,
  ) => void;
  /**
   * default: 'default'
   * - 'discard-modal': context menu is "send to bottom" / "send to hand"
   * - 'discard-top': used for the top card of the discard pile on the board
   * - 'rune': rune in rune channel; only "send to bottom of rune pile"
   */
  mode?: 'default' | 'discard-modal' | 'discard-top' | 'rune';
  /** If true, left-click rotation is disabled entirely */
  disableRotate?: boolean;
  /** If true, card-specific right-click menu is disabled */
  disableContextMenu?: boolean;
  /** Optional overlay rendered inside the rotating wrapper (e.g. rune recycle button) */
  overlay?: React.ReactNode;
  /** Explicit control over whether this card can rotate (defaults to canInteract) */
  canRotate?: boolean;
  /** Whether the current viewer is the owner of the card (for hidden preview logic) */
  isOwnerView?: boolean;
  /** Whether the "Hide / Unhide" option should be shown in the context menu */
  allowHide?: boolean;
};

type PreviewPos = {
  top: number;
  left: number;
};

type ContextMenuState = {
  visible: boolean;
  x: number;
  y: number;
};

export function CardInteraction({
  card,
  canInteract = false,
  lobbyId,
  zoneId,
  indexInZone = 0,
  onSendToDiscard,
  onSendToBottomOfDeck,
  onSendToHandFromDiscard,
  mode = 'default',
  disableRotate = false,
  disableContextMenu = false,
  overlay,
  canRotate,
  isOwnerView = false,
  allowHide = false,
}: CardInteractionProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [previewPos, setPreviewPos] = useState<PreviewPos>({
    top: 0,
    left: 0,
  });
  const [rotation, setRotation] = useState<number>(0);
  const [hidden, setHidden] = useState<boolean>(false);
  const [menu, setMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
  });

  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const isDiscardModal = mode === 'discard-modal';
  const isRuneMode = mode === 'rune';
  const previewEnabled = !isRuneMode; // no hover preview for rune cards
  const contextMenuBaseEnabled = !disableContextMenu;

  const rotationDocId = `${zoneId}-${card.id}-${indexInZone}`;

  // Subscribe to per-card rotation + hidden state
  useEffect(() => {
    if (!lobbyId) return;

    const rotationRef = doc(
      db,
      'lobbies',
      lobbyId,
      'rotations',
      rotationDocId,
    );

    const unsubscribe = onSnapshot(rotationRef, (snap) => {
      if (!snap.exists()) {
        setRotation(0);
        setHidden(false);
        return;
      }
      const data = snap.data() as { rotation?: unknown; hidden?: unknown };

      const rotationValue =
        typeof data.rotation === 'number' && !Number.isNaN(data.rotation)
          ? data.rotation
          : 0;

      const hiddenValue =
        typeof data.hidden === 'boolean' ? data.hidden : false;

      setRotation(rotationValue);
      setHidden(hiddenValue);
    });

    return unsubscribe;
  }, [lobbyId, rotationDocId]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menu.visible) return;

    const handleDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (rootRef.current?.contains(target)) return;

      setMenu((prev) => ({ ...prev, visible: false }));
    };

    document.addEventListener('mousedown', handleDocMouseDown);
    return () => document.removeEventListener('mousedown', handleDocMouseDown);
  }, [menu.visible]);

  const updatePreviewPosition = useCallback((target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Match CSS max sizes so the math is consistent with actual preview size
    const PREVIEW_WIDTH = viewportWidth * 0.18; // 18vw
    const PREVIEW_HEIGHT = viewportHeight * 0.7; // 70vh
    const MARGIN = 16;

    const cardCenterX = rect.left + rect.width / 2;

    let top = 0;
    let left = 0;

    const rightFits =
      rect.right + MARGIN + PREVIEW_WIDTH <= viewportWidth - MARGIN;

    if (rightFits) {
      // Show to the right of the card
      left = rect.right + MARGIN;
      top = rect.top + rect.height / 2 - PREVIEW_HEIGHT / 2;
    } else {
      // Show above if there is space, otherwise below
      const aboveTop = rect.top - MARGIN - PREVIEW_HEIGHT;
      const aboveFits = aboveTop >= MARGIN;

      if (aboveFits) {
        top = aboveTop;
        left = cardCenterX - PREVIEW_WIDTH / 2;
      } else {
        // Below card – may overlap the card a bit, but stays fully on-screen
        top = rect.bottom + MARGIN;
        left = cardCenterX - PREVIEW_WIDTH / 2;
      }
    }

    // Clamp horizontally
    left = Math.max(
      MARGIN,
      Math.min(left, viewportWidth - PREVIEW_WIDTH - MARGIN),
    );

    // Clamp vertically
    top = Math.max(
      MARGIN,
      Math.min(top, viewportHeight - PREVIEW_HEIGHT - MARGIN),
    );

    setPreviewPos({ top, left });
  }, []);

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!previewEnabled) return;
    setIsHovered(true);
    updatePreviewPosition(e.currentTarget);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!previewEnabled || !isHovered) return;
    updatePreviewPosition(e.currentTarget);
  };

  const handleMouseLeave = () => {
    if (!previewEnabled) return;
    setIsHovered(false);
  };

  const closeMenu = () => {
    setMenu((prev) => ({ ...prev, visible: false }));
  };

  const effectiveCanRotate = (canRotate ?? canInteract) && !disableRotate;
  const contextMenuEnabled = canInteract && contextMenuBaseEnabled;

  const toggleRotation = useCallback(async () => {
    if (!effectiveCanRotate || !lobbyId) return;

    try {
      const next = rotation === 90 ? 0 : 90;
      setRotation(next);

      const rotationRef = doc(
        db,
        'lobbies',
        lobbyId,
        'rotations',
        rotationDocId,
      );

      await setDoc(
        rotationRef,
        {
          rotation: next,
        },
        { merge: true },
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[CardInteraction] Failed to rotate card', err);
    }
  }, [effectiveCanRotate, lobbyId, rotation, rotationDocId]);

  const toggleHidden = useCallback(async () => {
    if (!allowHide || !lobbyId) return;

    try {
      const next = !hidden;
      setHidden(next);

      const rotationRef = doc(
        db,
        'lobbies',
        lobbyId,
        'rotations',
        rotationDocId,
      );

      await setDoc(
        rotationRef,
        {
          hidden: next,
        },
        { merge: true },
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[CardInteraction] Failed to toggle hidden state', err);
    }
  }, [allowHide, hidden, lobbyId, rotationDocId]);

  const handleClick = async (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    e.preventDefault();
    closeMenu();

    // In discard modal, left click should open the context menu as well
    if (isDiscardModal && contextMenuEnabled) {
      setMenu({
        visible: true,
        x: e.clientX,
        y: e.clientY,
      });
      return;
    }

    if (!effectiveCanRotate) return;
    await toggleRotation();
  };

  const handleContextMenu = (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    e.preventDefault();

    if (!contextMenuEnabled) {
      // Let event bubble so parent (e.g. discard pile cell) can show its own menu
      return;
    }

    setMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canInteract) {
      e.preventDefault();
      return;
    }

    closeMenu();
    setIsHovered(false);

    const payload = {
      fromZoneId: zoneId,
      fromIndex: indexInZone,
    };

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
  };

  const handleDragEnd = (_e: React.DragEvent<HTMLDivElement>) => {
    // no-op for now
  };

  const handleMenuSendToDiscard = () => {
    if (onSendToDiscard) {
      onSendToDiscard(zoneId, indexInZone);
    }
    closeMenu();
  };

  const handleMenuSendToBottom = () => {
    if (onSendToBottomOfDeck) {
      onSendToBottomOfDeck(zoneId, indexInZone);
    }
    closeMenu();
  };

  const handleMenuSendToHandFromDiscard = () => {
    if (onSendToHandFromDiscard) {
      onSendToHandFromDiscard(zoneId, indexInZone);
    }
    closeMenu();
  };

  const handleMenuToggleHidden = () => {
    void toggleHidden();
    closeMenu();
  };

  // Don’t show preview while a card-specific context menu is open
  const previewShouldShow =
    previewEnabled && isHovered && !menu.visible;

  const boardImageSrc = hidden ? cardBackImg : card.images.small;
  const previewImageSrc =
    hidden && !isOwnerView ? cardBackImg : card.images.large;

  const previewNode =
    previewShouldShow && typeof document !== 'undefined' ? (
      <div
        className="rb-card-preview"
        style={{ top: previewPos.top, left: previewPos.left }}
      >
        <div className="rb-card-preview-inner">
          <img
            src={previewImageSrc}
            alt={card.name}
            className="rb-card-preview-image"
            draggable={false}
          />
        </div>
      </div>
    ) : null;

  return (
    <>
      <div
        ref={rootRef}
        className="rb-card-interaction relative h-full w-full cursor-pointer"
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
        onClick={handleClick}
        draggable={canInteract}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          className="relative h-full w-full rounded-md shadow-md transition-transform duration-150"
          style={{
            transform:
              effectiveCanRotate && rotation === 90
                ? 'rotate(90deg)'
                : 'rotate(0deg)',
            transformOrigin: '50% 50%',
          }}
        >
          <img
            src={boardImageSrc}
            alt={card.name}
            className="h-full w-full rounded-md object-contain"
            draggable={false}
          />
          {overlay}
        </div>
      </div>

      {/* Preview is portaled to <body> so it escapes any stacking contexts */}
      {previewNode && createPortal(previewNode, document.body)}

      {menu.visible && (
        <div
          ref={menuRef}
          className="fixed z-[200] rounded-md border border-slate-600 bg-slate-900/95 px-2 py-1 text-xs text-slate-100 shadow-lg"
          style={{ top: menu.y, left: menu.x }}
        >
          {isDiscardModal ? (
            <>
              <button
                type="button"
                className="block w-full cursor-pointer rounded px-2 py-1 text-left hover:bg-slate-700"
                onClick={handleMenuSendToBottom}
              >
                Send to bottom of deck
              </button>
              <button
                type="button"
                className="mt-0.5 block w-full cursor-pointer rounded px-2 py-1 text-left hover:bg-slate-700"
                onClick={handleMenuSendToHandFromDiscard}
              >
                Send to hand
              </button>
            </>
          ) : isRuneMode ? (
            <>
              <button
                type="button"
                className="block w-full cursor-pointer rounded px-2 py-1 text-left hover:bg-slate-700"
                onClick={handleMenuSendToBottom}
              >
                Send to bottom of rune pile
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="block w-full cursor-pointer rounded px-2 py-1 text-left hover:bg-slate-700"
                onClick={handleMenuSendToDiscard}
              >
                Send to discard
              </button>
              <button
                type="button"
                className="mt-0.5 block w-full cursor-pointer rounded px-2 py-1 text-left hover:bg-slate-700"
                onClick={handleMenuSendToBottom}
              >
                Send to bottom of deck
              </button>

              {allowHide && (
                <button
                  type="button"
                  className="mt-0.5 block w-full cursor-pointer rounded px-2 py-1 text-left hover:bg-slate-700"
                  onClick={handleMenuToggleHidden}
                >
                  {hidden ? 'Unhide card' : 'Hide card'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
