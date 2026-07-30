// Full-fidelity backup: export everything the user owns (DB rows + file bytes),
// import wipes their data wholesale inside a transaction and rewrites it under
// the importing user's id.
//
// The format is strict — no back-compat shims. `version: 1` is the contract.
import { and, eq, inArray } from "drizzle-orm";
import { db } from "~/lib/data";
import {
  attachments,
  bucketListItemPeople,
  bucketListItems,
  connections,
  files,
  goalValues,
  goals,
  importantDates,
  nextBids,
  people,
  peopleToGroups,
  personGroups,
  selfListItems,
  syncTemplateItems,
  syncTemplates,
  taskReferents,
  tasks,
  tasksToGroups,
  trackingItems,
  userSelf,
  users,
  values,
  weeklySync,
  weeklySyncItems,
} from "~/lib/data/schema";
import { isEmojiGlyph, isOurStorageImageUrl } from "~/lib/emoji-utils";
import type { Backup } from "~/lib/api/types";
import { AppError } from "./errors";

/**
 * On import a backup is user-supplied JSON — never trust its emoji columns. An
 * emoji glyph or a URL we issued ourselves is accepted; anything else (an
 * external URL pasted under the old loose schema, a hand-edited backup) is
 * dropped to null. Same predicate as the live zod validator, so import policy
 * matches mutation policy.
 */
function safeEmoji(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (isEmojiGlyph(value) || isOurStorageImageUrl(value)) return value;
  return null;
}

/**
 * Strips the user-discriminator column from rows that carry one; the import
 * path re-inserts everything under the caller's own userId.
 */
function stripUser<T extends { userId?: string }>(row: T): Omit<T, "userId"> {
  const rest: Record<string, unknown> = { ...row };
  delete rest.userId;
  return rest as Omit<T, "userId">;
}

export async function exportAll(userId: string) {
  const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!userRow) throw new AppError("NOT_FOUND", "User not found");

  const valuesRows = await db.select().from(values).where(eq(values.userId, userId));
  const goalsRows = await db.select().from(goals).where(eq(goals.userId, userId));
  const goalIds = goalsRows.map((g) => g.id);

  const tasksRows = goalIds.length ? await db.select().from(tasks).where(inArray(tasks.goalId, goalIds)) : [];
  const connectionsRows = goalIds.length
    ? await db.select().from(connections).where(inArray(connections.source, goalIds))
    : [];
  const goalValuesRows = goalIds.length
    ? await db.select().from(goalValues).where(inArray(goalValues.goalId, goalIds))
    : [];

  // Tracking items are user-owned, so they're queried by userId, not goalId —
  // an unscoped item (goalId IS NULL) would otherwise be missed.
  const trackingItemsRows = await db.select().from(trackingItems).where(eq(trackingItems.userId, userId));
  const trackingItemIds = trackingItemsRows.map((t) => t.id);

  const weeklySyncRows = await db.select().from(weeklySync).where(eq(weeklySync.userId, userId));
  const weeklySyncIds = weeklySyncRows.map((ws) => ws.id);

  const weeklySyncItemsRows = weeklySyncIds.length
    ? await db.select().from(weeklySyncItems).where(inArray(weeklySyncItems.weeklySyncId, weeklySyncIds))
    : [];
  const weeklySyncItemIds = weeklySyncItemsRows.map((wsi) => wsi.id);

  const syncTemplateRows = await db.select().from(syncTemplates).where(eq(syncTemplates.userId, userId));
  const syncTemplateIds = syncTemplateRows.map((t) => t.id);

  const syncTemplateItemRows = syncTemplateIds.length
    ? await db.select().from(syncTemplateItems).where(inArray(syncTemplateItems.templateId, syncTemplateIds))
    : [];

  const attachmentRows = weeklySyncItemIds.length
    ? await db
        .select()
        .from(attachments)
        .where(
          and(
            eq(attachments.userId, userId),
            eq(attachments.parentType, "weekly_sync_item"),
            inArray(attachments.parentId, weeklySyncItemIds),
          ),
        )
    : [];

  const peopleRows = await db.select().from(people).where(eq(people.userId, userId));
  const [userSelfRow] = await db.select().from(userSelf).where(eq(userSelf.userId, userId)).limit(1);
  const personGroupRows = await db.select().from(personGroups).where(eq(personGroups.userId, userId));
  const personIds = peopleRows.map((p) => p.id);

  const peopleToGroupsRows = personIds.length
    ? await db.select().from(peopleToGroups).where(inArray(peopleToGroups.personId, personIds))
    : [];

  const nextBidsRows = personIds.length
    ? await db.select().from(nextBids).where(inArray(nextBids.personId, personIds))
    : [];

  const importantDateRows = personIds.length
    ? await db.select().from(importantDates).where(inArray(importantDates.personId, personIds))
    : [];

  const bucketListRows = await db.select().from(bucketListItems).where(eq(bucketListItems.userId, userId));
  const selfListItemRows = await db.select().from(selfListItems).where(eq(selfListItems.userId, userId));

  const bucketListItemPeopleRows = bucketListRows.length
    ? await db
        .select()
        .from(bucketListItemPeople)
        .where(
          inArray(
            bucketListItemPeople.bucketItemId,
            bucketListRows.map((b) => b.id),
          ),
        )
    : [];

  // The two task junctions carry no userId, so ownership comes from the join
  // back to tasks → goals.
  const taskReferentsRows = goalIds.length
    ? await db
        .select({
          id: taskReferents.id,
          taskId: taskReferents.taskId,
          personId: taskReferents.personId,
          createdAt: taskReferents.createdAt,
        })
        .from(taskReferents)
        .innerJoin(tasks, eq(taskReferents.taskId, tasks.id))
        .where(inArray(tasks.goalId, goalIds))
    : [];

  const tasksToGroupsRows = goalIds.length
    ? await db
        .select({
          id: tasksToGroups.id,
          taskId: tasksToGroups.taskId,
          groupId: tasksToGroups.groupId,
          createdAt: tasksToGroups.createdAt,
        })
        .from(tasksToGroups)
        .innerJoin(tasks, eq(tasksToGroups.taskId, tasks.id))
        .where(inArray(tasks.goalId, goalIds))
    : [];

  // Pull the underlying bytes for every attachment and base64-encode them.
  // A missing file row is skipped rather than fatal — a partial backup beats
  // no backup. attachments.fileId is NOT NULL, so this only happens if a file
  // was deleted out of band, which the API doesn't allow.
  const fileIds = attachmentRows.map((a) => a.fileId);
  const fileRows = fileIds.length
    ? await db.select({ id: files.id, data: files.data }).from(files).where(inArray(files.id, fileIds))
    : [];
  const fileById = new Map(fileRows.map((f) => [f.id, f] as const));
  const exportedFiles: { attachmentId: string; data: string }[] = [];
  for (const a of attachmentRows) {
    const f = fileById.get(a.fileId);
    if (!f) {
      console.warn(`[backup.export] missing file skipped for attachment ${a.id} (fileId ${a.fileId})`);
      continue;
    }
    exportedFiles.push({ attachmentId: a.id, data: Buffer.from(f.data).toString("base64") });
  }

  return {
    version: 1 as const,
    exportedAt: new Date(),
    user: { name: userRow.name, email: userRow.email },
    values: valuesRows.map(stripUser),
    goals: goalsRows.map(stripUser),
    tasks: tasksRows,
    connections: connectionsRows,
    goalValues: goalValuesRows,
    trackingItems: trackingItemsRows.map(stripUser),
    weeklySync: weeklySyncRows.map(stripUser),
    weeklySyncItems: weeklySyncItemsRows,
    syncTemplates: syncTemplateRows.map(stripUser),
    syncTemplateItems: syncTemplateItemRows,
    attachments: attachmentRows.map(stripUser),
    files: exportedFiles,
    people: peopleRows.map(stripUser),
    userSelf: userSelfRow ? stripUser(userSelfRow) : null,
    taskReferents: taskReferentsRows,
    personGroups: personGroupRows.map(stripUser),
    peopleToGroups: peopleToGroupsRows,
    tasksToGroups: tasksToGroupsRows,
    nextBids: nextBidsRows,
    importantDates: importantDateRows,
    bucketListItems: bucketListRows.map(stripUser),
    bucketListItemPeople: bucketListItemPeopleRows,
    selfListItems: selfListItemRows.map(stripUser),
    // Touched-but-unused — harmless extra context for a future v2 importer.
    // Part of the shipped payload shape, so it stays.
    _trackingItemIds: trackingItemIds,
  };
}

/**
 * Destructive: deletes everything the user owns, then rewrites it from the
 * backup. `confirmReplace` lives in the service signature rather than only in
 * the transport schema deliberately — the guard should travel with the
 * operation, so no future caller can trigger the wipe without opting in.
 *
 * The single transaction is the real safety property: the deletes and every
 * insert commit together or not at all, so a malformed payload that fails
 * halfway leaves the user's data exactly as it was.
 */
export async function importAll(userId: string, input: { backup: Backup; confirmReplace: boolean }) {
  if (input.confirmReplace !== true) {
    throw new AppError("BAD_REQUEST", "Refusing to replace data without confirmReplace");
  }
  const b = input.backup;

  await db.transaction(async (tx) => {
    // Nuke. Cascades handle the children: tasks, connections, goalValues,
    // weeklySyncItems, syncTemplateItems, attachments, etc.
    await tx.delete(goals).where(eq(goals.userId, userId));
    await tx.delete(values).where(eq(values.userId, userId));
    await tx.delete(weeklySync).where(eq(weeklySync.userId, userId));
    await tx.delete(syncTemplates).where(eq(syncTemplates.userId, userId));
    await tx.delete(trackingItems).where(eq(trackingItems.userId, userId));
    await tx.delete(attachments).where(eq(attachments.userId, userId));
    await tx.delete(people).where(eq(people.userId, userId));
    await tx.delete(userSelf).where(eq(userSelf.userId, userId));
    await tx.delete(selfListItems).where(eq(selfListItems.userId, userId));
    await tx.delete(personGroups).where(eq(personGroups.userId, userId));
    await tx.delete(bucketListItems).where(eq(bucketListItems.userId, userId));

    if (b.values.length) {
      await tx.insert(values).values(b.values.map((v) => ({ ...v, userId })));
    }

    // Goals go in with parentId nulled, then parents are fixed up in a second
    // pass — the export has no topological ordering, so a child can reference
    // a parent that hasn't been inserted yet.
    if (b.goals.length) {
      await tx.insert(goals).values(
        b.goals.map((g) => ({
          id: g.id,
          title: g.title,
          description: g.description,
          emoji: safeEmoji(g.emoji),
          parentId: null,
          positionX: g.positionX,
          positionY: g.positionY,
          status: g.status,
          userId,
          createdAt: g.createdAt,
          updatedAt: g.updatedAt,
        })),
      );
      for (const g of b.goals) {
        if (g.parentId) {
          await tx.update(goals).set({ parentId: g.parentId }).where(eq(goals.id, g.id));
        }
      }
    }

    if (b.tasks.length) {
      await tx.insert(tasks).values(b.tasks.map((t) => ({ ...t, emoji: safeEmoji(t.emoji) })));
    }
    if (b.goalValues.length) await tx.insert(goalValues).values(b.goalValues);
    if (b.connections.length) await tx.insert(connections).values(b.connections);
    if (b.trackingItems.length) await tx.insert(trackingItems).values(b.trackingItems.map((t) => ({ ...t, userId })));
    if (b.syncTemplates.length) await tx.insert(syncTemplates).values(b.syncTemplates.map((t) => ({ ...t, userId })));
    if (b.syncTemplateItems.length) await tx.insert(syncTemplateItems).values(b.syncTemplateItems);
    if (b.weeklySync.length) await tx.insert(weeklySync).values(b.weeklySync.map((ws) => ({ ...ws, userId })));
    if (b.weeklySyncItems.length) await tx.insert(weeklySyncItems).values(b.weeklySyncItems);

    // Attachments: for every blob in b.files, insert a fresh files row owned by
    // the importing user and point the attachment at it. Attachments without a
    // matching blob are dropped — partial backups stay partial, no dangling FKs.
    if (b.attachments.length) {
      const blobByAttachmentId = new Map(b.files.map((f) => [f.attachmentId, f.data] as const));
      type AttachmentInsert = typeof attachments.$inferInsert;
      const attachmentRows: AttachmentInsert[] = [];
      for (const a of b.attachments) {
        const base64 = blobByAttachmentId.get(a.id);
        if (!base64) {
          console.warn(`[backup.import] attachment ${a.id} skipped — no file blob in backup`);
          continue;
        }
        const buf = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ""), "base64");
        const [file] = await tx
          .insert(files)
          .values({
            ownerId: userId,
            fileName: a.fileName,
            // The backup format predates a mime column on attachments — fall
            // back to octet-stream; the file route serves what it's given.
            mimeType: "application/octet-stream",
            sizeBytes: a.sizeBytes ?? buf.length,
            data: buf,
          })
          .returning({ id: files.id });
        if (!file) continue;
        attachmentRows.push({
          id: a.id,
          userId,
          parentType: a.parentType,
          parentId: a.parentId,
          fileName: a.fileName,
          fileType: a.fileType,
          fileId: file.id,
          sizeBytes: a.sizeBytes,
          createdAt: a.createdAt,
        });
      }
      if (attachmentRows.length) await tx.insert(attachments).values(attachmentRows);
    }

    if (b.people.length) {
      await tx.insert(people).values(b.people.map((p) => ({ ...p, emoji: safeEmoji(p.emoji), userId })));
    }
    if (b.userSelf) await tx.insert(userSelf).values({ ...b.userSelf, userId });
    if (b.taskReferents.length) await tx.insert(taskReferents).values(b.taskReferents);
    if (b.personGroups.length) await tx.insert(personGroups).values(b.personGroups.map((g) => ({ ...g, userId })));
    if (b.peopleToGroups.length) await tx.insert(peopleToGroups).values(b.peopleToGroups);
    if (b.tasksToGroups.length) await tx.insert(tasksToGroups).values(b.tasksToGroups);
    if (b.nextBids.length) await tx.insert(nextBids).values(b.nextBids);
    if (b.importantDates.length) await tx.insert(importantDates).values(b.importantDates);
    if (b.bucketListItems.length) {
      await tx.insert(bucketListItems).values(b.bucketListItems.map((it) => ({ ...it, userId })));
    }
    if (b.bucketListItemPeople.length) await tx.insert(bucketListItemPeople).values(b.bucketListItemPeople);
    if (b.selfListItems.length) {
      await tx.insert(selfListItems).values(b.selfListItems.map((it) => ({ ...it, userId })));
    }
  });

  // File blobs land in the same `files` table the attachments reference, so
  // there's no post-commit upload step — the transaction above is the entire
  // write. `fileFailures` is therefore always empty; it stays in the response
  // because the import UI reads the key.
  const fileFailures: string[] = [];

  return {
    success: true,
    counts: {
      values: b.values.length,
      goals: b.goals.length,
      tasks: b.tasks.length,
      connections: b.connections.length,
      goalValues: b.goalValues.length,
      trackingItems: b.trackingItems.length,
      weeklySync: b.weeklySync.length,
      weeklySyncItems: b.weeklySyncItems.length,
      syncTemplates: b.syncTemplates.length,
      syncTemplateItems: b.syncTemplateItems.length,
      attachments: b.attachments.length,
      files: b.files.length,
      people: b.people.length,
      userSelf: b.userSelf ? 1 : 0,
      taskReferents: b.taskReferents.length,
      personGroups: b.personGroups.length,
      peopleToGroups: b.peopleToGroups.length,
      tasksToGroups: b.tasksToGroups.length,
      selfListItems: b.selfListItems.length,
      importantDates: b.importantDates.length,
      // NOTE: nextBids, bucketListItems and bucketListItemPeople are imported
      // but deliberately absent from `counts` — that's the shipped shape and
      // the UI renders whatever keys it finds. Adding them is a UI change.
    },
    fileFailures,
  };
}
