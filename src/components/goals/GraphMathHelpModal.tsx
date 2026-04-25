"use client";

import { X } from "lucide-react";

interface GraphMathHelpModalProps {
  onClose: () => void;
}

const sectionTitle = "text-sm font-medium text-white";
const equation =
  "overflow-x-auto whitespace-pre rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-xs text-white/85";
const muted = "text-xs leading-relaxed text-white/55";
const exampleHeader = "text-[10px] uppercase tracking-wider text-white/40";

export default function GraphMathHelpModal({ onClose }: GraphMathHelpModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 bg-zinc-950/95 px-6 py-4 backdrop-blur">
          <div>
            <h2 className="text-lg font-medium tracking-tight">How the graph thinks</h2>
            <p className="mt-0.5 text-xs text-white/50">
              Every number on a node comes from a formula. Here&apos;s each one.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/50 transition-all hover:bg-white/5 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-7 px-6 py-6">
          {/* Own progress */}
          <section className="space-y-2">
            <h3 className={sectionTitle}>1 · Own progress (from tasks)</h3>
            <div className={equation}>own = Σ(completed.difficulty) / Σ(all.difficulty) × 100</div>
            <p className={muted}>
              Tasks have a difficulty of <strong>1, 2, or 3</strong>. A finished hard task contributes more to a
              goal&apos;s percentage than a finished easy one. If a goal has no tasks, its <em>own</em> progress is 0 by
              definition — completion has to come from somewhere upstream.
            </p>
            <div className="rounded-md border border-white/5 bg-white/[0.02] p-3 text-xs">
              <div className={exampleHeader}>Example</div>
              <p className="mt-1 text-white/70">
                Three tasks: difficulty 1 (done), 2 (done), 3 (not done). Total weight = 6, completed weight = 3.
                <br />
                <span className="font-mono text-white/85">own = 3 / 6 × 100 = 50%</span>
              </p>
            </div>
          </section>

          {/* Dependencies progress */}
          <section className="space-y-2">
            <h3 className={sectionTitle}>2 · Dependency progress (from upstream goals)</h3>
            <div className={equation}>deps = Σ(predTotal × edgeWeight) / Σ(edgeWeight)</div>
            <p className={muted}>
              An incoming connection means &ldquo;this goal&apos;s success depends on that one&apos;s.&rdquo; Edge
              weights say <em>how much</em>. Dependency progress is the weighted average of every predecessor&apos;s{" "}
              <strong>total progress</strong> (so the calculation cascades all the way back through the graph).
            </p>
            <div className="rounded-md border border-white/5 bg-white/[0.02] p-3 text-xs">
              <div className={exampleHeader}>Example</div>
              <p className="mt-1 text-white/70">
                Goal A depends on B (weight 70, 80% complete) and C (weight 30, 50% complete).
                <br />
                <span className="font-mono text-white/85">
                  deps = (80×70 + 50×30) / (70+30) = (5600 + 1500) / 100 = 71%
                </span>
              </p>
            </div>
          </section>

          {/* Total progress blend */}
          <section className="space-y-2">
            <h3 className={sectionTitle}>3 · Total progress (the blend)</h3>
            <div className={equation}>
              {`with own tasks:    total = own × 0.40 + deps × 0.60
without own tasks: total = own × 0.10 + deps × 0.90`}
            </div>
            <p className={muted}>
              When a goal has its own tasks, both numbers count — but dependencies still get the heavier vote (60%)
              because work doesn&apos;t happen in isolation. When a goal has <strong>no tasks of its own</strong> (a
              pure orchestration node, e.g., &ldquo;Stay healthy&rdquo;), it leans almost entirely on its dependencies.
              The clamp at the end keeps the result inside [0, 100].
            </p>
          </section>

          {/* Importance */}
          <section className="space-y-2">
            <h3 className={sectionTitle}>4 · Importance (from outgoing edge weights)</h3>
            <div className={equation}>
              {`avg = Σ(outgoingEdge.weight) / count(outgoingEdges)

Low      if no outgoing edges, OR avg ≤ 33.3
Medium   if 33.3 < avg < 66.6
High     if avg ≥ 66.6`}
            </div>
            <p className={muted}>
              A goal&apos;s importance isn&apos;t self-declared — it&apos;s read from how heavily{" "}
              <em>other goals depend on it</em>. A goal with strong outgoing edges (averaging high weight) is a
              load-bearing column in your structure. A goal nothing depends on is just a leaf.
            </p>
          </section>

          {/* MiniMap colors */}
          <section className="space-y-2">
            <h3 className={sectionTitle}>5 · MiniMap colors</h3>
            <div className={equation}>
              {`red    if total < 33%
yellow if 33% ≤ total < 67%
green  if total ≥ 67%`}
            </div>
            <p className={muted}>
              The minimap in the bottom-right shades each node by its <strong>total progress</strong> so you can scan
              the whole graph at once and see where the cold spots are.
            </p>
          </section>

          {/* Rationale */}
          <section className="space-y-2 border-t border-white/5 pt-5">
            <h3 className={sectionTitle}>Why model goals this way?</h3>
            <p className={muted}>
              The graph treats goals as a network, not a list. Two ideas drive every formula above:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-white/55">
              <li>
                <strong className="text-white/75">Connections carry meaning.</strong> An edge isn&apos;t decoration — it
                says &ldquo;this feeds that.&rdquo; Importance and dependency progress both fall out of the same edges;
                you only have to maintain one piece of structure.
              </li>
              <li>
                <strong className="text-white/75">Difficulty matters.</strong> Counting completed tasks alone treats a
                10-minute errand the same as a multi-week project. Weighting by difficulty makes percentages mean
                something closer to actual effort.
              </li>
            </ul>
          </section>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-end border-t border-white/5 bg-zinc-950/95 px-6 py-3 backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 bg-white/[0.03] px-4 py-1.5 text-sm text-white/80 transition-all hover:bg-white/10 hover:text-white"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
