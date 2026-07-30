// The single hydration endpoint the client boots from: values + goals +
// connections in one round trip.
//
// Shares loadGoalsForUser with the goals service rather than duplicating the
// six-query hydration — keep it that way, or the two drift.
import { eq } from "drizzle-orm";
import { db } from "~/lib/data";
import { values } from "~/lib/data/schema";
import { loadGoalsForUser } from "~/lib/data/queries/load-goals";

export async function getAll(userId: string) {
  // `values` is the only table this exposes that the goals payload doesn't,
  // so fetch it alongside rather than after.
  const [valuesData, loaded] = await Promise.all([
    db.select().from(values).where(eq(values.userId, userId)),
    loadGoalsForUser(userId),
  ]);
  return {
    values: valuesData,
    goals: loaded.goals,
    connections: loaded.connections,
  };
}
