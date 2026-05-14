"use client";

import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface GraphMathHelpModalProps {
  onClose: () => void;
}

const sectionTitle = "text-sm font-medium text-[var(--ink)]";
const equation =
  "overflow-x-auto whitespace-pre rounded-md border border-[var(--hairline)] bg-[var(--vellum)] px-3 py-2 font-mono text-xs text-[var(--ink)]";
const muted = "text-xs leading-relaxed text-[var(--ink-3)]";
const exampleHeader = "text-[10px] uppercase tracking-wider text-[var(--ink-3)]";

export default function GraphMathHelpModal({ onClose }: GraphMathHelpModalProps) {
  const { t } = useTranslation();
  return (
    <div
      className="bg-[var(--ink)]/80 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--hairline)] bg-[var(--canvas)] shadow-2xl backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--hairline)] bg-[var(--canvas)] px-6 py-4 backdrop-blur">
          <div>
            <h2 className="text-lg font-medium tracking-tight">{t("graphMathHelp.title")}</h2>
            <p className="mt-0.5 text-xs text-[var(--ink-3)]">{t("graphMathHelp.subtitle")}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--ink-3)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-7 px-6 py-6">
          {/* Own progress */}
          <section className="space-y-2">
            <h3 className={sectionTitle}>{t("graphMathHelp.ownTitle")}</h3>
            <div className={equation}>{t("graphMathHelp.ownFormula")}</div>
            <p className={muted}>
              {t("graphMathHelp.ownExplanation1")} <strong>{t("graphMathHelp.ownExplanation2")}</strong>
              {t("graphMathHelp.ownExplanation3")} <em>{t("graphMathHelp.ownExplanation4")}</em>{" "}
              {t("graphMathHelp.ownExplanation5")}
            </p>
            <div className="rounded-md border border-[var(--hairline)] bg-[var(--vellum)] p-3 text-xs">
              <div className={exampleHeader}>{t("graphMathHelp.exampleHeader")}</div>
              <p className="mt-1 text-[var(--ink-2)]">
                {t("graphMathHelp.ownExample")}
                <br />
                <span className="font-mono text-[var(--ink)]">{t("graphMathHelp.ownExampleResult")}</span>
              </p>
            </div>
          </section>

          {/* Dependencies progress */}
          <section className="space-y-2">
            <h3 className={sectionTitle}>{t("graphMathHelp.depsTitle")}</h3>
            <div className={equation}>{t("graphMathHelp.depsFormula")}</div>
            <p className={muted}>
              {t("graphMathHelp.depsExplanation1")} <em>{t("graphMathHelp.depsExplanation2")}</em>
              {t("graphMathHelp.depsExplanation3")} <strong>{t("graphMathHelp.depsExplanation4")}</strong>{" "}
              {t("graphMathHelp.depsExplanation5")}
            </p>
            <div className="rounded-md border border-[var(--hairline)] bg-[var(--vellum)] p-3 text-xs">
              <div className={exampleHeader}>{t("graphMathHelp.exampleHeader")}</div>
              <p className="mt-1 text-[var(--ink-2)]">
                {t("graphMathHelp.depsExample")}
                <br />
                <span className="font-mono text-[var(--ink)]">{t("graphMathHelp.depsExampleResult")}</span>
              </p>
            </div>
          </section>

          {/* Total progress blend */}
          <section className="space-y-2">
            <h3 className={sectionTitle}>{t("graphMathHelp.totalTitle")}</h3>
            <div className={equation}>{t("graphMathHelp.totalFormula")}</div>
            <p className={muted}>
              {t("graphMathHelp.totalExplanation1")} <strong>{t("graphMathHelp.totalExplanation2")}</strong>{" "}
              {t("graphMathHelp.totalExplanation3")}
            </p>
          </section>

          {/* Importance */}
          <section className="space-y-2">
            <h3 className={sectionTitle}>{t("graphMathHelp.importanceTitle")}</h3>
            <div className={equation}>{t("graphMathHelp.importanceFormula")}</div>
            <p className={muted}>
              {t("graphMathHelp.importanceExplanation1")} <em>{t("graphMathHelp.importanceExplanation2")}</em>
              {t("graphMathHelp.importanceExplanation3")}
            </p>
          </section>

          {/* MiniMap colors */}
          <section className="space-y-2">
            <h3 className={sectionTitle}>{t("graphMathHelp.miniMapTitle")}</h3>
            <div className={equation}>{t("graphMathHelp.miniMapFormula")}</div>
            <p className={muted}>
              {t("graphMathHelp.miniMapExplanation1")} <strong>{t("graphMathHelp.miniMapExplanation2")}</strong>{" "}
              {t("graphMathHelp.miniMapExplanation3")}
            </p>
          </section>

          {/* Rationale */}
          <section className="space-y-2 border-t border-[var(--hairline)] pt-5">
            <h3 className={sectionTitle}>{t("graphMathHelp.rationaleTitle")}</h3>
            <p className={muted}>{t("graphMathHelp.rationaleIntro")}</p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-3)]">
              <li>
                <strong className="text-[var(--ink-2)]">{t("graphMathHelp.rationaleConnectionsHeader")}</strong>{" "}
                {t("graphMathHelp.rationaleConnectionsBody")}
              </li>
              <li>
                <strong className="text-[var(--ink-2)]">{t("graphMathHelp.rationaleDifficultyHeader")}</strong>{" "}
                {t("graphMathHelp.rationaleDifficultyBody")}
              </li>
            </ul>
          </section>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-end border-t border-[var(--hairline)] bg-[var(--canvas)] px-6 py-3 backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-4 py-1.5 text-sm text-[var(--ink)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
          >
            {t("graphMathHelp.gotIt")}
          </button>
        </div>
      </div>
    </div>
  );
}
