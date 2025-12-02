// src/pages/DecksPage.tsx
function DecksPage() {
  return (
    <section>
      <h1 className="text-3xl font-semibold text-amber-300 mb-4">Decks</h1>
      <p className="text-slate-300 mb-6">
        Build, edit, and import your Riftbound decks here.
      </p>

      <div className="grid gap-6 md:grid-cols-[2fr,3fr]">
        {/* Deck import panel */}
        <div className="rounded-xl border border-amber-500/40 bg-slate-900/60 p-5 shadow-md">
          <h2 className="text-lg font-semibold text-amber-200 mb-2">Import Deck</h2>
          <p className="text-sm text-slate-300 mb-3">
            Paste a deck list to import it. We&apos;ll parse lines like:
          </p>
          <pre className="mb-3 rounded bg-slate-800/80 p-2 text-xs text-slate-200">
            3 Faithful Manufactor (OGN-211)
          </pre>
          <textarea
            className="w-full rounded-md border border-slate-700 bg-slate-900/70 p-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
            placeholder="Paste deck list here..."
            rows={10}
          />
          <button
            type="button"
            className="mt-3 inline-flex items-center rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow hover:bg-amber-400"
          >
            Import Deck (placeholder)
          </button>
        </div>

        {/* Deck list panel */}
        <div className="rounded-xl border border-amber-500/40 bg-slate-900/60 p-5 shadow-md">
          <h2 className="text-lg font-semibold text-amber-200 mb-2">Your Decks</h2>
          <p className="text-sm text-slate-300 mb-4">
            Once we hook up Firebase, your saved decks will appear here.
          </p>
          <div className="rounded border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">
            No decks yet. Create or import one to get started.
          </div>
        </div>
      </div>
    </section>
  )
}

export default DecksPage
