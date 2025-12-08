// src/hooks/useCardInteractions.ts
import type React from 'react';
import type { CardKey } from '../game/boardConfig';
import type { RiftboundCard } from '../data/riftboundCards';
import type { Role } from '../types/riftboundGame';

type UseCardInteractionsOptions = {
  currentRole: Role;
};

export function useCardInteractions({ currentRole }: UseCardInteractionsOptions) {
  // Rotation handler – real logic later
  const handleRotate = (key: CardKey, isOwn: boolean) => {
    void currentRole;
    void key;
    void isOwn;
    // TODO: implement rotation + sync to backend
  };

  // Context menu handler – real menu later
  const handleContextMenu =
    (key: CardKey, isOwn: boolean) =>
    (e: React.MouseEvent<HTMLDivElement>) => {
      void currentRole;
      void key;
      void isOwn;
      e.preventDefault();
      // TODO: open context menu
    };

  const handleHoverStart = (card: RiftboundCard, x: number, y: number) => {
    void currentRole;
    void card;
    void x;
    void y;
    // TODO: show zoom / tooltip
  };

  const handleHoverEnd = () => {
    void currentRole;
    // TODO: hide zoom / tooltip
  };

  const handleBeginDrag = (
    key: CardKey,
    card: RiftboundCard,
    rotation: number,
    x: number,
    y: number,
  ) => {
    void currentRole;
    void key;
    void card;
    void rotation;
    void x;
    void y;
    // TODO: start drag operation, highlight drop zones, etc.
  };

  return {
    handleRotate,
    handleContextMenu,
    handleHoverStart,
    handleHoverEnd,
    handleBeginDrag,
  };
}
