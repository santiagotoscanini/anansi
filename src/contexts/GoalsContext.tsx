"use client";

import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { api, type RouterOutputs } from "~/trpc/react";
import { computeImportance, type Importance } from "~/lib/computation/importance";
import { createClient } from "~/lib/supabase/client";
import type {
  Value,
  Goal,
  Task,
  Connection,
  TrackingItem,
  WeeklySync,
  WeeklySyncItem,
  CreateGoal,
  CreateTrackingItem,
} from "~/lib/api/types";

// One browser-side Supabase client per page lifetime. `createClient` returns
// a fresh client on each call, so module-scoping it keeps the auth state
// machine (and its onAuthStateChange subscribers) in a single place.
const supabase = createClient();

// Stable empty fallbacks so `dataQuery.data?.values ?? []` doesn't create a
// fresh array reference each render (which would propagate to every consumer
// that uses values/goals/connections in a useMemo dep). Module-level so the
// reference is shared across renders without a useMemo wrapper.
const EMPTY_VALUES: Value[] = [];
const EMPTY_GOALS: Goal[] = [];
const EMPTY_CONNECTIONS: Connection[] = [];

type WeeklyRetrospectiveOutput = RouterOutputs["goals"]["weeklySync"]["getWeeklyRetrospectiveData"];
type RawWeeklyRetrospectiveQuery = ReturnType<typeof api.goals.weeklySync.getWeeklyRetrospectiveData.useQuery>;
// tRPC-next's useQuery return type erases the procedure output into `unknown`
// in `ReturnType<typeof>`, so we re-narrow `data` to the true shape. All other
// query properties are preserved.
type WeeklyRetrospectiveQuery = Omit<RawWeeklyRetrospectiveQuery, "data"> & {
  data: WeeklyRetrospectiveOutput | undefined;
};

interface GoalsContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  values: Value[];
  goals: Goal[];
  connections: Connection[];
  isDataLoading: boolean;

  signInWithPassword: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signUp: (
    name: string,
    email: string,
    password: string,
  ) => Promise<{ ok: boolean; error?: string; needsConfirmation?: boolean }>;
  signInWithGoogle: () => Promise<{ ok: boolean; error?: string }>;
  signInWithApple: () => Promise<{ ok: boolean; error?: string }>;
  sendPasswordReset: (email: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  checkAuthentication: () => Promise<void>;

  refreshData: () => Promise<void>;

  addValue: (value: Omit<Value, "id">) => Promise<void>;
  updateValue: (id: string, value: Partial<Value>) => Promise<void>;
  deleteValue: (id: string) => Promise<void>;

  addGoal: (goal: CreateGoal) => Promise<void>;
  updateGoal: (id: string, goal: Partial<Goal>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;

  addTask: (goalId: string, task: Omit<Task, "id">) => Promise<void>;
  updateTask: (goalId: string, taskId: string, task: Partial<Task>) => Promise<void>;
  deleteTask: (goalId: string, taskId: string) => Promise<void>;

  addConnection: (connection: Omit<Connection, "id">) => Promise<void>;
  updateConnection: (id: string, connection: Partial<Connection>) => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;

  getTrackingItems: (goalId: string) => Promise<TrackingItem[]>;
  addTrackingItem: (trackingItem: CreateTrackingItem) => Promise<void>;
  updateTrackingItem: (id: string, trackingItem: Partial<TrackingItem>) => Promise<void>;
  deleteTrackingItem: (id: string) => Promise<{ success: boolean; type: "soft_delete" | "hard_delete" }>;

  // Weekly Sync operations
  getWeeklySyncByWeek: (weekStart: Date) => Promise<WeeklySync | null>;
  createWeeklySync: (weekDate: Date) => Promise<WeeklySync>;

  // Weekly Sync Items operations
  createWeeklySyncItem: (weeklySyncId: string, trackingItemId: string) => Promise<WeeklySyncItem>;

  // Weekly Sync Files operations
  uploadWeeklySyncFile: (
    data: string,
    weeklySyncId: string,
    trackingItemId: string,
    fileName: string,
    fileType: "image" | "document" | "video" | "audio" | "other",
    isText?: boolean,
  ) => Promise<{ url: string; fileName: string; filePath: string; fileType: string }>;
  saveTextFile: (
    content: string,
    weeklySyncId: string,
    trackingItemId: string,
    existingFileName?: string,
  ) => Promise<{ url: string; fileName: string; filePath: string; fileType: string }>;
  deleteWeeklySyncFile: (fileId: string) => Promise<void>;

  // Weekly Retrospective data operations
  getWeeklyRetrospectiveData: (weekStart: Date) => WeeklyRetrospectiveQuery;
  refreshWeeklyRetrospectiveData: () => Promise<void>;

  // Utility functions
  getGoalCompletion: (goalId: string) => number;
  getPathCompletion: (goalId: string) => number;
  getGoalProgress: (goalId: string) => { ownProgress: number; dependenciesProgress: number; totalProgress: number };
  calculateImportance: (goalId: string) => Importance;
  getWeekStartDate: (date: Date) => Date;
}

const GoalsContext = createContext<GoalsContextType | undefined>(undefined);

export function GoalsProvider({ children }: { children: ReactNode }) {
  // Auth state derives from auth.me: success → authenticated; UNAUTHORIZED
  // (or any error from a missing/expired cookie) → not authenticated. The
  // cookie itself is HttpOnly so we never touch document.cookie here.
  const utils = api.useUtils();
  const meQuery = api.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const isAuthenticated = meQuery.data !== undefined && meQuery.error === null;
  const isLoading = meQuery.isPending;

  const dataQuery = api.goals.data.getAll.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchOnWindowFocus: false,
  });

  // Derive directly from the TanStack cache. Previously we mirrored the data
  // into local useState and synced via a render-time setState — that broke
  // the React Compiler's purity guarantee, kept the same data twice in
  // memory, and lagged the cache by one render after every refetch. The
  // optimistic-update path in `updateTask` writes via `utils.goals.data.getAll
  // .setData(...)`, which lands here on the next render with no extra effect.
  const values = dataQuery.data?.values ?? EMPTY_VALUES;
  const goals = dataQuery.data?.goals ?? EMPTY_GOALS;
  const connections = dataQuery.data?.connections ?? EMPTY_CONNECTIONS;
  const isDataLoading = dataQuery.isLoading;

  // Mutations for data operations
  const valuesMutations = {
    create: api.goals.values.create.useMutation(),
    update: api.goals.values.update.useMutation(),
    delete: api.goals.values.delete.useMutation(),
  };

  const goalsMutations = {
    create: api.goals.goals.create.useMutation(),
    update: api.goals.goals.update.useMutation(),
    delete: api.goals.goals.delete.useMutation(),
  };

  const tasksMutations = {
    create: api.goals.tasks.create.useMutation(),
    update: api.goals.tasks.update.useMutation(),
    delete: api.goals.tasks.delete.useMutation(),
  };

  const connectionsMutations = {
    create: api.goals.connections.create.useMutation(),
    update: api.goals.connections.update.useMutation(),
    delete: api.goals.connections.delete.useMutation(),
  };

  const trackingItemsMutations = {
    create: api.goals.trackingItems.create.useMutation(),
    update: api.goals.trackingItems.update.useMutation(),
    delete: api.goals.trackingItems.delete.useMutation(),
  };

  const weeklySyncMutations = {
    create: api.goals.weeklySync.create.useMutation(),
    getWeeklyRetrospectiveData: api.goals.weeklySync.getWeeklyRetrospectiveData.useQuery,
  };

  // Sync item mutations now live under weeklySync (post-redesign).
  const syncItemMutations = {
    addItem: api.goals.weeklySync.addItem.useMutation(),
    removeItem: api.goals.weeklySync.removeItem.useMutation(),
    setItemText: api.goals.weeklySync.setItemText.useMutation(),
    reorderItems: api.goals.weeklySync.reorderItems.useMutation(),
  };

  // Attachments replace the old weeklySyncItemFiles routes for binary uploads.
  const attachmentsMutations = {
    upload: api.goals.attachments.upload.useMutation(),
    delete: api.goals.attachments.delete.useMutation(),
  };

  // Cookie writes (access + refresh) happen inside the Supabase client via
  // our cookie adapter. We then invalidate the me query so isAuthenticated
  // flips on the next render — the auth.onAuthStateChange subscriber below
  // does the same job for OAuth/email-confirm flows where the session lands
  // mid-page without going through these functions.
  const signInWithPassword = async (email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };
    await utils.auth.me.invalidate();
    return { ok: true };
  };

  const signUp = async (
    name: string,
    email: string,
    password: string,
  ): Promise<{ ok: boolean; error?: string; needsConfirmation?: boolean }> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // `name` is read by the on_auth_user_created trigger in migration
        // 0019_supabase_auth.sql to populate public.users.name.
        data: { name },
        emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/auth/confirm?next=/app` : undefined,
      },
    });
    if (error) return { ok: false, error: error.message };
    // When "Confirm email" is ON (the project default), signUp returns a
    // user but no session — the UI should show "check your email" state
    // until the confirmation link is clicked.
    const needsConfirmation = !data.session;
    if (!needsConfirmation) await utils.auth.me.invalidate();
    return { ok: true, needsConfirmation };
  };

  // Google and Apple are wired at the SDK level but disabled until the
  // dashboard side is configured (OAuth client id/secret for Google;
  // Services ID + .p8 key for Apple). Leaving the hooks in place so the UI
  // doesn't need to change shape when we flip either on.
  const signInWithGoogle = async (): Promise<{ ok: boolean; error?: string }> => {
    return { ok: false, error: "Google sign-in is not configured yet." };
    // To enable, restore the call below and toggle Authentication →
    // Providers → Google in the Supabase dashboard:
    //   const { error } = await supabase.auth.signInWithOAuth({
    //     provider: "google",
    //     options: {
    //       redirectTo: typeof window !== "undefined"
    //         ? `${window.location.origin}/auth/callback?next=/app`
    //         : undefined,
    //     },
    //   });
    //   if (error) return { ok: false, error: error.message };
    //   return { ok: true };
  };

  const signInWithApple = async (): Promise<{ ok: boolean; error?: string }> => {
    return { ok: false, error: "Apple sign-in is not configured yet." };
  };

  const sendPasswordReset = async (email: string): Promise<{ ok: boolean; error?: string }> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo:
        typeof window !== "undefined" ? `${window.location.origin}/auth/confirm?next=/reset-password` : undefined,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  const logout = () => {
    void (async () => {
      try {
        await supabase.auth.signOut();
      } finally {
        // Reset cached queries so isAuthenticated flips to false on the next
        // me refetch (which will 401 now that the cookie is cleared). Goals,
        // values and connections derive from `goals.data.getAll` so they
        // empty out automatically when this resets.
        await utils.auth.me.reset();
        await utils.goals.data.getAll.reset();
      }
    })();
  };

  const checkAuthentication = async () => {
    await meQuery.refetch();
  };

  // Bridge Supabase's auth state machine into TanStack Query: any sign-in,
  // sign-out, or token-refresh event invalidates the me query so the UI
  // re-derives isAuthenticated. SIGNED_OUT also drops the cached data so a
  // new user signing in on the same browser doesn't see the previous one's
  // goals between mount and refetch.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      void utils.auth.me.invalidate();
      if (event === "SIGNED_OUT") {
        void utils.goals.data.getAll.reset();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [utils]);

  // Re-fetch the merged goals/values/connections payload. Most mutations
  // call invalidateData below — refreshData stays around for components
  // that explicitly want to wait on the refetch (backup-import flow).
  const refreshData = useCallback(async () => {
    if (isAuthenticated) {
      await dataQuery.refetch();
    }
  }, [isAuthenticated, dataQuery]);

  // Mark the merged data query stale so React Query refetches it on next
  // observer interest. Cheaper than refetch() because it doesn't block the
  // mutation handler — the UI continues immediately and updates when the
  // refetch lands.
  const invalidateData = useCallback(async () => {
    if (isAuthenticated) await utils.goals.data.getAll.invalidate();
  }, [isAuthenticated, utils]);

  // Value operations
  const addValue = useCallback(
    async (value: Omit<Value, "id">) => {
      try {
        await valuesMutations.create.mutateAsync(value);
        await invalidateData();
      } catch (error) {
        console.error("Failed to add value:", error);
      }
    },
    [valuesMutations.create, invalidateData],
  );

  const updateValue = useCallback(
    async (id: string, value: Partial<Value>) => {
      try {
        await valuesMutations.update.mutateAsync({ id, ...value });
        await invalidateData();
      } catch (error) {
        console.error("Failed to update value:", error);
      }
    },
    [valuesMutations.update, invalidateData],
  );

  const deleteValue = useCallback(
    async (id: string) => {
      try {
        await valuesMutations.delete.mutateAsync({ id });
        await invalidateData();
      } catch (error) {
        console.error("Failed to delete value:", error);
      }
    },
    [valuesMutations.delete, invalidateData],
  );

  // Importance is computed from outgoing-edge weights via the canonical
  // helper in `lib/computation/importance.ts` (also used by every server
  // endpoint that hydrates goals, so client + server agree on thresholds).
  const calculateImportance = useCallback(
    (goalId: string): Importance => computeImportance(connections, goalId),
    [connections],
  );

  // Goal operations
  const addGoal = useCallback(
    async (goal: CreateGoal) => {
      try {
        await goalsMutations.create.mutateAsync(goal);
        await invalidateData();
      } catch (error) {
        console.error("Failed to add goal:", error);
      }
    },
    [goalsMutations.create, invalidateData],
  );

  // Optimistic update — patches the cache in place so the canvas drag (the
  // hot path) doesn't trigger a refetch on every drop. Without this, every
  // node move replaced the entire `goals` array via TanStack invalidation,
  // which forced the React Flow `setNodes` rebuild in GoalsGraph.tsx to
  // remeasure every node. Starting a new drag before measurement finished
  // produced the "trying to drag a node that is not initialized" warning.
  //
  // Importance is server-computed from `connections`, not from the goal row,
  // so the optimistic merge here doesn't need to recompute it. valueIds are
  // replace-set on the backend and the optimistic value matches what the
  // server commits; if any field ever drifts, the on-error rollback +
  // invalidate gets us back in sync.
  const updateGoal = useCallback(
    async (id: string, goal: Partial<Goal>) => {
      const { importance: _importance, ...goalData } = goal;
      void _importance;

      const snapshot = utils.goals.data.getAll.getData();
      if (snapshot) {
        utils.goals.data.getAll.setData(undefined, {
          ...snapshot,
          goals: snapshot.goals.map((g) => (g.id === id ? { ...g, ...goalData } : g)),
        });
      }
      try {
        await goalsMutations.update.mutateAsync({ id, ...goalData });
      } catch (error) {
        if (snapshot) utils.goals.data.getAll.setData(undefined, snapshot);
        await invalidateData();
        console.error("Failed to update goal:", error);
      }
    },
    [goalsMutations.update, invalidateData, utils],
  );

  const deleteGoal = useCallback(
    async (id: string) => {
      try {
        await goalsMutations.delete.mutateAsync({ id });
        await invalidateData();
      } catch (error) {
        console.error("Failed to delete goal:", error);
      }
    },
    [goalsMutations.delete, invalidateData],
  );

  // Task operations
  const addTask = useCallback(
    async (goalId: string, task: Omit<Task, "id">) => {
      try {
        await tasksMutations.create.mutateAsync({ ...task, goalId });
        await invalidateData();
      } catch (error) {
        console.error("Failed to add task:", error);
      }
    },
    [tasksMutations.create, invalidateData],
  );

  // Optimistic update for the canvas's hottest path: clicking a task's
  // completion checkbox. Patch the cache immediately so the UI flips
  // without waiting for the round-trip; on error, roll back.
  //
  // No `invalidateData()` on the success branch: the optimistic patch already
  // matches what the server now holds, so a refetch would burn a round-trip
  // for an identical payload (and could flicker the cache if more mutations
  // are mid-flight). We invalidate only on error so the rolled-back state
  // re-syncs with whatever the server actually has.
  const updateTask = useCallback(
    async (goalId: string, taskId: string, task: Partial<Task>) => {
      const snapshot = utils.goals.data.getAll.getData();
      if (snapshot) {
        utils.goals.data.getAll.setData(undefined, {
          ...snapshot,
          goals: snapshot.goals.map((g) =>
            g.id !== goalId
              ? g
              : {
                  ...g,
                  tasks: g.tasks.map((t) => (t.id !== taskId ? t : { ...t, ...task })),
                },
          ),
        });
      }
      try {
        await tasksMutations.update.mutateAsync({ id: taskId, goalId, ...task });
      } catch (error) {
        if (snapshot) utils.goals.data.getAll.setData(undefined, snapshot);
        await invalidateData();
        console.error("Failed to update task:", error);
      }
    },
    [tasksMutations.update, invalidateData, utils],
  );

  const deleteTask = useCallback(
    async (goalId: string, taskId: string) => {
      try {
        await tasksMutations.delete.mutateAsync({ id: taskId, goalId });
        await invalidateData();
      } catch (error) {
        console.error("Failed to delete task:", error);
      }
    },
    [tasksMutations.delete, invalidateData],
  );

  // Connection operations
  const addConnection = useCallback(
    async (connection: Omit<Connection, "id">) => {
      try {
        await connectionsMutations.create.mutateAsync(connection);
        await invalidateData();
      } catch (error) {
        console.error("Failed to add connection:", error);
      }
    },
    [connectionsMutations.create, invalidateData],
  );

  const updateConnection = useCallback(
    async (id: string, connection: Partial<Connection>) => {
      try {
        await connectionsMutations.update.mutateAsync({ id, ...connection });
        await invalidateData();
      } catch (error) {
        console.error("Failed to update connection:", error);
      }
    },
    [connectionsMutations.update, invalidateData],
  );

  const deleteConnection = useCallback(
    async (id: string) => {
      try {
        await connectionsMutations.delete.mutateAsync({ id });
        await invalidateData();
      } catch (error) {
        console.error("Failed to delete connection:", error);
      }
    },
    [connectionsMutations.delete, invalidateData],
  );

  // Tracking Items operations
  const getTrackingItems = useCallback(
    async (goalId: string): Promise<TrackingItem[]> => {
      try {
        const data = await utils.goals.trackingItems.list.fetch({ goalId });
        return (data ?? []).map((item) => ({
          id: item.id,
          goalId: item.goalId,
          title: item.title,
          description: item.description ?? undefined,
          order: item.order,
          status: item.status,
          deletedAt: item.deletedAt ?? undefined,
        }));
      } catch (error) {
        console.error("Failed to get tracking items:", error);
        return [];
      }
    },
    [utils],
  );

  const addTrackingItem = useCallback(
    async (trackingItem: CreateTrackingItem) => {
      try {
        await trackingItemsMutations.create.mutateAsync(trackingItem);
        await invalidateData();
      } catch (error) {
        console.error("Failed to add tracking item:", error);
      }
    },
    [trackingItemsMutations.create, invalidateData],
  );

  const updateTrackingItem = useCallback(
    async (id: string, trackingItem: Partial<TrackingItem>) => {
      try {
        await trackingItemsMutations.update.mutateAsync({ id, ...trackingItem });
        await invalidateData();
      } catch (error) {
        console.error("Failed to update tracking item:", error);
      }
    },
    [trackingItemsMutations.update, invalidateData],
  );

  const deleteTrackingItem = useCallback(
    async (id: string): Promise<{ success: boolean; type: "soft_delete" | "hard_delete" }> => {
      try {
        const result = await trackingItemsMutations.delete.mutateAsync({ id });
        await invalidateData();
        return result;
      } catch (error) {
        console.error("Failed to delete tracking item:", error);
        throw error;
      }
    },
    [trackingItemsMutations.delete, invalidateData],
  );

  // Weekly Sync functions
  const getWeekStartDate = useCallback((date: Date): Date => {
    const result = new Date(date);
    const day = result.getDay();
    const diff = result.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    result.setDate(diff);
    result.setHours(0, 0, 0, 0);
    return result;
  }, []);

  const getWeeklySyncByWeek = useCallback(async (_weekStart: Date): Promise<WeeklySync | null> => {
    try {
      // For now, we'll implement this with a separate hook in the component
      // This is a placeholder that will be overridden by component-level implementation
      return null;
    } catch (error) {
      console.error("Failed to get weekly sync:", error);
      return null;
    }
  }, []);

  const createWeeklySync = useCallback(
    async (weekDate: Date): Promise<WeeklySync> => {
      try {
        const result = await weeklySyncMutations.create.mutateAsync({ weekDate });
        await invalidateData();
        return result;
      } catch (error) {
        console.error("Failed to create weekly sync:", error);
        throw error;
      }
    },
    [weeklySyncMutations.create, invalidateData],
  );

  const createWeeklySyncItem = useCallback(
    async (weeklySyncId: string, trackingItemId: string): Promise<WeeklySyncItem> => {
      try {
        const result = await syncItemMutations.addItem.mutateAsync({
          weeklySyncId,
          trackingItemId,
        });
        await invalidateData();
        return result;
      } catch (error) {
        console.error("Failed to add sync item:", error);
        throw error;
      }
    },
    [syncItemMutations.addItem, invalidateData],
  );

  // Idempotent helper used by the upload paths — addItem returns the existing
  // (sync, item) row if the pair already exists.
  const ensureWeeklySyncItem = useCallback(
    async (weeklySyncId: string, trackingItemId: string): Promise<string> => {
      try {
        const result = await syncItemMutations.addItem.mutateAsync({
          weeklySyncId,
          trackingItemId,
        });
        return result.id;
      } catch (error) {
        console.error("Failed to ensure weekly sync item exists:", error);
        throw error;
      }
    },
    [syncItemMutations.addItem],
  );

  // Binary upload: ensure the sync item exists, then send the file as an
  // attachment. The legacy isText=true path is kept as a thin wrapper around
  // weeklySync.setItemText so existing callers (debounced text editor) keep
  // working without refactoring.
  const uploadWeeklySyncFile = useCallback(
    async (
      data: string,
      weeklySyncId: string,
      trackingItemId: string,
      fileName: string,
      fileType: "image" | "document" | "video" | "audio" | "other",
      isText = false,
    ): Promise<{ url: string; fileName: string; filePath: string; fileType: string }> => {
      try {
        const weeklySyncItemId = await ensureWeeklySyncItem(weeklySyncId, trackingItemId);

        if (isText) {
          await syncItemMutations.setItemText.mutateAsync({
            weeklySyncItemId,
            textContent: data,
          });
          return { url: "", fileName, filePath: "", fileType };
        }

        const result = await attachmentsMutations.upload.mutateAsync({
          parentType: "weekly_sync_item",
          parentId: weeklySyncItemId,
          fileName,
          fileType,
          data,
        });
        return {
          url: result.url,
          fileName: result.fileName,
          filePath: result.url,
          fileType: result.fileType,
        };
      } catch (error) {
        console.error("Failed to upload weekly sync file:", error);
        throw error;
      }
    },
    [attachmentsMutations.upload, syncItemMutations.setItemText, ensureWeeklySyncItem],
  );

  // Text now lives inline on the weekly_sync_items row — no file write.
  const saveTextFile = useCallback(
    async (
      content: string,
      weeklySyncId: string,
      trackingItemId: string,
      existingFileName?: string,
    ): Promise<{ url: string; fileName: string; filePath: string; fileType: string }> => {
      try {
        const weeklySyncItemId = await ensureWeeklySyncItem(weeklySyncId, trackingItemId);
        await syncItemMutations.setItemText.mutateAsync({
          weeklySyncItemId,
          textContent: content,
        });
        return {
          url: "",
          fileName: existingFileName ?? "notes.txt",
          filePath: "",
          fileType: "document",
        };
      } catch (error) {
        console.error("Failed to save text:", error);
        throw error;
      }
    },
    [syncItemMutations.setItemText, ensureWeeklySyncItem],
  );

  // fileId is now an attachments.id (legacy weekly_sync_item_files.id is gone).
  const deleteWeeklySyncFile = useCallback(
    async (fileId: string): Promise<void> => {
      try {
        await attachmentsMutations.delete.mutateAsync({ id: fileId });
        await invalidateData();
      } catch (error) {
        console.error("Failed to delete attachment:", error);
        throw error;
      }
    },
    [attachmentsMutations.delete, invalidateData],
  );

  // Weekly retrospective data operations
  const weeklyRetrospectiveQueryRef = useRef<WeeklyRetrospectiveQuery | null>(null);

  const retrospectiveQueryHook = weeklySyncMutations.getWeeklyRetrospectiveData;
  const getWeeklyRetrospectiveData = useCallback(
    (weekStart: Date) => {
      // This will be used by the component to access the query
      const query = retrospectiveQueryHook({ weekStart }, { enabled: !!weekStart });
      weeklyRetrospectiveQueryRef.current = query;
      return query;
    },
    [retrospectiveQueryHook],
  );

  const refreshWeeklyRetrospectiveData = useCallback(async (): Promise<void> => {
    try {
      if (weeklyRetrospectiveQueryRef.current) {
        await weeklyRetrospectiveQueryRef.current.refetch();
      }
    } catch (error) {
      console.error("Failed to refresh weekly retrospective data:", error);
      throw error;
    }
  }, []);

  // Progress calculations are memoized into Map<goalId, ...> on every change
  // to `goals`/`connections` and looked up in O(1) by the React Flow canvas
  // and the modals. Previously getGoalProgress recursed per-render per-goal;
  // on a 30-node graph that meant ~900 traversals per render.
  const progressCaches = useMemo(() => {
    type ProgressEntry = { ownProgress: number; dependenciesProgress: number; totalProgress: number };

    const goalsById = new Map<string, (typeof goals)[number]>();
    for (const g of goals) goalsById.set(g.id, g);

    // Predecessor connections grouped by target (incoming edges per goal).
    const predsByTarget = new Map<string, typeof connections>();
    for (const c of connections) {
      const arr = predsByTarget.get(c.target);
      if (arr) arr.push(c);
      else predsByTarget.set(c.target, [c]);
    }

    // Own-completion: weighted by task difficulty. One pass over all goals.
    const completions = new Map<string, number>();
    for (const g of goals) {
      if (g.tasks.length === 0) {
        completions.set(g.id, 0);
        continue;
      }
      const total = g.tasks.reduce((s, t) => s + t.difficulty, 0);
      const done = g.tasks.filter((t) => t.completed).reduce((s, t) => s + t.difficulty, 0);
      completions.set(g.id, total > 0 ? (done / total) * 100 : 0);
    }

    // Total progress: DFS with memo + visiting-set so cycles in the goal
    // graph don't infinite-loop. Still O(N + E) overall, computed once.
    const progresses = new Map<string, ProgressEntry>();
    const visiting = new Set<string>();

    const compute = (goalId: string): ProgressEntry => {
      const cached = progresses.get(goalId);
      if (cached) return cached;
      const goal = goalsById.get(goalId);
      if (!goal) return { ownProgress: 0, dependenciesProgress: 0, totalProgress: 0 };

      // Cycle guard — pretend we have no predecessors when we hit ourselves.
      if (visiting.has(goalId)) {
        const own = completions.get(goalId) ?? 0;
        return { ownProgress: own, dependenciesProgress: 0, totalProgress: own };
      }
      visiting.add(goalId);

      const ownProgress = completions.get(goalId) ?? 0;
      const preds = predsByTarget.get(goalId) ?? [];

      let entry: ProgressEntry;
      if (preds.length === 0) {
        entry = { ownProgress, dependenciesProgress: 0, totalProgress: ownProgress };
      } else {
        let totalPredWeight = 0;
        let weightedPredCompletion = 0;
        for (const conn of preds) {
          if (!goalsById.has(conn.source)) continue;
          const predProgress = compute(conn.source).totalProgress;
          const weight = conn.weight || 1;
          totalPredWeight += weight;
          weightedPredCompletion += predProgress * weight;
        }
        const dependenciesProgress = totalPredWeight > 0 ? weightedPredCompletion / totalPredWeight : 0;
        const hasOwnTasks = goal.tasks.length > 0;
        const ownWeight = hasOwnTasks ? 0.4 : 0.1;
        const predWeight = hasOwnTasks ? 0.6 : 0.9;
        const totalProgress = Math.min(100, Math.max(0, ownProgress * ownWeight + dependenciesProgress * predWeight));
        entry = {
          ownProgress: Math.min(100, Math.max(0, ownProgress)),
          dependenciesProgress: Math.min(100, Math.max(0, dependenciesProgress)),
          totalProgress,
        };
      }

      visiting.delete(goalId);
      progresses.set(goalId, entry);
      return entry;
    };

    for (const g of goals) compute(g.id);

    return { goalsById, completions, progresses };
  }, [goals, connections]);

  const getGoalCompletion = useCallback(
    (goalId: string): number => progressCaches.completions.get(goalId) ?? 0,
    [progressCaches],
  );

  const getPathCompletion = useCallback(
    (goalId: string): number => {
      const ids: string[] = [];
      let cur: string | undefined = goalId;
      while (cur) {
        ids.push(cur);
        cur = progressCaches.goalsById.get(cur)?.parentId;
      }
      if (ids.length === 0) return 0;
      const sum = ids.reduce((s, id) => s + (progressCaches.completions.get(id) ?? 0), 0);
      return sum / ids.length;
    },
    [progressCaches],
  );

  const getGoalProgress = useCallback(
    (goalId: string) =>
      progressCaches.progresses.get(goalId) ?? { ownProgress: 0, dependenciesProgress: 0, totalProgress: 0 },
    [progressCaches],
  );

  const contextValue: GoalsContextType = {
    isAuthenticated,
    isLoading,
    values,
    goals,
    connections,
    isDataLoading,
    signInWithPassword,
    signUp,
    signInWithGoogle,
    signInWithApple,
    sendPasswordReset,
    logout,
    checkAuthentication,
    refreshData,
    addValue,
    updateValue,
    deleteValue,
    addGoal,
    updateGoal,
    deleteGoal,
    addTask,
    updateTask,
    deleteTask,
    addConnection,
    updateConnection,
    deleteConnection,
    getTrackingItems,
    addTrackingItem,
    updateTrackingItem,
    deleteTrackingItem,
    getWeeklySyncByWeek,
    createWeeklySync,
    createWeeklySyncItem,
    uploadWeeklySyncFile,
    saveTextFile,
    deleteWeeklySyncFile,
    getWeeklyRetrospectiveData,
    refreshWeeklyRetrospectiveData,
    getGoalCompletion,
    getPathCompletion,
    getGoalProgress,
    calculateImportance,
    getWeekStartDate,
  };

  return <GoalsContext.Provider value={contextValue}>{children}</GoalsContext.Provider>;
}

export function useGoals() {
  const context = useContext(GoalsContext);
  if (!context) {
    throw new Error("useGoals must be used within a GoalsProvider");
  }
  return context;
}
