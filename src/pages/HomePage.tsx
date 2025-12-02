// src/pages/HomePage.tsx

function HomePage() {
  return (
    <section className="flex flex-col gap-8 md:flex-row md:items-center">
      {/* Left: hero text */}
      <div className="flex-1">
        <h1 className="text-4xl md:text-5xl font-semibold text-amber-300 mb-4 tracking-wide">
          Welcome to <span className="text-amber-400">Riftbound Hub</span>
        </h1>
        <p className="text-slate-300 text-base md:text-lg mb-4">
          Play Riftbound online with friends, manage your decks, and keep up with the
          official rules – all in one place.
        </p>
        <p className="text-slate-400 text-sm md:text-base mb-6">
          Jump into a lobby, brew your next masterpiece deck, or see who&apos;s online and
          ready to play.
        </p>

        <div className="flex flex-wrap gap-3">
          <a
            href="/play"
            className="inline-flex items-center rounded-md bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow hover:bg-amber-400"
          >
            Play Now
          </a>
          <a
            href="/decks"
            className="inline-flex items-center rounded-md border border-amber-500/60 bg-slate-900/80 px-5 py-2.5 text-sm font-semibold text-amber-200 shadow-sm hover:bg-slate-800"
          >
            Manage Decks
          </a>
        </div>
      </div>

      {/* Right: simple card / placeholder */}
      <div className="flex-1">
        <div className="rounded-2xl border border-amber-500/50 bg-slate-900/70 p-6 shadow-2xl">
          <h2 className="text-xl font-semibold text-amber-200 mb-3">
            At a glance
          </h2>
          <ul className="space-y-2 text-sm text-slate-300">
            <li>• Create lobbies and play online with friends.</li>
            <li>• Build and import decks from text lists.</li>
            <li>• View official Riftbound rules directly in-app.</li>
            <li>• Keep track of your friends and who&apos;s online.</li>
            <li>• Join the community Discord with one click.</li>
          </ul>
        </div>
      </div>
    </section>
  )
}

export default HomePage
