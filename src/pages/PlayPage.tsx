// src/pages/PlayPage.tsx
function PlayPage() {
  return (
    <section>
      <h1 className="text-3xl font-semibold text-amber-300 mb-4">Play</h1>
      <p className="text-slate-300 mb-6">
        This is where you&apos;ll create lobbies, invite friends, and start your Riftbound matches.
      </p>

      <div className="rounded-xl border border-amber-500/40 bg-slate-900/60 p-6 shadow-md">
        <h2 className="text-xl font-semibold text-amber-200 mb-2">Create Lobby</h2>
        <p className="text-slate-300 text-sm mb-4">
          Lobby creation UI will go here. You&apos;ll be able to host a game, share a code, and manage players.
        </p>
        <button
          type="button"
          className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow hover:bg-amber-400"
        >
          Create Lobby (placeholder)
        </button>
      </div>
    </section>
  )
}

export default PlayPage
