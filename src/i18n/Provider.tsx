"use client";

import { useState, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "./config";
import { SUPPORTED_LOCALES, type Locale } from "./constants";

// Synchronous SSR locale handshake. The server reads the `anansi:locale`
// cookie in src/app/layout.tsx and passes its value (validated) as
// `initialLocale`. We apply it via `useState`'s initializer function — which
// runs once, BEFORE the first render commits — so the very first SSR pass
// and the matching client hydration both see the same i18next.language. No
// flash, no hydration mismatch warning.
//
// For users with no cookie yet, initialLocale is undefined and i18next stays
// at its fallback ("en") for SSR; the browser detector's localStorage check
// can still flip the language post-hydration, which manifests only as a
// regular state update (not a hydration error).
export default function I18nProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  // useState initializer fires once per component mount before render.
  // Bundled resources mean changeLanguage's actual language switch is
  // synchronous; the returned promise resolves later but the language is
  // already set when t() is called from children below.
  useState(() => {
    if (!initialLocale) return null;
    const isSupported = SUPPORTED_LOCALES.some((l) => l.code === initialLocale);
    if (!isSupported) return null;
    if (i18n.resolvedLanguage !== initialLocale) {
      void i18n.changeLanguage(initialLocale);
    }
    return null;
  });

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
