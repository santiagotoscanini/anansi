// Goal importance is computed from the average weight of OUTGOING
// connections (edges where the goal is the source). The thresholds are
// canonical app-wide:
//   no edges     -> Low
//   avg ≤ 33.3   -> Low
//   33.3 < avg < 66.6 -> Medium
//   avg ≥ 66.6   -> High
//
// Previously inlined in three router endpoints (goals.getAll,
// data.getAll, weeklySync.getWeeklyRetrospectiveData) and once in the
// React context — keep this the single source of truth so a threshold
// change in one place can't drift from the others.

export type Importance = "Low" | "Medium" | "High";

interface ImportanceInput {
  source: string;
  weight: number;
}

export function computeImportance(connections: ReadonlyArray<ImportanceInput>, goalId: string): Importance {
  let sum = 0;
  let count = 0;
  for (const c of connections) {
    if (c.source !== goalId) continue;
    sum += c.weight;
    count++;
  }
  if (count === 0) return "Low";
  const avg = sum / count;
  if (avg <= 33.3) return "Low";
  if (avg < 66.6) return "Medium";
  return "High";
}
