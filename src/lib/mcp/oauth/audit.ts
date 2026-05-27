import { db } from "../../data";
import { mcpAuditLog } from "../../data/schema";

// Best-effort append to mcp_audit_log. NEVER throws — auditing is observability,
// not load-bearing. Logging "register" / "consent_granted" / "token_issued" /
// "token_refreshed" / "token_revoked" / "authorize_denied" gives us a paper
// trail for security investigations without leaking tokens (only ids).

export type AuditEvent =
  | "register"
  | "authorize_started"
  | "consent_granted"
  | "consent_auto"
  | "authorize_denied"
  | "token_issued"
  | "token_refreshed"
  | "token_refresh_failed"
  | "token_revoked";

export async function appendAudit(args: {
  event: AuditEvent;
  userId?: string | null;
  clientId?: string | null;
  ip?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(mcpAuditLog).values({
      event: args.event,
      userId: args.userId ?? null,
      clientId: args.clientId ?? null,
      ip: args.ip ?? null,
      meta: args.meta ? JSON.stringify(args.meta) : null,
    });
  } catch {
    // Swallow — audit failure must never break the auth flow.
  }
}
