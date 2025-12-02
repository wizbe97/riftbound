// src/pages/CardGalleryPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ALL_CARDS, searchCards } from '../data/riftboundCards';
import type { RiftboundCard } from '../data/riftboundCards';

function CardGalleryPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<RiftboundCard | null>(null);

  const cards = query ? searchCards(query) : ALL_CARDS;

  const handleBack = () => {
    navigate('/decks');
  };

  return (
    <section className="flex h-[calc(100vh-6rem-3rem)] flex-col">
      {/* Header row with back + title + search */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-900/80 text-sm text-slate-100 hover:border-amber-400 hover:text-amber-200"
          >
            ←
          </button>
          <div>
            <h1 className="text-3xl font-semibold text-amber-300">
              Card Gallery
            </h1>
            <p className="text-sm text-slate-300">
              Browse the Riftbound card pool. Click a card to view a
              larger image.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or number (e.g. 211, OGN-211)…"
            className="w-64 rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Card grid */}
      <div className="flex-1 overflow-y-auto rounded-xl border border-amber-500/40 bg-slate-900/70 p-3">
        {cards.length === 0 ? (
          <div className="text-sm text-slate-400">
            No cards match that search.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {cards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => setSelected(card)}
                className="flex flex-col items-center rounded-lg bg-slate-950/70 p-2 shadow hover:bg-slate-900/90"
              >
                <img
                  src={card.images.small}
                  alt={card.name}
                  loading="lazy"
                  className="mb-1 w-full rounded-md"
                />
                <span className="line-clamp-2 text-[11px] font-semibold text-slate-100">
                  {card.name}
                </span>
                <span className="text-[10px] text-slate-400">
                  {card.number ?? '—'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Fullscreen popup */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setSelected(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <img
              src={selected.images.large}
              alt={selected.name}
              className="max-h-[90vh] max-w-[90vw] rounded-xl shadow-2xl"
            />
          </div>
        </div>
      )}
    </section>
  );
}

export default CardGalleryPage;
