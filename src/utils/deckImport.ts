// src/utils/deckImport.ts
import { findCardByOgnCode } from '../data/riftboundCards';
import type { RiftboundCard } from '../data/riftboundCards';

export type ParsedDeckLine = {
  raw: string;
  quantity: number | null;
  ognCode?: string;
  card: RiftboundCard | null;
  error?: string;
};

export type ParsedDeckImport = {
  lines: ParsedDeckLine[];
  aggregated: { card: RiftboundCard; quantity: number }[];
  errors: string[];
};

function parseLine(raw: string): ParsedDeckLine {
  const line = raw.trim();
  if (!line) {
    return { raw, quantity: null, card: null };
  }

  // 1) quantity at start
  const qtyMatch = /^(\d+)\s+/.exec(line);
  const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : NaN;

  if (!qtyMatch || Number.isNaN(quantity) || quantity <= 0) {
    return {
      raw,
      quantity: null,
      card: null,
      error: 'Could not parse quantity at the start of the line.',
    };
  }

  // 2) OGN code anywhere in the line
  const ognMatch = /OGN-\d{3}(?:\/\d{3})?/i.exec(line);
  const ognCode = ognMatch ? ognMatch[0].toUpperCase() : undefined;

  if (!ognCode) {
    return {
      raw,
      quantity,
      card: null,
      error: 'No OGN code found (e.g. OGN-211 or OGN-096/298).',
    };
  }

  const card = findCardByOgnCode(ognCode);

  if (!card) {
    return {
      raw,
      quantity,
      ognCode,
      card: null,
      error: `No card found for ${ognCode}.`,
    };
  }

  return { raw, quantity, ognCode, card };
}

/**
 * Keep order of first appearance:
 * - If the same card appears later, we just bump the quantity,
 *   we do NOT move its position.
 */
export function parseDeckImport(text: string): ParsedDeckImport {
  const lines = text.split('\n').map((l) => parseLine(l));

  const errors = lines
    .filter((l) => l.error)
    .map((l) => `${l.raw} — ${l.error}`);

  const aggregated: { card: RiftboundCard; quantity: number }[] = [];

  for (const line of lines) {
    const { card, quantity } = line;

    if (!card || !quantity) continue;

    const existing = aggregated.find((e) => e.card.id === card.id);
    if (existing) {
      existing.quantity += quantity;
    } else {
      aggregated.push({ card, quantity });
    }
  }

  return { lines, aggregated, errors };
}
