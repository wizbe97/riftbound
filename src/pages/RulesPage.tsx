// src/pages/RulesPage.tsx
function RulesPage() {
  return (
    <section className="h-[calc(100vh-6rem-3rem)] flex flex-col">
      <h1 className="text-3xl font-semibold text-amber-300 mb-4">Rules</h1>
      <p className="text-slate-300 mb-4 text-sm">
        This tab will display the official Riftbound rules PDF. For now, we&apos;re just wiring the layout.
      </p>

      <div className="flex-1 rounded-xl border border-amber-500/40 bg-slate-900/70 overflow-hidden shadow-md">
        {/* Once you copy your PDF into /public/rules.pdf, uncomment the iframe */}
        {/* 
        <iframe
          src="/rules.pdf"
          title="Riftbound Rules"
          className="h-full w-full border-0"
        />
        */}
        <div className="flex h-full items-center justify-center text-slate-400 text-sm">
          PDF viewer placeholder – we&apos;ll wire /public/rules.pdf here.
        </div>
      </div>
    </section>
  )
}

export default RulesPage
