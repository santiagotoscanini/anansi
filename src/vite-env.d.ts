/// <reference types="vite/client" />

// Gives TypeScript the ambient module declarations for Vite's asset imports —
// specifically the `?url` suffix that src/routes/__root.tsx uses to get the
// hashed href for globals.css and fonts.css. Without this, those imports are
// a "cannot find module" error even though they resolve fine at build time.
