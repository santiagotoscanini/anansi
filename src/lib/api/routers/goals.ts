// Composing index — the actual procedure definitions live in
// src/lib/api/routers/goals/{values,goals,sync,people,self,backup}.ts.
// Kept here as a thin re-export so /api/root.ts continues to import
// `goalsRouter` from this path without further changes.
export { goalsRouter } from "./goals/index";
