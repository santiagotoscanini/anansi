// One-shot migration: move text notes off disk into the DB and replace
// goal-coupled `weekly_sync_item_files` rows with a polymorphic `attachments`
// row whose path is keyed only on user.
//
// Run after applying migration 0007. Idempotent — safe to re-run; each
// weekly_sync_item_files row is deleted in the same transaction that creates
// its replacement, so re-running on a partial state just picks up whatever
// remained.
//
// Usage: npx tsx scripts/migrate-sync-storage.ts
//
// What it does, per row in weekly_sync_item_files:
//   - If filename is "notes.txt": read the file, write its UTF-8 content into
//     weekly_sync_items.text_content, delete the row + unlink the file.
//   - Otherwise: create an attachments row keyed on (user_id, 'weekly_sync_item',
//     weekly_sync_item_id) with new storage_path uploads/{userId}/attachments/{id}.{ext},
//     move the file from its old location, delete the legacy row.
// At the end, prune empty subdirectories under uploads/{userId} that the old
// goal/date/tracking-item path scheme leaves behind.

import "dotenv/config";
import path from "node:path";
import fs from "node:fs/promises";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import * as schema from "../src/lib/data/schema";

const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function pruneEmptyDirs(root: string): Promise<void> {
  if (!(await exists(root))) return;
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const child = path.join(root, entry.name);
      await pruneEmptyDirs(child);
      const remaining = await fs.readdir(child);
      if (remaining.length === 0) await fs.rmdir(child);
    }
  }
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");

  const client = postgres(dbUrl, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  // Gather rows to migrate, joined with their owning user_id.
  const rows = await db
    .select({
      fileId: schema.weeklySyncItemFiles.id,
      filePath: schema.weeklySyncItemFiles.filePath,
      fileType: schema.weeklySyncItemFiles.fileType,
      weeklySyncItemId: schema.weeklySyncItemFiles.weeklySyncItemId,
      userId: schema.weeklySync.userId,
    })
    .from(schema.weeklySyncItemFiles)
    .innerJoin(
      schema.weeklySyncItems,
      eq(schema.weeklySyncItems.id, schema.weeklySyncItemFiles.weeklySyncItemId),
    )
    .innerJoin(schema.weeklySync, eq(schema.weeklySync.id, schema.weeklySyncItems.weeklySyncId));

  console.log(`Found ${rows.length} weekly_sync_item_files row(s) to migrate.`);

  let textMigrated = 0;
  let textMissingOnDisk = 0;
  let attachmentsCreated = 0;
  let binariesMissingOnDisk = 0;
  const usersTouched = new Set<string>();

  for (const row of rows) {
    usersTouched.add(row.userId);
    const oldDiskPath = path.join(UPLOADS_ROOT, row.filePath);
    const isText = path.basename(row.filePath) === "notes.txt";

    if (isText) {
      let content = "";
      if (await exists(oldDiskPath)) {
        content = await fs.readFile(oldDiskPath, "utf-8");
      } else {
        textMissingOnDisk++;
        console.warn(`  ! notes.txt missing on disk: ${row.filePath} — saving empty string`);
      }

      await db.transaction(async (tx) => {
        await tx
          .update(schema.weeklySyncItems)
          .set({ textContent: content })
          .where(eq(schema.weeklySyncItems.id, row.weeklySyncItemId));
        await tx
          .delete(schema.weeklySyncItemFiles)
          .where(eq(schema.weeklySyncItemFiles.id, row.fileId));
      });

      if (await exists(oldDiskPath)) await fs.unlink(oldDiskPath);
      textMigrated++;
      continue;
    }

    // Binary file → move and create an attachments row.
    const originalFileName = path.basename(row.filePath);
    const ext = path.extname(originalFileName);
    const attachmentId = createId();
    const newRelPath = path.join(row.userId, "attachments", `${attachmentId}${ext}`);
    const newDiskPath = path.join(UPLOADS_ROOT, newRelPath);

    let sizeBytes: number | null = null;

    if (await exists(oldDiskPath)) {
      await fs.mkdir(path.dirname(newDiskPath), { recursive: true });
      await fs.rename(oldDiskPath, newDiskPath);
      const stat = await fs.stat(newDiskPath);
      sizeBytes = stat.size;
    } else {
      binariesMissingOnDisk++;
      console.warn(`  ! binary missing on disk: ${row.filePath} — creating attachments row anyway`);
    }

    await db.transaction(async (tx) => {
      await tx.insert(schema.attachments).values({
        id: attachmentId,
        userId: row.userId,
        parentType: "weekly_sync_item",
        parentId: row.weeklySyncItemId,
        fileName: originalFileName,
        fileType: row.fileType,
        storagePath: newRelPath,
        sizeBytes,
      });
      await tx
        .delete(schema.weeklySyncItemFiles)
        .where(eq(schema.weeklySyncItemFiles.id, row.fileId));
    });

    attachmentsCreated++;
  }

  // Prune empty {userId}/{goalId}/... directories left behind.
  for (const userId of usersTouched) {
    const userDir = path.join(UPLOADS_ROOT, userId);
    await pruneEmptyDirs(userDir);
  }

  console.log("");
  console.log("Migration complete.");
  console.log(`  text notes migrated  : ${textMigrated}`);
  console.log(`  attachments created  : ${attachmentsCreated}`);
  console.log(`  text missing on disk : ${textMissingOnDisk}`);
  console.log(`  binaries missing     : ${binariesMissingOnDisk}`);
  console.log(`  users touched        : ${usersTouched.size}`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
