"use client";

import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { api, type RouterOutputs } from "~/trpc/react";
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

// Re-export types from the shared API types
export type {
  Value,
  Goal,
  Task,
  Connection,
  TrackingItem,
  WeeklySync,
  WeeklySyncItem,
  Attachment,
} from "~/lib/api/types";

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

  authenticate: (email: string, password: string) => Promise<boolean>;
  register: (name: string, email: string, password: string) => Promise<boolean>;
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
  calculateImportance: (goalId: string) => "Low" | "Medium" | "High";
  getWeekStartDate: (date: Date) => Date;
}

const GoalsContext = createContext<GoalsContextType | undefined>(undefined);

export function GoalsProvider({ children }: { children: ReactNode }) {
  const [values, setValues] = useState<Value[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(false);

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

  // Handle data loading when authenticated — derive during render via state tracking.
  const [lastProcessedData, setLastProcessedData] = useState<typeof dataQuery.data | undefined>(undefined);
  const [lastProcessedLoading, setLastProcessedLoading] = useState<boolean | null>(null);
  if (dataQuery.data !== lastProcessedData) {
    setLastProcessedData(dataQuery.data);
    if (dataQuery.data) {
      setValues(dataQuery.data.values ?? []);
      setGoals(dataQuery.data.goals ?? []);
      setConnections(dataQuery.data.connections ?? []);
    }
  }
  if (dataQuery.isLoading !== lastProcessedLoading) {
    setLastProcessedLoading(dataQuery.isLoading);
    setIsDataLoading(dataQuery.isLoading);
  }

  const authenticate = async (email: string, password: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) return false;
      // Cookie is now set HttpOnly server-side. Re-pull `me` so isAuthenticated flips.
      await utils.auth.me.invalidate();
      return true;
    } catch {
      return false;
    }
  };

  const register = async (name: string, email: string, password: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      if (!res.ok) return false;
      await utils.auth.me.invalidate();
      return true;
    } catch {
      return false;
    }
  };

  const logout = () => {
    void (async () => {
      try {
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      } finally {
        // Reset cached queries so isAuthenticated flips to false on the next
        // me refetch (which will 401 now that the cookie is cleared).
        await utils.auth.me.reset();
        await utils.goals.data.getAll.reset();
        setValues([]);
        setGoals([]);
        setConnections([]);
      }
    })();
  };

  const checkAuthentication = async () => {
    await meQuery.refetch();
  };

  const refreshData = useCallback(async () => {
    if (isAuthenticated) {
      await dataQuery.refetch();
    }
  }, [isAuthenticated, dataQuery]);

  // Value operations
  const addValue = useCallback(
    async (value: Omit<Value, "id">) => {
      try {
        await valuesMutations.create.mutateAsync(value);
        await refreshData();
      } catch (error) {
        console.error("Failed to add value:", error);
      }
    },
    [valuesMutations.create, refreshData],
  );

  const updateValue = useCallback(
    async (id: string, value: Partial<Value>) => {
      try {
        await valuesMutations.update.mutateAsync({ id, ...value });
        await refreshData();
      } catch (error) {
        console.error("Failed to update value:", error);
      }
    },
    [valuesMutations.update, refreshData],
  );

  const deleteValue = useCallback(
    async (id: string) => {
      try {
        await valuesMutations.delete.mutateAsync({ id });
        await refreshData();
      } catch (error) {
        console.error("Failed to delete value:", error);
      }
    },
    [valuesMutations.delete, refreshData],
  );

  // Calculate importance based on outgoing edge weights
  const calculateImportance = useCallback(
    (goalId: string): "Low" | "Medium" | "High" => {
      const outgoingConnections = connections.filter((c) => c.source === goalId);

      if (outgoingConnections.length === 0) return "Low";

      const totalWeight = outgoingConnections.reduce((sum, conn) => sum + conn.weight, 0);
      const averageWeight = totalWeight / outgoingConnections.length;

      if (averageWeight <= 33.3) return "Low";
      if (averageWeight < 66.6) return "Medium";
      return "High"; // averageWeight <= 100
    },
    [connections],
  );

  // Goal operations
  const addGoal = useCallback(
    async (goal: CreateGoal) => {
      try {
        await goalsMutations.create.mutateAsync(goal);
        await refreshData();
      } catch (error) {
        console.error("Failed to add goal:", error);
      }
    },
    [goalsMutations.create, refreshData],
  );

  const updateGoal = useCallback(
    async (id: string, goal: Partial<Goal>) => {
      try {
        // Remove importance from the goal object since it's calculated on the backend
        const { importance: _importance, ...goalData } = goal;
        void _importance;
        await goalsMutations.update.mutateAsync({ id, ...goalData });
        await refreshData();
      } catch (error) {
        console.error("Failed to update goal:", error);
      }
    },
    [goalsMutations.update, refreshData],
  );

  const deleteGoal = useCallback(
    async (id: string) => {
      try {
        await goalsMutations.delete.mutateAsync({ id });
        await refreshData();
      } catch (error) {
        console.error("Failed to delete goal:", error);
      }
    },
    [goalsMutations.delete, refreshData],
  );

  // Task operations
  const addTask = useCallback(
    async (goalId: string, task: Omit<Task, "id">) => {
      try {
        await tasksMutations.create.mutateAsync({ ...task, goalId });
        await refreshData();
      } catch (error) {
        console.error("Failed to add task:", error);
      }
    },
    [tasksMutations.create, refreshData],
  );

  const updateTask = useCallback(
    async (goalId: string, taskId: string, task: Partial<Task>) => {
      try {
        await tasksMutations.update.mutateAsync({ id: taskId, goalId, ...task });
        await refreshData();
      } catch (error) {
        console.error("Failed to update task:", error);
      }
    },
    [tasksMutations.update, refreshData],
  );

  const deleteTask = useCallback(
    async (goalId: string, taskId: string) => {
      try {
        await tasksMutations.delete.mutateAsync({ id: taskId, goalId });
        await refreshData();
      } catch (error) {
        console.error("Failed to delete task:", error);
      }
    },
    [tasksMutations.delete, refreshData],
  );

  // Connection operations
  const addConnection = useCallback(
    async (connection: Omit<Connection, "id">) => {
      try {
        await connectionsMutations.create.mutateAsync(connection);
        await refreshData();
      } catch (error) {
        console.error("Failed to add connection:", error);
      }
    },
    [connectionsMutations.create, refreshData],
  );

  const updateConnection = useCallback(
    async (id: string, connection: Partial<Connection>) => {
      try {
        await connectionsMutations.update.mutateAsync({ id, ...connection });
        await refreshData();
      } catch (error) {
        console.error("Failed to update connection:", error);
      }
    },
    [connectionsMutations.update, refreshData],
  );

  const deleteConnection = useCallback(
    async (id: string) => {
      try {
        await connectionsMutations.delete.mutateAsync({ id });
        await refreshData();
      } catch (error) {
        console.error("Failed to delete connection:", error);
      }
    },
    [connectionsMutations.delete, refreshData],
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
        await refreshData();
      } catch (error) {
        console.error("Failed to add tracking item:", error);
      }
    },
    [trackingItemsMutations.create, refreshData],
  );

  const updateTrackingItem = useCallback(
    async (id: string, trackingItem: Partial<TrackingItem>) => {
      try {
        await trackingItemsMutations.update.mutateAsync({ id, ...trackingItem });
        await refreshData();
      } catch (error) {
        console.error("Failed to update tracking item:", error);
      }
    },
    [trackingItemsMutations.update, refreshData],
  );

  const deleteTrackingItem = useCallback(
    async (id: string): Promise<{ success: boolean; type: "soft_delete" | "hard_delete" }> => {
      try {
        const result = await trackingItemsMutations.delete.mutateAsync({ id });
        await refreshData();
        return result;
      } catch (error) {
        console.error("Failed to delete tracking item:", error);
        throw error;
      }
    },
    [trackingItemsMutations.delete, refreshData],
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
        await refreshData();
        return result;
      } catch (error) {
        console.error("Failed to create weekly sync:", error);
        throw error;
      }
    },
    [weeklySyncMutations.create, refreshData],
  );

  const createWeeklySyncItem = useCallback(
    async (weeklySyncId: string, trackingItemId: string): Promise<WeeklySyncItem> => {
      try {
        const result = await syncItemMutations.addItem.mutateAsync({
          weeklySyncId,
          trackingItemId,
        });
        await refreshData();
        return result;
      } catch (error) {
        console.error("Failed to add sync item:", error);
        throw error;
      }
    },
    [syncItemMutations.addItem, refreshData],
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
        await refreshData();
      } catch (error) {
        console.error("Failed to delete attachment:", error);
        throw error;
      }
    },
    [attachmentsMutations.delete, refreshData],
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
    authenticate,
    register,
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
