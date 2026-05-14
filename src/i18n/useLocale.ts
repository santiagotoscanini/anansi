"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { api } from "~/trpc/react";
import { FALLBACK_LOCALE, SUPPORTED_LOCALES, type Locale } from "./config";

// Locale storage rules:
//   - localStorage (`anansi:locale`) is the source of truth for unauthenticated
//     users and is what the i18next browser detector reads on first render.
//   - When the user is authenticated, the DB column `users.locale` becomes
//     authoritative: on every auth.me success we mirror the DB value into
//     i18next (and thus into localStorage), and on user-initiated changes we
//     write through to the DB so the choice follows them across devices.
//
// Why the useEffect's deps array deliberately excludes `current`: the effect
// runs after every render, and `current` flips the moment i18next changes
// language. If `current` were a dep, clicking the picker would synchronously
// trigger:
//   1. i18n.changeLanguage(next)   — language updates, all useTranslation
//                                    subscribers re-render
//   2. effect re-runs (deps changed via `current`)
//   3. effect reads the still-cached meQuery.data.locale (the OLD value) and
//      reverts the language back to it
// The user reported this as "clicking does nothing": the flip happens but
// is immediately clobbered a few ms later. Gating the effect on
// `meQuery.data?.locale` only — combined with optimistically updating the
// query cache from the mutation — means DB→client only fires when the DB
// value actually changes, never as a side effect of a local change.
export function useLocale() {
  const { i18n } = useTranslation();
  const current = (i18n.resolvedLanguage ?? i18n.language ?? FALLBACK_LOCALE) as Locale;
  const utils = api.useUtils();

  const meQuery = api.auth.me.useQuery(undefined, { retry: false });
  const setLocaleMutation = api.auth.setLocale.useMutation({
    onSuccess: (updated) => {
      // Prime the auth.me cache with the new locale so the DB→client mirror
      // sees the value it just wrote and doesn't try to apply a stale "old"
      // value on its next pass.
      utils.auth.me.setData(undefined, (old) => (old ? { ...old, ...updated } : old));
    },
  });
  // Guard against re-applying the same DB value across query refetches.
  const lastAppliedFromDb = useRef<string | null>(null);

  useEffect(() => {
    const dbLocale = meQuery.data?.locale;
    if (!dbLocale) return;
    if (dbLocale === lastAppliedFromDb.current) return;
    const isSupported = SUPPORTED_LOCALES.some((l) => l.code === dbLocale);
    if (!isSupported) return;
    if (dbLocale !== i18n.resolvedLanguage) {
      void i18n.changeLanguage(dbLocale);
    }
    lastAppliedFromDb.current = dbLocale;
  }, [meQuery.data?.locale, i18n]);

  const setLocale = (next: Locale) => {
    void i18n.changeLanguage(next);
    // For authenticated users, write through to the DB. The mutation's
    // onSuccess updates the query cache, which keeps the ref guard in sync
    // and prevents the DB→client effect from firing again on the same value.
    if (meQuery.data) {
      lastAppliedFromDb.current = next;
      setLocaleMutation.mutate({ locale: next });
    }
  };

  return {
    locale: current,
    setLocale,
    supported: SUPPORTED_LOCALES,
  };
}
