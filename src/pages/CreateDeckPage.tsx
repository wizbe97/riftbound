// src/pages/CreateDeckPage.tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import {
  ALL_CARDS,
  searchCards,
  getOgnCode,
} from '../data/riftboundCards';
import type { RiftboundCard } from '../data/riftboundCards';
import { parseDeckImport } from '../utils/deckImport';

type DeckCardEntry = {
  card: RiftboundCard;
  quantity: number;
};

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

type ActiveZone = 'main' | 'sideboard';

function CreateDeckPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { deckId } = useParams<{ deckId?: string }>();

  const isEditMode = !!deckId;

  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [activeZone, setActiveZone] = useState<ActiveZone>('main');

  const [deckCards, setDeckCards] = useState<DeckCardEntry[]>([]);
  const [sideboardCards, setSideboardCards] = useState<DeckCardEntry[]>([]);

  const [legendCardId, setLegendCardId] = useState<string | null>(null);
  const [championCardId, setChampionCardId] = useState<string | null>(null);

  // Import modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importErrors, setImportErrors] = useState<string[]>([]);

  // Export modal state
  const [showExportModal, setShowExportModal] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Edit-mode loading
  const [loadingDeck, setLoadingDeck] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const mainCount = deckCards.reduce(
    (sum, entry) => sum + entry.quantity,
    0,
  );
  const sideCount = sideboardCards.reduce(
    (sum, entry) => sum + entry.quantity,
    0,
  );

  // Only treat as "dirty" for create mode (so edit mode doesn’t nag on leave)
  const isDirty =
    !isEditMode &&
    (name.trim().length > 0 ||
      deckCards.length > 0 ||
      sideboardCards.length > 0 ||
      importText.trim().length > 0 ||
      legendCardId !== null ||
      championCardId !== null);

  // Warn on tab close / reload if there are unsaved changes (create mode only)
  useEffect(() => {
    if (!isDirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const cardById = useMemo(() => {
    const map = new Map<string, RiftboundCard>();
    for (const card of ALL_CARDS) {
      map.set(card.id, card);
    }
    return map;
  }, []);

  // Load existing deck in edit mode
  useEffect(() => {
    if (!isEditMode || !user || !deckId) return;

    const load = async () => {
      setLoadingDeck(true);
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
          return;
        }
        const data = snap.data() as DeckDoc;

        setName(data.name ?? '');

        const mainEntries: DeckCardEntry[] = (data.cards ?? [])
          .map((c) => {
            const card = cardById.get(c.cardId);
            if (!card) return null;
            return {
              card,
              quantity: c.quantity ?? 0,
            };
          })
          .filter((x): x is DeckCardEntry => !!x);

        const sideEntries: DeckCardEntry[] = (data.sideboard ?? [])
          .map((c) => {
            const card = cardById.get(c.cardId);
            if (!card) return null;
            return {
              card,
              quantity: c.quantity ?? 0,
            };
          })
          .filter((x): x is DeckCardEntry => !!x);

        setDeckCards(mainEntries);
        setSideboardCards(sideEntries);
        setLegendCardId(data.legendCardId ?? null);
        setChampionCardId(data.championCardId ?? null);
      } catch (err) {
        console.error('[CreateDeckPage] failed to load deck', err);
        setLoadError('Failed to load deck. Please try again.');
      } finally {
        setLoadingDeck(false);
      }
    };

    void load();
  }, [isEditMode, user, deckId, cardById]);

  // Hooks that must always be called
  const searchResults = useMemo(
    () => searchCards(search).slice(0, 60),
    [search],
  );

  const exportText = useMemo(() => {
    if (deckCards.length === 0) return '';
    return deckCards
      .map((entry) => {
        const ogn =
          getOgnCode(entry.card) ??
          entry.card.number ??
          'N/A';
        return `${entry.quantity} ${entry.card.name} (${ogn})`;
      })
      .join('\n');
  }, [deckCards]);

  const canSave =
    deckCards.length > 0 || sideboardCards.length > 0;
  const hasLegendAndChampion =
    !!legendCardId && !!championCardId;

  // Early returns AFTER all hooks
  if (!user || !profile) {
    return (
      <section className="max-w-3xl">
        <h1 className="mb-4 text-3xl font-semibold text-amber-300">
          {isEditMode ? 'Edit Deck' : 'Create Deck'}
        </h1>
        <p className="text-sm text-slate-300">
          You need an account to create and save decks.
        </p>
      </section>
    );
  }

  if (isEditMode && loadingDeck) {
    return (
      <section className="max-w-3xl">
        <h1 className="mb-4 text-3xl font-semibold text-amber-300">
          Edit Deck
        </h1>
        <p className="text-sm text-slate-300">Loading deck…</p>
      </section>
    );
  }

  if (isEditMode && loadError) {
    return (
      <section className="max-w-3xl">
        <h1 className="mb-4 text-3xl font-semibold text-amber-300">
          Edit Deck
        </h1>
        <p className="text-sm text-red-300">{loadError}</p>
      </section>
    );
  }

  const handleAddCardToZone = (card: RiftboundCard, zone: ActiveZone) => {
    const setter =
      zone === 'main' ? setDeckCards : setSideboardCards;

    setter((prev) => {
      const existing = prev.find((e) => e.card.id === card.id);
      if (existing) {
        return prev.map((e) =>
          e.card.id === card.id
            ? { ...e, quantity: e.quantity + 1 }
            : e,
        );
      }
      return [...prev, { card, quantity: 1 }];
    });
  };

  const handleAddCard = (card: RiftboundCard) => {
    handleAddCardToZone(card, activeZone);
  };

  const handleChangeQuantityMain = (
    cardId: string,
    qty: number,
  ) => {
    if (qty <= 0) {
      setDeckCards((prev) =>
        prev.filter((e) => e.card.id !== cardId),
      );
      if (legendCardId === cardId) setLegendCardId(null);
      if (championCardId === cardId) setChampionCardId(null);
    } else {
      setDeckCards((prev) =>
        prev.map((e) =>
          e.card.id === cardId ? { ...e, quantity: qty } : e,
        ),
      );
    }
  };

  const handleChangeQuantitySideboard = (
    cardId: string,
    qty: number,
  ) => {
    if (qty <= 0) {
      setSideboardCards((prev) =>
        prev.filter((e) => e.card.id !== cardId),
      );
    } else {
      setSideboardCards((prev) =>
        prev.map((e) =>
          e.card.id === cardId ? { ...e, quantity: qty } : e,
        ),
      );
    }
  };

  const handleClearDeck = () => {
    if (!deckCards.length && !sideboardCards.length) return;
    if (
      !window.confirm(
        'Clear all cards from this deck (main and sideboard)?',
      )
    )
      return;
    setDeckCards([]);
    setSideboardCards([]);
    setLegendCardId(null);
    setChampionCardId(null);
  };

  const handleImport = (): boolean => {
    setImportErrors([]);
    const text = importText.trim();
    if (!text) return false;

    const result = parseDeckImport(text);
    setImportErrors(result.errors);

    if (result.aggregated.length === 0) return false;

    setDeckCards((prev) => {
      const next = [...prev];

      for (const agg of result.aggregated) {
        const idx = next.findIndex(
          (e) => e.card.id === agg.card.id,
        );
        if (idx >= 0) {
          next[idx] = {
            ...next[idx],
            quantity: next[idx].quantity + agg.quantity,
          };
        } else {
          next.push({
            card: agg.card,
            quantity: agg.quantity,
          });
        }
      }

      return next;
    });

    return true;
  };

  const handleSave = async () => {
    setSaveError(null);
    const trimmedName = name.trim() || 'Untitled Deck';

    if (!canSave) {
      setSaveError('Add at least one card before saving.');
      return;
    }

    if (!legendCardId || !championCardId) {
      setSaveError(
        'You must set both a Legend and a Champion in your main deck before saving.',
      );
      return;
    }

    const legendInDeck = deckCards.some(
      (e) => e.card.id === legendCardId,
    );
    const championInDeck = deckCards.some(
      (e) => e.card.id === championCardId,
    );

    if (!legendInDeck || !championInDeck) {
      setSaveError(
        'Legend and Champion must be cards in your main deck.',
      );
      return;
    }

    try {
      setSaving(true);

      const payload = {
        name: trimmedName,
        ownerUid: user.uid,
        cards: deckCards.map((entry) => ({
          cardId: entry.card.id,
          quantity: entry.quantity,
        })),
        sideboard: sideboardCards.map((entry) => ({
          cardId: entry.card.id,
          quantity: entry.quantity,
        })),
        legendCardId: legendCardId ?? null,
        championCardId: championCardId ?? null,
        updatedAt: serverTimestamp(),
      };

      if (isEditMode && deckId) {
        const deckRef = doc(
          db,
          'users',
          user.uid,
          'decks',
          deckId,
        );
        await updateDoc(deckRef, payload);
      } else {
        const decksRef = collection(
          db,
          'users',
          user.uid,
          'decks',
        );
        await addDoc(decksRef, {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      navigate('/decks');
    } catch (err) {
      console.error('[CreateDeckPage] failed to save deck', err);
      setSaveError('Failed to save deck. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleBackToDecks = () => {
    if (
      isDirty &&
      !window.confirm(
        'You have unsaved changes. Leave this page anyway?',
      )
    ) {
      return;
    }
    navigate('/decks');
  };

  const legendCard = legendCardId
    ? deckCards.find((e) => e.card.id === legendCardId)?.card ??
      null
    : null;

  const championCard = championCardId
    ? deckCards.find((e) => e.card.id === championCardId)?.card ??
      null
    : null;

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleBackToDecks}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-900/80 text-sm text-slate-100 hover:border-amber-400 hover:text-amber-200"
        >
          ←
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-amber-300">
            {isEditMode ? 'Edit Deck' : 'Create Deck'}
          </h1>
          <p className="text-xs text-slate-400">
            Name your deck, add cards, set your legend and champion, or
            import from a list.
          </p>
        </div>

        {/* Action buttons: Save / Import / Export */}
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="inline-flex items-center rounded-md border border-amber-500/60 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-amber-200 shadow hover:bg-slate-800"
            >
              Import
            </button>
            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              disabled={deckCards.length === 0}
              className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-100 shadow hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Export
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={
                saving || !canSave || !hasLegendAndChampion
              }
              className="inline-flex items-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving
                ? 'Saving…'
                : isEditMode
                ? 'Save Changes'
                : 'Save Deck'}
            </button>
          </div>

          {canSave && !hasLegendAndChampion && (
            <p className="text-[11px] text-amber-200/90">
              Set both a Legend and a Champion from your main deck to
              enable saving.
            </p>
          )}
        </div>
      </div>

      {saveError && (
        <div className="rounded border border-red-500/60 bg-red-950/60 px-3 py-2 text-sm text-red-200">
          {saveError}
        </div>
      )}

      {/* Deck name + quick summary + Legend/Champion selectors */}
      <div className="rounded-xl border border-amber-500/40 bg-slate-900/60 p-4 shadow-md">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-300">
          Deck Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Viktor Herald Control"
          className="w-full rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
        />
        <div className="mt-2 text-xs text-slate-400">
          <span>
            Main deck:{' '}
            <span className="font-semibold text-amber-200">
              {mainCount}
            </span>
          </span>
          <span className="mx-2">•</span>
          <span>
            Sideboard:{' '}
            <span className="font-semibold text-amber-200">
              {sideCount}
            </span>
          </span>
        </div>

        {/* Top-level Legend / Champion selection + images */}
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div className="text-xs text-slate-300">
            <label className="mb-1 block font-semibold text-slate-200">
              Legend (from main deck)
            </label>
            <select
              value={legendCardId ?? ''}
              onChange={(e) =>
                setLegendCardId(e.target.value || null)
              }
              disabled={deckCards.length === 0}
              className="w-full rounded-md border border-slate-700 bg-slate-900/80 px-2 py-1.5 text-xs text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">
                {deckCards.length === 0
                  ? 'Add main deck cards first'
                  : 'Choose a Legend from your main deck'}
              </option>
              {deckCards.map((entry) => (
                <option key={entry.card.id} value={entry.card.id}>
                  {entry.card.name} (
                  {getOgnCode(entry.card) ??
                    entry.card.number ??
                    '—'}
                  )
                </option>
              ))}
            </select>
            {legendCard && (
              <div className="mt-2 flex items-center gap-2">
                <img
                  src={legendCard.images.small}
                  alt={legendCard.name}
                  className="h-16 w-auto rounded-md border border-amber-500/70 bg-slate-950"
                />
                <div className="text-[11px] text-slate-300">
                  <div className="font-semibold text-amber-200">
                    {legendCard.name}
                  </div>
                  <div>
                    {getOgnCode(legendCard) ??
                      legendCard.number ??
                      '—'}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="text-xs text-slate-300">
            <label className="mb-1 block font-semibold text-slate-200">
              Champion (from main deck)
            </label>
            <select
              value={championCardId ?? ''}
              onChange={(e) =>
                setChampionCardId(e.target.value || null)
              }
              disabled={deckCards.length === 0}
              className="w-full rounded-md border border-slate-700 bg-slate-900/80 px-2 py-1.5 text-xs text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">
                {deckCards.length === 0
                  ? 'Add main deck cards first'
                  : 'Choose a Champion from your main deck'}
              </option>
              {deckCards.map((entry) => (
                <option key={entry.card.id} value={entry.card.id}>
                  {entry.card.name} (
                  {getOgnCode(entry.card) ??
                    entry.card.number ??
                    '—'}
                  )
                </option>
              ))}
            </select>
            {championCard && (
              <div className="mt-2 flex items-center gap-2">
                <img
                  src={championCard.images.small}
                  alt={championCard.name}
                  className="h-16 w-auto rounded-md border border-amber-500/70 bg-slate-950"
                />
                <div className="text-[11px] text-slate-300">
                  <div className="font-semibold text-amber-200">
                    {championCard.name}
                  </div>
                  <div>
                    {getOgnCode(championCard) ??
                      championCard.number ??
                      '—'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {(legendCard || championCard) && (
          <div className="mt-2 text-xs text-slate-400">
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
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-[2fr,3fr]">
        {/* Search & add cards with Main/Sideboard tabs */}
        <div className="rounded-xl border border-amber-500/40 bg-slate-900/60 p-4 shadow-md">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-amber-200">
              Add Cards
            </h2>
            <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950/60 text-xs">
              <button
                type="button"
                onClick={() => setActiveZone('main')}
                className={
                  'px-3 py-1.5 font-semibold ' +
                  (activeZone === 'main'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:bg-slate-800')
                }
              >
                Main Deck
              </button>
              <button
                type="button"
                onClick={() => setActiveZone('sideboard')}
                className={
                  'px-3 py-1.5 font-semibold ' +
                  (activeZone === 'sideboard'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:bg-slate-800')
                }
              >
                Sideboard
              </button>
            </div>
          </div>

          <p className="mb-2 text-xs text-slate-300">
            Search by card name or number (e.g.{' '}
            <code className="font-mono">211</code> or{' '}
            <code className="font-mono">OGN-211</code>), then click
            &quot;Add&quot; to add to the{' '}
            <span className="font-semibold">
              {activeZone === 'main' ? 'main deck' : 'sideboard'}
            </span>
            .
          </p>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cards…"
            className="mb-3 w-full rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
          />

          <div className="max-h-80 overflow-y-auto rounded-md border border-slate-800 bg-slate-950/70">
            {searchResults.length === 0 ? (
              <div className="px-3 py-3 text-xs text-slate-400">
                No cards match that search.
              </div>
            ) : (
              <ul className="divide-y divide-slate-900/80 text-sm">
                {searchResults.map((card) => (
                  <li
                    key={card.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-slate-900/80"
                  >
                    <img
                      src={card.images.small}
                      alt={card.name}
                      loading="lazy"
                      className="h-12 w-auto rounded"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-slate-100">
                        {card.name}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {getOgnCode(card) ??
                          card.number ??
                          '—'}{' '}
                        {card.cardType && (
                          <>
                            {' '}
                            • <span>{card.cardType}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddCard(card)}
                      className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow hover:bg-amber-400"
                    >
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Deck list + sideboard */}
        <div className="space-y-4">
          {/* Main deck list */}
          <div className="rounded-xl border border-amber-500/40 bg-slate-900/60 p-4 shadow-md">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-amber-200">
                Main Deck
              </h2>
              <button
                type="button"
                onClick={handleClearDeck}
                className="text-xs text-slate-400 hover:text-red-300"
              >
                Clear main + sideboard
              </button>
            </div>

            {deckCards.length === 0 ? (
              <div className="rounded border border-dashed border-slate-700 px-3 py-4 text-sm text-slate-400">
                No cards yet. Use the search on the left or import
                from a list (Import button).
              </div>
            ) : (
              <ul className="max-h-52 overflow-y-auto text-sm">
                {deckCards.map((entry) => {
                  const isLegend = legendCardId === entry.card.id;
                  const isChampion =
                    championCardId === entry.card.id;

                  return (
                    <li
                      key={entry.card.id}
                      className="flex items-center justify-between gap-2 border-b border-slate-900/70 py-1 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-slate-100">
                          {entry.card.name}
                        </div>
                        <div className="text-[11px] text-slate-400">
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
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          value={entry.quantity}
                          onChange={(e) =>
                            handleChangeQuantityMain(
                              entry.card.id,
                              Number(e.target.value) || 0,
                            )
                          }
                          className="w-16 rounded-md border border-slate-700 bg-slate-900/80 px-2 py-1 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Sideboard list */}
          <div className="rounded-xl border border-amber-500/40 bg-slate-900/60 p-4 shadow-md">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-amber-200">
                Sideboard
              </h2>
            </div>

            {sideboardCards.length === 0 ? (
              <div className="rounded border border-dashed border-slate-700 px-3 py-4 text-sm text-slate-400">
                No sideboard cards yet. Switch to the Sideboard tab in
                &quot;Add Cards&quot; to add some.
              </div>
            ) : (
              <ul className="max-h-52 overflow-y-auto text-sm">
                {sideboardCards.map((entry) => (
                  <li
                    key={entry.card.id}
                    className="flex items-center justify-between gap-2 border-b border-slate-900/70 py-1 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-slate-100">
                        {entry.card.name}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {getOgnCode(entry.card) ??
                          entry.card.number ??
                          '—'}
                      </div>
                    </div>
                    <input
                      type="number"
                      min={0}
                      value={entry.quantity}
                      onChange={(e) =>
                        handleChangeQuantitySideboard(
                          entry.card.id,
                          Number(e.target.value) || 0,
                        )
                      }
                      className="w-16 rounded-md border border-slate-700 bg-slate-900/80 px-2 py-1 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Import modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="relative w-full max-w-lg rounded-xl border border-amber-500/40 bg-slate-950/95 p-5 shadow-2xl">
            <button
              type="button"
              onClick={() => setShowImportModal(false)}
              className="absolute right-3 top-3 text-sm text-slate-400 hover:text-slate-100"
              aria-label="Close"
            >
              ×
            </button>
            <h2 className="mb-2 text-lg font-semibold text-amber-200">
              Import Deck
            </h2>
            <p className="mb-2 text-xs text-slate-300">
              Paste a list like:
            </p>
            <pre className="mb-2 rounded bg-slate-800/80 p-2 text-[11px] text-slate-100">
{`1 Viktor - Herald of the Arcane (OGN-265)
7 Order Rune (OGN-214)
3 Faithful Manufactor (OGN-211)
3 Watchful Sentry OGN-096/298`}
            </pre>

            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={8}
              className="w-full rounded-md border border-slate-700 bg-slate-900/80 p-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
              placeholder="Paste deck list here..."
            />

            {importErrors.length > 0 && (
              <div className="mt-2 max-h-24 overflow-y-auto rounded border border-red-500/60 bg-red-950/50 px-2 py-1.5 text-[11px] text-red-200">
                {importErrors.map((err) => (
                  <div key={err}>{err}</div>
                ))}
              </div>
            )}

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const ok = handleImport();
                  if (ok) {
                    setShowImportModal(false);
                    setImportText('');
                  }
                }}
                className="rounded-md bg-amber-500 px-4 py-1.5 text-xs font-semibold text-slate-950 shadow hover:bg-amber-400"
              >
                Import into Main Deck
              </button>
            </div>
          </div>
        </div>
      )}

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
                      '[CreateDeckPage] copy failed',
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
    </section>
  );
}

export default CreateDeckPage;
