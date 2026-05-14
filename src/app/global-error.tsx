"use client";

import { useTranslation } from "react-i18next";

// Importing the i18n config has the side effect of initializing the
// singleton — global-error.tsx renders ABOVE the I18nProvider (the root
// layout itself crashed), so we can't rely on it being in the tree.
import "~/i18n/config";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t, i18n } = useTranslation();
  return (
    <html lang={i18n.language || "en"}>
      <body>
        <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
          <h1>{t("globalError.title")}</h1>
          <button onClick={reset} style={{ marginTop: "1rem" }}>
            {t("globalError.tryAgain")}
          </button>
        </main>
      </body>
    </html>
  );
}
