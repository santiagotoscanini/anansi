// Per-person actionable items — a gift, a gesture, a check-in, an apology.
// Captured when noticed, not when needed. Completed bids stay visible (struck
// through) rather than disappearing: the trail is the point.
//
// Bids carry no user_id; ownership is proven by joining back to `people`.
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "~/lib/data";
import { nextBids, people } from "~/lib/data/schema";
import type { CreateNextBid, SetNextBidCompleted, UpdateNextBid } from "~/lib/api/types";
import { AppError } from "./errors";
import { assertOwnsPerson, ownsPerson } from "./people";

/** Throws NOT_FOUND unless the bid's person belongs to the user. */
async function assertOwnsBid(userId: string, id: string) {
  const [row] = await db
    .select({ id: nextBids.id })
    .from(nextBids)
    .innerJoin(people, eq(nextBids.personId, people.id))
    .where(and(eq(nextBids.id, id), eq(people.userId, userId)))
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND", "Bid not found or access denied");
}

export async function list(userId: string, personId: string) {
  // Verify the person belongs to the user before returning rows.
  if (!(await ownsPerson(userId, personId))) return [];
  return await db.select().from(nextBids).where(eq(nextBids.personId, personId)).orderBy(asc(nextBids.createdAt));
}

export async function create(userId: string, input: CreateNextBid) {
  await assertOwnsPerson(userId, input.personId);
  const [created] = await db
    .insert(nextBids)
    .values({
      personId: input.personId,
      content: input.content,
      dueAt: input.dueAt ?? null,
    })
    .returning();
  return created;
}

/** Patch semantics: only keys present in `input` are written. `dueAt: null` clears. */
export async function update(userId: string, input: UpdateNextBid) {
  await assertOwnsBid(userId, input.id);
  const patch: { content?: string; dueAt?: Date | null } = {};
  if (input.content !== undefined) patch.content = input.content;
  if (input.dueAt !== undefined) patch.dueAt = input.dueAt;
  const [updated] = await db.update(nextBids).set(patch).where(eq(nextBids.id, input.id)).returning();
  return updated;
}

export async function setCompleted(userId: string, input: SetNextBidCompleted) {
  await assertOwnsBid(userId, input.id);
  const [updated] = await db
    .update(nextBids)
    .set({ completedAt: input.completed ? new Date() : null })
    .where(eq(nextBids.id, input.id))
    .returning();
  return updated;
}

export async function remove(userId: string, id: string) {
  await assertOwnsBid(userId, id);
  await db.delete(nextBids).where(eq(nextBids.id, id));
  return { success: true };
}

/**
 * All upcoming open bids across the user's people, joined with the person's
 * name + emoji for inline rendering. Drives the unified Pulse "Upcoming" feed.
 *
 * `withinDays` defaults to 60 — wider than important dates (30) so bids without
 * a tight deadline still surface as the time approaches.
 */
export async function listUpcoming(userId: string, input?: { withinDays?: number }) {
  const days = input?.withinDays ?? 60;
  const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: nextBids.id,
      personId: nextBids.personId,
      content: nextBids.content,
      dueAt: nextBids.dueAt,
      completedAt: nextBids.completedAt,
      personName: people.name,
      personEmoji: people.emoji,
    })
    .from(nextBids)
    .innerJoin(people, eq(nextBids.personId, people.id))
    .where(and(eq(people.userId, userId), isNull(nextBids.completedAt), isNull(people.archivedAt)))
    .orderBy(asc(nextBids.dueAt));
  // Drizzle doesn't have a tidy "between" for nullable + bound, so filter in
  // JS — small N (per user, open bids only).
  return rows.filter((r) => r.dueAt !== null && r.dueAt.getTime() <= cutoff.getTime());
}
