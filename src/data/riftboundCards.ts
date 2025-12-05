// src/data/riftboundCards.ts
import rawCards from './riftbound_cards.json';

export type RiftboundSetId = 'origins' | 'origins-proving-grounds' | string;

export type RiftboundCard = {
  id: string;
  number?: string | null; // e.g. "211/298"
  code?: string | null;
  name: string;
  images: {
    small: string;
    large: string;
  };
  set: {
    id: RiftboundSetId;
    name: string;
    releaseDate?: string;
  };
  rarity?: string;
  cardType?: string;
  domain?: string;
  energyCost?: string;
  powerCost?: string;
  might?: string;
  description?: string | null;
  flavorText?: string | null;
};

export const ALL_CARDS: RiftboundCard[] = rawCards as RiftboundCard[];

// ---------- Display helpers ----------

/**
 * Returns a normalized "OGN-XXX" code for a card, if possible,
 * based on the `number` field (e.g. "211/298" -> "OGN-211").
 */
export function getOgnCode(card: RiftboundCard): string | null {
  if (!card.number) return null;
  const [rawFront] = card.number.split('/');
  if (!rawFront) return null;

  // Drop any non-digit suffix, pad to 3 digits
  const numericPart = rawFront.replace(/[^0-9]/g, '');
  if (!numericPart) return null;

  const padded = numericPart.padStart(3, '0');
  return `OGN-${padded}`;
}

// ---------- Categorisation helpers (battlefield / rune) ----------

/**
 * Battlefield cards are all numbered OGN-275 to OGN-298 (inclusive),
 * including any alt art variants that share the same numeric front.
 */
export function isBattlefieldCard(card: RiftboundCard): boolean {
  const ogn = getOgnCode(card);
  if (!ogn) return false;

  const match = /OGN-(\d{3})/i.exec(ogn);
  if (!match) return false;

  const num = parseInt(match[1], 10);
  if (Number.isNaN(num)) return false;

  return num >= 275 && num <= 298;
}

/**
 * Rune cards contain one of these phrases in their name:
 * "Mind Rune", "Order Rune", "Chaos Rune", "Fury Rune",
 * "Calm Rune", "Body Rune".
 *
 * This catches alt art variants as long as they keep the rune name.
 */
const RUNE_NAME_MARKERS = [
  'mind rune',
  'order rune',
  'chaos rune',
  'fury rune',
  'calm rune',
  'body rune',
];

export function isRuneCard(card: RiftboundCard): boolean {
  const name = card.name?.toLowerCase() ?? '';
  if (!name) return false;

  return RUNE_NAME_MARKERS.some((marker) => name.includes(marker));
}

/**
 * Convenience classifier if you want a single enum-style value.
 */
export type RiftboundCardKind = 'battlefield' | 'rune' | 'normal';

export function getCardKind(card: RiftboundCard): RiftboundCardKind {
  if (isBattlefieldCard(card)) return 'battlefield';
  if (isRuneCard(card)) return 'rune';
  return 'normal';
}

// ---------- Import helpers (OGN lookups) ----------

export function parseOgnCode(raw: string) {
  const match = /OGN-(\d{3})(?:\/(\d{3}))?/i.exec(raw);
  if (!match) return null;

  const front = match[1];        // "211"
  const back = match[2] ?? null; // "298" or null

  return { front, back };
}

/**
 * Main lookup for imports: given a raw OGN string like "OGN-211"
 * or "OGN-096/298", find the best matching card in the catalog.
 */
export function findCardByOgnCode(raw: string): RiftboundCard | null {
  const parsed = parseOgnCode(raw);
  if (!parsed) return null;

  const { front, back } = parsed;

  // If we have full "NNN/DDD", try that exactly.
  if (back) {
    const full = `${parseInt(front, 10)}/${back}`;
    const exact =
      ALL_CARDS.find(
        (c) => c.number === full || c.code === full,
      ) ?? null;
    if (exact) return exact;
  }

  // Fallback: match by numeric front, ignoring set size & letter variants.
  const numericFront = parseInt(front, 10);
  if (Number.isNaN(numericFront)) return null;

  const matches = ALL_CARDS.filter((c) => {
    if (!c.number) return false;
    const [rawFront] = c.number.split('/');
    if (!rawFront) return false;
    const numeric = parseInt(rawFront.replace(/[^0-9]/g, ''), 10);
    return numeric === numericFront;
  });

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  // Prefer base Origins set over others
  const origins = matches.find((c) => c.set?.id === 'origins');
  if (origins) return origins;

  return matches[0];
}

// ---------- Search helper for UI ----------

export function searchCards(query: string): RiftboundCard[] {
  const q = query.trim().toLowerCase();
  if (!q) return ALL_CARDS;

  const isNumeric = /^\d{1,3}$/.test(q);
  const maybeOgn = /^ogn-\d{1,3}/i.test(q);

  return ALL_CARDS.filter((card) => {
    const name = card.name.toLowerCase();
    const number = card.number?.toLowerCase() ?? '';

    // Name search
    if (name.includes(q)) return true;

    // OGN-style search
    if (maybeOgn) {
      const ogn = getOgnCode(card)?.toLowerCase();
      if (ogn?.startsWith(q)) return true;
    }

    // Raw number search: "211" should catch "211/298"
    if (isNumeric) {
      if (number.startsWith(q + '/')) return true;
    }

    // Full "211/298"
    if (number.includes(q)) return true;

    return false;
  });
}
