import type React from 'react';
import { useEffect, useState, useCallback, useRef } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { RiftboundCard } from '../data/riftboundCards';
import type { BoardZoneId } from '../game/boardConfig';

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
   */
  mode?: 'default' | 'discard-modal' | 'discard-top';
  /** If true, left-click rotation is disabled */
  disableRotate?: boolean;
  /** If true, card-specific right-click menu is disabled */
  disableContextMenu?: boolean;
};

type PreviewPos = { top: number; left: number };

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
}: CardInteractionProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [previewPos, setPreviewPos] = useState<PreviewPos>({ top: 0, left: 0 });
  const [rotation, setRotation] = useState<number>(0);
  const [menu, setMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
  });

  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const rotationEnabled = canInteract && !disableRotate;
  const contextMenuEnabled = canInteract && !disableContextMenu;
  const isDiscardModal = mode === 'discard-modal';

  const rotationDocId = `${zoneId}-${card.id}-${indexInZone}`;

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
        return;
      }
      const data = snap.data() as { rotation?: unknown };
      const value =
        typeof data.rotation === 'number' && !Number.isNaN(data.rotation)
          ? data.rotation
          : 0;
      setRotation(value);
    });

    return unsubscribe;
  }, [lobbyId, rotationDocId]);

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

    const PREVIEW_WIDTH = 320;
    const PREVIEW_HEIGHT = 480;
    const MARGIN = 16;

    const cardCenterX = rect.left + rect.width / 2;

    let top = 0;
    let left = 0;

    const rightFits =
      rect.right + MARGIN + PREVIEW_WIDTH <= viewportWidth - MARGIN;

    if (rightFits) {
      left = rect.right + MARGIN;
      top = rect.top + rect.height / 2 - PREVIEW_HEIGHT / 2;
    } else {
      const aboveTop = rect.top - MARGIN - PREVIEW_HEIGHT;
      const aboveFits = aboveTop >= MARGIN;

      if (aboveFits) {
        top = aboveTop;
        left = cardCenterX - PREVIEW_WIDTH / 2;
      } else {
        top = rect.bottom + MARGIN;
        left = cardCenterX - PREVIEW_WIDTH / 2;
      }
    }

    left = Math.max(MARGIN, Math.min(left, viewportWidth - PREVIEW_WIDTH - MARGIN));
    top = Math.max(MARGIN, Math.min(top, viewportHeight - PREVIEW_HEIGHT - MARGIN));

    setPreviewPos({ top, left });
  }, []);

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsHovered(true);
    updatePreviewPosition(e.currentTarget);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isHovered) return;
    updatePreviewPosition(e.currentTarget);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const closeMenu = () => {
    setMenu((prev) => ({ ...prev, visible: false }));
  };

  const toggleRotation = useCallback(async () => {
    if (!rotationEnabled || !lobbyId) return;

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
      await setDoc(rotationRef, { rotation: next }, { merge: true });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[CardInteraction] Failed to rotate card', err);
    }
  }, [rotationEnabled, lobbyId, rotation, rotationDocId]);

  const handleClick = async (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    e.preventDefault();
    closeMenu();
    if (!rotationEnabled) return;
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

  return (
    <>
      <div
        ref={rootRef}
        className="relative h-full w-full cursor-pointer"
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
        onClick={handleClick}
        draggable={canInteract}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <img
          src={card.images.small}
          alt={card.name}
          className="h-full w-full rounded-md object-contain shadow-md transition-transform duration-150"
          style={{
            transform: rotationEnabled && rotation === 90 ? 'rotate(90deg)' : 'rotate(0deg)',
            transformOrigin: '50% 50%',
          }}
          draggable={false}
        />
      </div>

      {isHovered && (
        <div
          className="pointer-events-none fixed z-[60]"
          style={{
            top: previewPos.top,
            left: previewPos.left,
            maxHeight: '80vh',
            maxWidth: '20rem',
          }}
        >
          <img
            src={card.images.large}
            alt={card.name}
            className="max-h-[80vh] max-w-[20rem] rounded-xl shadow-2xl"
            draggable={false}
          />
        </div>
      )}

      {menu.visible && (
        <div
          ref={menuRef}
          className="fixed z-[70] rounded-md border border-slate-600 bg-slate-900/95 px-2 py-1 text-xs text-slate-100 shadow-lg"
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
            </>
          )}
        </div>
      )}
    </>
  );
}
