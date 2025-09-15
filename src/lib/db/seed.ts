import { db } from "../data/index";
import { users } from "../data/schema";

async function seed() {
  console.log("Seeding database...");

  // Insert the two users
  const insertedUsers = await db
    .insert(users)
    .values([
      { name: "Sofía Tejerina" },
      { name: "Santiago Toscanini" },
    ])
    .returning();

  console.log("Users created:", insertedUsers);

  console.log("Seeding completed!");
  process.exit(0);
}

seed().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});