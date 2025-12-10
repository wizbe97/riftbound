import type React from 'react';
import { useEffect, useState, useCallback } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { RiftboundCard } from '../data/riftboundCards';
import type { BoardZoneId } from '../game/boardConfig';

type CardInteractionProps = {
  card: RiftboundCard;
  canInteract?: boolean;
  lobbyId: string;
  zoneId: BoardZoneId;
  /** Index of this card within its zone (for drag/drop ordering) */
  indexInZone?: number;
  onSendToDiscard?: (zoneId: BoardZoneId, indexInZone: number) => void;
  onSendToBottomOfDeck?: (zoneId: BoardZoneId, indexInZone: number) => void;
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
}: CardInteractionProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [previewPos, setPreviewPos] = useState<PreviewPos>({ top: 0, left: 0 });
  const [rotation, setRotation] = useState<number>(0);
  const [menu, setMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
  });

  // Build a unique rotation doc id per *card instance* in a zone
  const rotationDocId = `${zoneId}-${card.id}-${indexInZone}`;

  // Subscribe to rotation for this card so both players stay in sync
  useEffect(() => {
    if (!lobbyId) return;

    const rotationRef = doc(db, 'lobbies', lobbyId, 'rotations', rotationDocId);

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

  const updatePreviewPosition = useCallback((target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Approximate preview size (in px)
    const PREVIEW_WIDTH = 320;
    const PREVIEW_HEIGHT = 480;
    const MARGIN = 16;

    const cardCenterX = rect.left + rect.width / 2;

    let top = 0;
    let left = 0;

    // 1) Try to the RIGHT of the card
    const rightFits =
      rect.right + MARGIN + PREVIEW_WIDTH <= viewportWidth - MARGIN;

    if (rightFits) {
      left = rect.right + MARGIN;
      top = rect.top + rect.height / 2 - PREVIEW_HEIGHT / 2;
    } else {
      // 2) Try ABOVE the card
      const aboveTop = rect.top - MARGIN - PREVIEW_HEIGHT;
      const aboveFits = aboveTop >= MARGIN;

      if (aboveFits) {
        top = aboveTop;
        left = cardCenterX - PREVIEW_WIDTH / 2;
      } else {
        // 3) Last resort: BELOW the card
        top = rect.bottom + MARGIN;
        left = cardCenterX - PREVIEW_WIDTH / 2;
      }
    }

    // Clamp horizontally
    left = Math.max(MARGIN, Math.min(left, viewportWidth - PREVIEW_WIDTH - MARGIN));
    // Clamp vertically
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

  // Shared rotation toggler (left click only)
  const toggleRotation = useCallback(async () => {
    if (!canInteract || !lobbyId) return;

    try {
      const next = rotation === 90 ? 0 : 90;
      setRotation(next); // optimistic update

      const rotationRef = doc(db, 'lobbies', lobbyId, 'rotations', rotationDocId);
      await setDoc(rotationRef, { rotation: next }, { merge: true });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[CardInteraction] Failed to rotate card', err);
    }
  }, [canInteract, lobbyId, rotation, rotationDocId]);

  // Left-click = rotate (tap/untap)
  const handleClick = async (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    e.preventDefault();
    closeMenu();
    await toggleRotation();
  };

  // Right-click = open context menu for discard / bottom-of-deck
  const handleContextMenu = (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    e.preventDefault();
    if (!canInteract) return;

    setMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
    });
  };

  // HTML5 drag start – encode origin zone + index
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canInteract) {
      e.preventDefault();
      return;
    }

    closeMenu();
    setIsHovered(false); // hide preview while dragging

    const payload = {
      fromZoneId: zoneId,
      fromIndex: indexInZone,
    };

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
  };

  const handleDragEnd = (_e: React.DragEvent<HTMLDivElement>) => {
    // No-op for now; could add visual feedback later
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

  return (
    <>
      <div
        className={`relative h-full w-full ${
          canInteract ? 'cursor-pointer' : 'cursor-default'
        }`}
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
            transform: rotation === 90 ? 'rotate(90deg)' : 'rotate(0deg)',
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
          className="fixed z-[70] rounded-md border border-slate-600 bg-slate-900/95 px-2 py-1 text-xs text-slate-100 shadow-lg"
          style={{ top: menu.y, left: menu.x }}
        >
          <button
            type="button"
            className="block w-full rounded px-2 py-1 text-left hover:bg-slate-700"
            onClick={handleMenuSendToDiscard}
          >
            Send to discard
          </button>
          <button
            type="button"
            className="mt-0.5 block w-full rounded px-2 py-1 text-left hover:bg-slate-700"
            onClick={handleMenuSendToBottom}
          >
            Send to bottom of deck
          </button>
        </div>
      )}
    </>
  );
}
