import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../data";
import { mcpAuthorizationCodes } from "../../data/schema";

// Authorization codes are single-use, 60-second-TTL, and bound to the exact
// (client_id, redirect_uri, code_challenge) tuple they were minted under.
// The code value IS the row id (a cuid2) — high-entropy, unguessable, and
// we skip a second column. `consumed_at` flips on first redemption so a
// replay attempt fails even before the TTL elapses.

const CODE_TTL_MS = 60_000;

export interface MintCodeInput {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
}

export async function mintAuthCode(input: MintCodeInput): Promise<string> {
  const [row] = await db
    .insert(mcpAuthorizationCodes)
    .values({
      clientId: input.clientId,
      userId: input.userId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: input.codeChallengeMethod,
      scope: input.scope,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    })
    .returning({ id: mcpAuthorizationCodes.id });
  if (!row) throw new Error("auth code insert returned no row");
  return row.id;
}

export interface ConsumedCode {
  userId: string;
  scope: string;
  codeChallenge: string;
  codeChallengeMethod: string;
}

// Atomic single-use consumption: UPDATE … SET consumed_at = now() WHERE id = ?
// AND consumed_at IS NULL — returns the row only if WE were the consumer.
// Two concurrent redemptions race here and exactly one wins. Also enforces
// (client_id, redirect_uri) equality at the same time — the spec requires
// these match what was sent on /authorize.
export async function consumeAuthCode(args: {
  code: string;
  clientId: string;
  redirectUri: string;
}): Promise<ConsumedCode | null> {
  const now = new Date();
  const [row] = await db
    .update(mcpAuthorizationCodes)
    .set({ consumedAt: now })
    .where(
      and(
        eq(mcpAuthorizationCodes.id, args.code),
        eq(mcpAuthorizationCodes.clientId, args.clientId),
        eq(mcpAuthorizationCodes.redirectUri, args.redirectUri),
        isNull(mcpAuthorizationCodes.consumedAt),
      ),
    )
    .returning();
  if (!row) return null;
  if (row.expiresAt <= now) return null; // expired, but we still consumed it — fine, single-use is preserved
  return {
    userId: row.userId,
    scope: row.scope,
    codeChallenge: row.codeChallenge,
    codeChallengeMethod: row.codeChallengeMethod,
  };
}
