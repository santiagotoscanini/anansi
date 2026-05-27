import { and, eq } from "drizzle-orm";
import { db } from "../../data";
import { mcpConsents } from "../../data/schema";

// Consent persistence — once a user has approved a (client_id) for a given
// scope, /authorize auto-approves subsequent hits without re-prompting. The
// row is dropped when the user revokes the grant, so the next reconnect
// forces a fresh consent screen ("forget me" semantics).

export async function hasExistingConsent(userId: string, clientId: string, scope: string): Promise<boolean> {
  const [row] = await db
    .select({ scope: mcpConsents.scope })
    .from(mcpConsents)
    .where(and(eq(mcpConsents.userId, userId), eq(mcpConsents.clientId, clientId)))
    .limit(1);
  if (!row) return false;
  // Auto-approve only if the previously-granted scope set is a superset of
  // what's being requested now. Narrower requests pass; broader requests
  // re-prompt. Compare as token sets, not raw strings.
  const granted = new Set(row.scope.split(/\s+/).filter(Boolean));
  const wanted = scope.split(/\s+/).filter(Boolean);
  return wanted.every((s) => granted.has(s));
}

export async function recordConsent(userId: string, clientId: string, scope: string): Promise<void> {
  // ON CONFLICT (user_id, client_id) DO UPDATE — keep the latest scope so a
  // re-consent that broadens scope persists the broader set.
  await db
    .insert(mcpConsents)
    .values({ userId, clientId, scope })
    .onConflictDoUpdate({
      target: [mcpConsents.userId, mcpConsents.clientId],
      set: { scope },
    });
}

export async function revokeConsent(userId: string, clientId: string): Promise<void> {
  await db.delete(mcpConsents).where(and(eq(mcpConsents.userId, userId), eq(mcpConsents.clientId, clientId)));
}
