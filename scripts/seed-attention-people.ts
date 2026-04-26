// Seed one person per "needs attention" state on Pulse so the UI can be
// verified visually. Idempotent — safe to re-run; it deletes prior seed
// rows by matching the marker prefix in `name` before re-inserting.
//
// Run with: npx tsx scripts/seed-attention-people.ts
import { eq, like, and } from "drizzle-orm";
import { db } from "../src/lib/data";
import { people, users } from "../src/lib/data/schema";

const DEV_EMAIL = "santi@test.local";
const MARKER = "[seed]";

async function main() {
  const [user] = await db.select().from(users).where(eq(users.email, DEV_EMAIL)).limit(1);
  if (!user) {
    console.error(`User ${DEV_EMAIL} not found. Sign up via the UI first.`);
    process.exit(1);
  }

  // Wipe any prior seed people (matched by name prefix), then re-insert.
  await db.delete(people).where(and(eq(people.userId, user.id), like(people.name, `${MARKER}%`)));

  const now = new Date();
  const days = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

  const rows = [
    {
      userId: user.id,
      name: `${MARKER} Overdue Olivia`,
      emoji: "🟥",
      category: "exploring" as const,
      decideBy: days(-3), // 3 days overdue
    },
    {
      userId: user.id,
      name: `${MARKER} Due-soon Diego`,
      emoji: "🟧",
      category: "exploring" as const,
      decideBy: days(5), // due in 5 days
    },
    {
      userId: user.id,
      name: `${MARKER} Open-ended Eva`,
      emoji: "⬜️",
      category: "exploring" as const,
      decideBy: null, // exploring without a decide-by
    },
    {
      userId: user.id,
      name: `${MARKER} Inbox Iris`,
      emoji: "📥",
      category: "to_process" as const,
      decideBy: null,
    },
  ];

  await db.insert(people).values(rows);
  console.log(`Seeded ${rows.length} attention-state people for ${DEV_EMAIL}.`);
  rows.forEach((r) => console.log(` - ${r.name} (${r.category}${r.decideBy ? `, decideBy=${r.decideBy.toISOString().slice(0, 10)}` : ""})`));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
