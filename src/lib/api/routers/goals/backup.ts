import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import { db } from "../../../data";
import {
  attachments,
  bucketListItemPeople,
  bucketListItems,
  connections,
  files,
  goalValues,
  goals,
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
} from "../../../data/schema";
import { backupSchema } from "../../types";
import { isEmojiGlyph, isOurStorageImageUrl } from "../../../emoji-utils";

// On import, a backup is user-supplied JSON — never trust its emoji
// columns. We accept an emoji glyph or a URL we issued ourselves; anything
// else (an external URL pasted under the old loose schema, an attacker's
// edited backup) is dropped to null. Same predicate as the live zod
// validator so import policy matches mutation policy.
function safeEmoji(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (isEmojiGlyph(value) || isOurStorageImageUrl(value)) return value;
  return null;
}

export const backupRouter = createTRPCRouter({
  backup: createTRPCRouter({
    export: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.user.userId;

      const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!userRow) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

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

      // Tracking items are now user-owned — query by userId, not goalId.
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
      const peopleToGroupsRows = peopleRows.length
        ? await db
            .select()
            .from(peopleToGroups)
            .where(
              inArray(
                peopleToGroups.personId,
                peopleRows.map((p) => p.id),
              ),
            )
        : [];

      const nextBidsRows = peopleRows.length
        ? await db
            .select()
            .from(nextBids)
            .where(
              inArray(
                nextBids.personId,
                peopleRows.map((p) => p.id),
              ),
            )
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

      // Pull the underlying file bytes for every attachment and base64-encode.
      // Skip missing rows (deliver a partial backup rather than failing) —
      // attachments.fileId is NOT NULL so this only happens if a file was
      // deleted out of band, which shouldn't be possible through the API.
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

      // Strip user-discriminator columns from rows that include them; the
      // import path inserts under whatever userId is in ctx.
      const stripUser = <T extends { userId?: string }>(row: T): Omit<T, "userId"> => {
        const rest: Record<string, unknown> = { ...row };
        delete rest.userId;
        return rest as Omit<T, "userId">;
      };

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
        bucketListItems: bucketListRows.map(stripUser),
        bucketListItemPeople: bucketListItemPeopleRows,
        selfListItems: selfListItemRows.map(stripUser),
        // Touched-but-unused — harmless extra context for v2 importers.
        _trackingItemIds: trackingItemIds,
      };
    }),

    import: protectedProcedure
      .input(
        z.object({
          backup: backupSchema,
          confirmReplace: z.literal(true),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const userId = ctx.user.userId;
        const b = input.backup;

        await db.transaction(async (tx) => {
          // Nuke. Cascades take care of children: tasks, connections,
          // goalValues, weeklySyncItems, syncTemplateItems, attachments
          // (via user_id on attachments), tracking_items, etc.
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

          // Insert goals with parentId nulled first, then fix up parents in a
          // second pass — handles forward references in the export.
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

          if (b.trackingItems.length) {
            await tx.insert(trackingItems).values(
              b.trackingItems.map((t) => ({
                ...t,
                userId,
              })),
            );
          }

          if (b.syncTemplates.length) {
            await tx.insert(syncTemplates).values(b.syncTemplates.map((t) => ({ ...t, userId })));
          }
          if (b.syncTemplateItems.length) {
            await tx.insert(syncTemplateItems).values(b.syncTemplateItems);
          }

          if (b.weeklySync.length) {
            await tx.insert(weeklySync).values(b.weeklySync.map((ws) => ({ ...ws, userId })));
          }
          if (b.weeklySyncItems.length) await tx.insert(weeklySyncItems).values(b.weeklySyncItems);

          // Attachments: for every blob in b.files, insert a fresh files row
          // (owned by the importing user) and point the attachment at it.
          // Attachments without a matching file blob are dropped — partial
          // backups stay partial, no dangling FKs.
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
              const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, "");
              const buf = Buffer.from(cleanBase64, "base64");
              const [file] = await tx
                .insert(files)
                .values({
                  ownerId: userId,
                  fileName: a.fileName,
                  // Backup format predates a mime column on attachments — fall
                  // back to octet-stream; the file route serves what it gets.
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
          if (b.userSelf) {
            await tx.insert(userSelf).values({ ...b.userSelf, userId });
          }
          if (b.taskReferents.length) {
            await tx.insert(taskReferents).values(b.taskReferents);
          }
          if (b.personGroups.length) {
            await tx.insert(personGroups).values(b.personGroups.map((g) => ({ ...g, userId })));
          }
          if (b.peopleToGroups.length) {
            await tx.insert(peopleToGroups).values(b.peopleToGroups);
          }
          if (b.tasksToGroups.length) {
            await tx.insert(tasksToGroups).values(b.tasksToGroups);
          }
          if (b.nextBids.length) {
            await tx.insert(nextBids).values(b.nextBids);
          }
          if (b.bucketListItems.length) {
            await tx.insert(bucketListItems).values(b.bucketListItems.map((it) => ({ ...it, userId })));
          }
          if (b.bucketListItemPeople.length) {
            await tx.insert(bucketListItemPeople).values(b.bucketListItemPeople);
          }
          if (b.selfListItems.length) {
            await tx.insert(selfListItems).values(b.selfListItems.map((it) => ({ ...it, userId })));
          }
        });

        // File blobs land in the same `files` table the attachments now
        // reference — no post-commit upload step. The DB tx above is the
        // entire write; everything either committed or rolled back together.
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
          },
          fileFailures,
        };
      }),
  }),
});
