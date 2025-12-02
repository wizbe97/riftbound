// src/pages/DeckDetailPage.tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  doc,
  getDoc,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import {
  ALL_CARDS,
  getOgnCode,
} from '../data/riftboundCards';
import type { RiftboundCard } from '../data/riftboundCards';

type DeckCardDoc = { cardId: string; quantity: number };

type DeckDoc = {
  name: string;
  ownerUid: string;
  cards: DeckCardDoc[];
  sideboard?: DeckCardDoc[];
  legendCardId?: string | null;
  championCardId?: string | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

type DeckCardEntry = {
  card: RiftboundCard;
  quantity: number;
};

function DeckDetailPage() {
  const { user } = useAuth();
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();

  const [name, setName] = useState<string>('');
  const [mainCards, setMainCards] = useState<DeckCardEntry[]>([]);
  const [sideboardCards, setSideboardCards] = useState<DeckCardEntry[]>([]);
  const [legendCardId, setLegendCardId] = useState<string | null>(null);
  const [championCardId, setChampionCardId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedCard, setSelectedCard] = useState<RiftboundCard | null>(null);

  const cardById = useMemo(() => {
    const map = new Map<string, RiftboundCard>();
    for (const card of ALL_CARDS) {
      map.set(card.id, card);
    }
    return map;
  }, []);

  // exportText hook must be before any early return
  const exportText = useMemo(() => {
    if (mainCards.length === 0) return '';
    return mainCards
      .map((entry) => {
        const ogn =
          getOgnCode(entry.card) ??
          entry.card.number ??
          'N/A';
        return `${entry.quantity} ${entry.card.name} (${ogn})`;
      })
      .join('\n');
  }, [mainCards]);

  useEffect(() => {
    if (!user || !deckId) {
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const deckRef = doc(
          db,
          'users',
          user.uid,
          'decks',
          deckId,
        );
        const snap = await getDoc(deckRef);
        if (!snap.exists()) {
          setLoadError('Deck not found.');
          setLoading(false);
          return;
        }

        const data = snap.data() as DeckDoc;
        setName(data.name ?? 'Untitled Deck');
        setLegendCardId(data.legendCardId ?? null);
        setChampionCardId(data.championCardId ?? null);

        const main: DeckCardEntry[] = (data.cards ?? [])
          .map((d) => {
            const card = cardById.get(d.cardId);
            if (!card) return null;
            return { card, quantity: d.quantity ?? 0 };
          })
          .filter((x): x is DeckCardEntry => !!x);

        const side: DeckCardEntry[] = (data.sideboard ?? [])
          .map((d) => {
            const card = cardById.get(d.cardId);
            if (!card) return null;
            return { card, quantity: d.quantity ?? 0 };
          })
          .filter((x): x is DeckCardEntry => !!x);

        setMainCards(main);
        setSideboardCards(side);
      } catch (err) {
        console.error('[DeckDetailPage] failed to load deck', err);
        setLoadError('Failed to load deck. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [user, deckId, cardById]);

  // All hooks are above this point; early returns are now safe.
  if (!user) {
    return (
      <section className="max-w-3xl">
        <h1 className="mb-4 text-3xl font-semibold text-amber-300">
          Deck
        </h1>
        <p className="text-sm text-slate-300">
          You need to sign in to view your decks.
        </p>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="max-w-3xl">
        <h1 className="mb-4 text-3xl font-semibold text-amber-300">
          Deck
        </h1>
        <p className="text-sm text-slate-300">Loading deck…</p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="max-w-3xl">
        <h1 className="mb-4 text-3xl font-semibold text-amber-300">
          Deck
        </h1>
        <p className="text-sm text-red-300">{loadError}</p>
      </section>
    );
  }

  const legendCard = legendCardId
    ? mainCards.find((e) => e.card.id === legendCardId)?.card ?? null
    : null;
  const championCard = championCardId
    ? mainCards.find((e) => e.card.id === championCardId)?.card ?? null
    : null;

  const totalMain = mainCards.reduce(
    (sum, c) => sum + c.quantity,
    0,
  );
  const totalSide = sideboardCards.reduce(
    (sum, c) => sum + c.quantity,
    0,
  );

  const handleBack = () => {
    navigate('/decks');
  };

  const handleEdit = () => {
    if (!deckId) return;
    navigate(`/decks/${deckId}/edit`);
  };

  const handleCardClick = (card: RiftboundCard) => {
    setSelectedCard(card);
  };

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-900/80 text-sm text-slate-100 hover:border-amber-400 hover:text-amber-200"
        >
          ←
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-amber-300">
            {name}
          </h1>
          <p className="text-xs text-slate-400">
            {totalMain} main deck cards • {totalSide} sideboard cards
          </p>
          {(legendCard || championCard) && (
            <p className="mt-1 text-[11px] text-slate-400">
              {legendCard && (
                <span className="mr-3">
                  Legend:{' '}
                  <span className="font-semibold text-amber-200">
                    {legendCard.name}
                  </span>
                </span>
              )}
              {championCard && (
                <span>
                  Champion:{' '}
                  <span className="font-semibold text-amber-200">
                    {championCard.name}
                  </span>
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            disabled={mainCards.length === 0}
            className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-100 shadow hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Export
          </button>
          <button
            type="button"
            onClick={handleEdit}
            className="inline-flex items-center rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow hover:bg-amber-400"
          >
            Edit
          </button>
        </div>
      </div>

      {/* Main deck gallery */}
      <div className="rounded-xl border border-amber-500/40 bg-slate-900/70 p-4 shadow-md">
        <h2 className="mb-3 text-lg font-semibold text-amber-200">
          Main Deck
        </h2>
        {mainCards.length === 0 ? (
          <p className="text-sm text-slate-400">
            This deck has no main deck cards.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {mainCards.map((entry) => {
              const isLegend = legendCardId === entry.card.id;
              const isChampion =
                championCardId === entry.card.id;

              return (
                <button
                  key={entry.card.id}
                  type="button"
                  onClick={() => handleCardClick(entry.card)}
                  className="flex flex-col items-center rounded-lg bg-slate-950/80 p-2 shadow hover:bg-slate-900/90"
                >
                  <img
                    src={entry.card.images.small}
                    alt={entry.card.name}
                    className="mb-1 w-full rounded-md"
                  />
                  <div className="text-[11px] font-semibold text-slate-100">
                    {entry.quantity}x {entry.card.name}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {getOgnCode(entry.card) ??
                      entry.card.number ??
                      '—'}
                  </div>
                  {(isLegend || isChampion) && (
                    <div className="mt-0.5 text-[10px] text-amber-300">
                      {isLegend && 'Legend'}
                      {isLegend && isChampion && ' • '}
                      {isChampion && 'Champion'}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Sideboard gallery */}
      <div className="rounded-xl border border-amber-500/40 bg-slate-900/70 p-4 shadow-md">
        <h2 className="mb-3 text-lg font-semibold text-amber-200">
          Sideboard
        </h2>
        {sideboardCards.length === 0 ? (
          <p className="text-sm text-slate-400">
            This deck has no sideboard cards.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {sideboardCards.map((entry) => (
              <button
                key={entry.card.id}
                type="button"
                onClick={() => handleCardClick(entry.card)}
                className="flex flex-col items-center rounded-lg bg-slate-950/80 p-2 shadow hover:bg-slate-900/90"
              >
                <img
                  src={entry.card.images.small}
                  alt={entry.card.name}
                  className="mb-1 w-full rounded-md"
                />
                <div className="text-[11px] font-semibold text-slate-100">
                  {entry.quantity}x {entry.card.name}
                </div>
                <div className="text-[10px] text-slate-400">
                  {getOgnCode(entry.card) ??
                    entry.card.number ??
                    '—'}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Export modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="relative w-full max-w-lg rounded-xl border border-slate-700 bg-slate-950/95 p-5 shadow-2xl">
            <button
              type="button"
              onClick={() => setShowExportModal(false)}
              className="absolute right-3 top-3 text-sm text-slate-400 hover:text-slate-100"
              aria-label="Close"
            >
              ×
            </button>
            <h2 className="mb-2 text-lg font-semibold text-amber-200">
              Export Deck
            </h2>
            <p className="mb-2 text-xs text-slate-300">
              This export covers the <strong>main deck</strong> only,
              in the same format accepted by the importer.
            </p>
            <textarea
              readOnly
              value={exportText}
              rows={10}
              className="w-full rounded-md border border-slate-700 bg-slate-900/80 p-2 text-sm text-slate-100"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700"
              >
                Close
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(exportText);
                  } catch (err) {
                    console.error(
                      '[DeckDetailPage] copy failed',
                      err,
                    );
                  }
                }}
                disabled={!exportText}
                className="rounded-md bg-amber-500 px-4 py-1.5 text-xs font-semibold text-slate-950 shadow hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Copy to clipboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen card popup */}
      {selectedCard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setSelectedCard(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <img
              src={selectedCard.images.large}
              alt={selectedCard.name}
              className="max-h-[90vh] max-w-[90vw] rounded-xl shadow-2xl"
            />
          </div>
        </div>
      )}
    </section>
  );
}

export default DeckDetailPage;
