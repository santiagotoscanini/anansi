import { ClientOnly } from '@tanstack/react-router'
import { Suspense, lazy } from 'react'
import type { EmojiClickData, Theme } from 'emoji-picker-react'

// The emoji picker, kept out of the SSR graph and out of the initial bundle.
//
// Two separate problems, and the fix for one does not fix the other:
//
//   1. `emoji-picker-react` touches browser globals at module scope, so it
//      cannot be rendered on the server. `ClientOnly` handles that.
//   2. Even behind a lazy boundary, importing its `Theme` ENUM would drag the
//      whole package back into the graph — an enum is a runtime value, not a
//      type, so `import { Theme }` is a real import that no amount of lazy
//      wrapping elides. `Theme.DARK` is the string "dark", so a TYPE-only
//      import of Theme plus a cast gives the same value with nothing left at
//      runtime. Every import in this file is erased at build time.
//
// The three modals that use this (goal, task, person) each render it inside an
// already-open popover, so there is no first-paint cost to the fallback.
const EmojiPicker = lazy(() => import('emoji-picker-react'))

export type { EmojiClickData }

export default function EmojiPickerLazy({
  onEmojiClick,
  searchPlaceHolder,
}: {
  onEmojiClick: (data: EmojiClickData) => void
  searchPlaceHolder: string
}) {
  // Fallback is sized to match the picker so opening it doesn't reflow the
  // popover it lives in.
  const placeholder = <div style={{ width: 350, height: 400 }} />

  return (
    <ClientOnly fallback={placeholder}>
      <Suspense fallback={placeholder}>
        {/* Theme is hardcoded dark, which is what all three modals passed
            before — the app's own theming is CSS-variable based and never fed
            the picker anything else. */}
        <EmojiPicker
          onEmojiClick={onEmojiClick}
          width={350}
          height={400}
          theme={'dark' as Theme}
          searchPlaceHolder={searchPlaceHolder}
        />
      </Suspense>
    </ClientOnly>
  )
}
