// Transport only. Logic lives in src/server/services/{goals,tasks,connections,data}.ts.
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import {
  createConnectionSchema,
  createGoalSchema,
  createTaskSchema,
  updateConnectionSchema,
  updateGoalSchema,
  updateTaskSchema,
  type Goal,
} from "../../types";
import * as connectionsService from "~/server/services/connections";
import * as dataService from "~/server/services/data";
import * as goalsService from "~/server/services/goals";
import * as tasksService from "~/server/services/tasks";

const idInput = z.object({ id: z.string() });

export const goalsRouter = createTRPCRouter({
  goals: createTRPCRouter({
    getAll: protectedProcedure.query(({ ctx }): Promise<Goal[]> => goalsService.list(ctx.user.userId)),

    create: protectedProcedure
      .input(createGoalSchema)
      .mutation(({ input, ctx }) => goalsService.create(ctx.user.userId, input)),

    update: protectedProcedure
      .input(updateGoalSchema)
      .mutation(({ input, ctx }) => goalsService.update(ctx.user.userId, input)),

    delete: protectedProcedure
      .input(idInput)
      .mutation(({ input, ctx }) => goalsService.remove(ctx.user.userId, input.id)),
  }),

  tasks: createTRPCRouter({
    create: protectedProcedure
      .input(createTaskSchema.extend({ goalId: z.string() }))
      .mutation(({ input, ctx }) => tasksService.create(ctx.user.userId, input)),

    update: protectedProcedure
      .input(updateTaskSchema.extend({ goalId: z.string() }))
      .mutation(({ input, ctx }) => tasksService.update(ctx.user.userId, input)),

    delete: protectedProcedure
      .input(z.object({ id: z.string(), goalId: z.string() }))
      .mutation(({ input, ctx }) => tasksService.remove(ctx.user.userId, input)),

    setScheduled: protectedProcedure
      .input(z.object({ id: z.string(), scheduledAt: z.coerce.date().nullable() }))
      .mutation(({ input, ctx }) => tasksService.setScheduled(ctx.user.userId, input)),
  }),

  connections: createTRPCRouter({
    getAll: protectedProcedure.query(({ ctx }) => connectionsService.list(ctx.user.userId)),

    create: protectedProcedure
      .input(createConnectionSchema)
      .mutation(({ input, ctx }) => connectionsService.create(ctx.user.userId, input)),

    update: protectedProcedure
      .input(updateConnectionSchema)
      .mutation(({ input, ctx }) => connectionsService.update(ctx.user.userId, input)),

    delete: protectedProcedure
      .input(idInput)
      .mutation(({ input, ctx }) => connectionsService.remove(ctx.user.userId, input.id)),
  }),

  data: createTRPCRouter({
    getAll: protectedProcedure.query(({ ctx }) => dataService.getAll(ctx.user.userId)),
  }),
});
