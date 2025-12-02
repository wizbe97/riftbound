// src/pages/DecksPage.tsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  type Timestamp,
  doc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { ALL_CARDS } from '../data/riftboundCards';
import type { RiftboundCard } from '../data/riftboundCards';
import cardBack from '../assets/riftbound-back-of-card.png';

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

type DeckSummary = {
  id: string;
  name: string;
  cardCount: number;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  legendCardId?: string | null;
};

function DecksPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Delete modal state
  const [deckToDelete, setDeckToDelete] = useState<DeckSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const cardById = useMemo(() => {
    const map = new Map<string, RiftboundCard>();
    for (const card of ALL_CARDS) {
      map.set(card.id, card);
    }
    return map;
  }, []);

  useEffect(() => {
    if (!user) {
      setDecks([]);
      setLoading(false);
      return;
    }

    const decksRef = collection(db, 'users', user.uid, 'decks');
    const q = query(decksRef, orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: DeckSummary[] = snap.docs.map((d) => {
          const data = d.data() as DeckDoc;

          const mainCount = (data.cards ?? []).reduce(
            (sum, c) => sum + (c.quantity ?? 0),
            0,
          );
          const sideCount = (data.sideboard ?? []).reduce(
            (sum, c) => sum + (c.quantity ?? 0),
            0,
          );

          return {
            id: d.id,
            name: data.name ?? 'Untitled Deck',
            cardCount: mainCount + sideCount,
            createdAt: data.createdAt ? data.createdAt.toDate() : null,
            updatedAt: data.updatedAt ? data.updatedAt.toDate() : null,
            legendCardId: data.legendCardId ?? null,
          };
        });
        setDecks(list);
        setLoading(false);
      },
      (err) => {
        console.error('[DecksPage] failed to load decks', err);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [user]);

  const handleBrowseCards = () => {
    navigate('/cards');
  };

  const handleCreateDeck = () => {
    navigate('/decks/create');
  };

  const handleViewDeck = (deckId: string) => {
    navigate(`/decks/${deckId}`);
  };

  const handleEditDeck = (deckId: string) => {
    navigate(`/decks/${deckId}/edit`);
  };

  const handleOpenDeleteModal = (deck: DeckSummary) => {
    setDeckToDelete(deck);
    setDeleteError(null);
  };

  const handleCloseDeleteModal = () => {
    if (deleting) return;
    setDeckToDelete(null);
    setDeleteError(null);
  };

  const handleConfirmDelete = async () => {
    if (!user || !deckToDelete) return;

    try {
      setDeleting(true);
      setDeleteError(null);
      const deckRef = doc(db, 'users', user.uid, 'decks', deckToDelete.id);
      await deleteDoc(deckRef);
      setDeckToDelete(null);
    } catch (err) {
      console.error('[DecksPage] failed to delete deck', err);
      setDeleteError('Failed to delete deck. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="mb-1 text-3xl font-semibold text-amber-300">
            Decks
          </h1>
          <p className="text-sm text-slate-300">
            Build, import, manage, and delete your Riftbound decks.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleBrowseCards}
            className="inline-flex items-center rounded-md border border-amber-500/60 bg-slate-900/80 px-4 py-2 text-sm font-semibold text-amber-200 shadow hover:bg-slate-800"
          >
            Browse Cards
          </button>
          <button
            type="button"
            onClick={handleCreateDeck}
            className="inline-flex items-center rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow hover:bg-amber-400"
          >
            Create Deck
          </button>
        </div>
      </div>

      {!user && (
        <div className="rounded-xl border border-amber-500/40 bg-slate-900/60 p-5 text-sm text-slate-300">
          You need an account to save decks.{' '}
          <Link to="/profile" className="text-amber-300 underline">
            Create an account or sign in
          </Link>{' '}
          first.
        </div>
      )}

      <div className="rounded-xl border border-amber-500/40 bg-slate-900/60 p-5 shadow-md">
        <h2 className="mb-3 text-lg font-semibold text-amber-200">
          Your Decks
        </h2>

        {loading ? (
          <p className="text-sm text-slate-300">Loading decks…</p>
        ) : !user ? (
          <p className="text-sm text-slate-400">
            Once you&apos;re signed in, your saved decks will appear here.
          </p>
        ) : decks.length === 0 ? (
          <p className="text-sm text-slate-400">
            You don&apos;t have any decks yet. Click{' '}
            <strong>Create Deck</strong> to start a new one or import from a
            list.
          </p>
        ) : (
          <ul className="divide-y divide-slate-800 text-sm">
            {decks.map((deck) => {
              const legendCard =
                deck.legendCardId &&
                cardById.get(deck.legendCardId);

              return (
                <li
                  key={deck.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-14 w-10 flex-shrink-0">
                      {legendCard ? (
                        <img
                          src={legendCard.images.small}
                          alt={legendCard.name}
                          className="h-14 w-auto rounded-md border border-amber-500/60 bg-slate-950 object-cover"
                        />
                      ) : (
                        <img
                          src={cardBack}
                          alt="Legend back"
                          className="h-14 w-auto rounded-md border border-slate-700 bg-slate-900 object-cover"
                        />
                      )}
                    </div>
                    <div>
                      <div className="text-slate-100">{deck.name}</div>
                      <div className="text-xs text-slate-400">
                        {deck.cardCount} cards
                        {deck.updatedAt && (
                          <>
                            {' • '}
                            Last updated{' '}
                            {deck.updatedAt.toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => handleViewDeck(deck.id)}
                      className="rounded-md border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:border-amber-400 hover:bg-slate-800"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditDeck(deck.id)}
                      className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow hover:bg-amber-400"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenDeleteModal(deck)}
                      className="rounded-md border border-red-500/70 bg-transparent px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-950/40"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Delete deck modal */}
      {deckToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="relative w-full max-w-sm rounded-xl border border-slate-700 bg-slate-950/95 p-5 shadow-2xl">
            <h2 className="mb-2 text-lg font-semibold text-amber-200">
              Delete deck
            </h2>
            <p className="mb-3 text-sm text-slate-200">
              Are you sure you want to delete{' '}
              <span className="font-semibold">
                {deckToDelete.name}
              </span>
              ? This action cannot be undone.
            </p>
            {deleteError && (
              <div className="mb-3 rounded border border-red-500/70 bg-red-950/60 px-2 py-1.5 text-xs text-red-200">
                {deleteError}
              </div>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseDeleteModal}
                disabled={deleting}
                className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="rounded-md bg-red-500 px-4 py-1.5 text-xs font-semibold text-slate-950 shadow hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? 'Deleting…' : 'Delete deck'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default DecksPage;
