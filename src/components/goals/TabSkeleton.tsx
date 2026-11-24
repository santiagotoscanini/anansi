// What a tab shows for the moment its data is still on the way: the shape of a
// page (eyebrow, title, a line of text, a few cards) in the paper's own tones,
// so the switch to the real page is a fill-in rather than a jump.
export function TabSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-12" aria-busy="true" aria-live="polite">
      <div className="animate-pulse space-y-4">
        <div className="h-3 w-32 rounded bg-[var(--hairline-2)]" />
        <div className="h-10 w-80 max-w-full rounded-lg bg-[var(--hairline-2)]" />
        <div className="h-4 w-[28rem] max-w-full rounded bg-[var(--hairline)]" />
        <div className="grid grid-cols-1 gap-4 pt-8 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-28 rounded-2xl border border-[var(--hairline)] bg-[var(--hairline)]" />
          ))}
        </div>
      </div>
    </div>
  )
}
