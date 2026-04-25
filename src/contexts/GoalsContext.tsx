"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { clientAuth } from "~/lib/auth-client";
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
  WeeklySyncItemFile,
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [values, setValues] = useState<Value[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(false);

  // Initialize token state
  const [token, setToken] = useState<string | null>(null);

  // tRPC queries and mutations
  const verifyQuery = api.auth.verify.useQuery(
    { token: token ?? "" },
    {
      enabled: !!token,
      retry: false,
    },
  );

  const dataQuery = api.goals.data.getAll.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchOnWindowFocus: false,
  });

  const authMutation = api.auth.authenticate.useMutation();
  const registerMutation = api.auth.register.useMutation();

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

  const weeklySyncItemsMutations = {
    create: api.goals.weeklySyncItems.create.useMutation(),
  };

  const filesMutations = {
    create: api.goals.weeklySyncItemFiles.create.useMutation(),
    delete: api.goals.weeklySyncItemFiles.delete.useMutation(),
    readTrackingItemText: api.goals.weeklySyncItemFiles.readTrackingItemText.useQuery,
  };

  // Initialize token on mount (client-side only)
  useEffect(() => {
    // Small delay to ensure client-side hydration
    setTimeout(() => {
      const cookieToken = clientAuth.getToken();
      setToken(cookieToken);

      // If no token, immediately set not authenticated
      if (!cookieToken) {
        setIsAuthenticated(false);
        setIsLoading(false);
      }
    }, 0);
  }, []); // Only run once on mount

  // Handle token verification — derive during render rather than setState-in-effect.
  // We track the last processed data via state so setState only runs on real change.
  const [lastVerifyData, setLastVerifyData] = useState<typeof verifyQuery.data | undefined>(undefined);
  if (token && !verifyQuery.isLoading && verifyQuery.data !== undefined && verifyQuery.data !== lastVerifyData) {
    setLastVerifyData(verifyQuery.data);
    if (verifyQuery.data.isValid) {
      setIsAuthenticated(true);
    } else {
      setIsAuthenticated(false);
    }
    setIsLoading(false);
  }

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
      const result = await authMutation.mutateAsync({ email, password });

      if (result.success && result.token) {
        // Store token in cookie
        clientAuth.setCookie(result.token);
        // Update state
        setToken(result.token);
        setIsAuthenticated(true);
        return true;
      }
    } catch {
      // Authentication failed
      return false;
    }

    return false;
  };

  const register = async (name: string, email: string, password: string): Promise<boolean> => {
    try {
      const result = await registerMutation.mutateAsync({ name, email, password });

      if (result.success && result.token) {
        // Store token in cookie
        clientAuth.setCookie(result.token);
        // Update state
        setToken(result.token);
        setIsAuthenticated(true);
        return true;
      }
    } catch {
      // Registration failed
      return false;
    }

    return false;
  };

  const logout = () => {
    clientAuth.clearCookie();
    setToken(null);
    setIsAuthenticated(false);
  };

  const checkAuthentication = async () => {
    const currentToken = clientAuth.getToken();
    setToken(currentToken);
    if (!currentToken) {
      setIsAuthenticated(false);
      return;
    }

    // This will trigger a re-fetch of the verify query
    await verifyQuery.refetch();
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
  const utils = api.useUtils(); // provides access to tRPC's utility functions for cache management and manual query operations. It's essentially tRPC's way of giving you direct control over the query cache and data fetching.

  const getTrackingItems = useCallback(
    async (goalId: string): Promise<TrackingItem[]> => {
      try {
        const data = await utils.goals.trackingItems.getAll.fetch({ goalId });
        return data || [];
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
        return result as { success: boolean; type: "soft_delete" | "hard_delete" };
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
        const result = await weeklySyncItemsMutations.create.mutateAsync({
          weeklySyncId,
          trackingItemId,
        });
        await refreshData();
        return result;
      } catch (error) {
        console.error("Failed to create weekly sync item:", error);
        throw error;
      }
    },
    [weeklySyncItemsMutations.create, refreshData],
  );

  // Helper function to ensure WeeklySyncItem exists for a given weeklySyncId and trackingItemId
  const ensureWeeklySyncItem = useCallback(
    async (weeklySyncId: string, trackingItemId: string): Promise<string> => {
      try {
        const result = await weeklySyncItemsMutations.create.mutateAsync({
          weeklySyncId,
          trackingItemId,
        });
        // The backend will return existing item if it already exists
        return result.id;
      } catch (error) {
        console.error("Failed to ensure weekly sync item exists:", error);
        throw error;
      }
    },
    [weeklySyncItemsMutations.create],
  );

  // Other files that are not text
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
        // First, ensure WeeklySyncItem exists
        const weeklySyncItemId = await ensureWeeklySyncItem(weeklySyncId, trackingItemId);

        // Then create the file
        const result = await filesMutations.create.mutateAsync({
          weeklySyncItemId,
          fileName,
          fileType,
          data,
          isText,
        });
        return result;
      } catch (error) {
        console.error("Failed to upload weekly sync file:", error);
        throw error;
      }
    },
    [filesMutations.create, ensureWeeklySyncItem],
  );

  // Exclusively for text files
  const saveTextFile = useCallback(
    async (
      content: string,
      weeklySyncId: string,
      trackingItemId: string,
      existingFileName?: string,
    ): Promise<{ url: string; fileName: string; filePath: string; fileType: string }> => {
      try {
        // First, ensure WeeklySyncItem exists
        const weeklySyncItemId = await ensureWeeklySyncItem(weeklySyncId, trackingItemId);

        // Then create/update the text file
        const result = await filesMutations.create.mutateAsync({
          weeklySyncItemId,
          fileName: existingFileName ?? "notes.txt",
          fileType: "document",
          data: content,
          isText: true,
        });
        return result;
      } catch (error) {
        console.error("Failed to save text file:", error);
        throw error;
      }
    },
    [filesMutations.create, ensureWeeklySyncItem],
  );

  // Delete weekly sync file
  const deleteWeeklySyncFile = useCallback(
    async (fileId: string): Promise<void> => {
      try {
        await filesMutations.delete.mutateAsync({ id: fileId });
        await refreshData();
      } catch (error) {
        console.error("Failed to delete weekly sync file:", error);
        throw error;
      }
    },
    [filesMutations.delete, refreshData],
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

  // Progress calculation functions (unchanged logic)
  const getGoalCompletion = (goalId: string): number => {
    const goal = goals.find((g) => g.id === goalId);
    if (!goal || goal.tasks.length === 0) return 0;

    const totalWeight = goal.tasks.reduce((sum, task) => sum + task.difficulty, 0);
    const completedWeight = goal.tasks.filter((task) => task.completed).reduce((sum, task) => sum + task.difficulty, 0);

    return totalWeight > 0 ? (completedWeight / totalWeight) * 100 : 0;
  };

  const getPathCompletion = (goalId: string): number => {
    const getAncestors = (id: string): string[] => {
      const goal = goals.find((g) => g.id === id);
      if (!goal?.parentId) return [id];
      return [...getAncestors(goal.parentId), id];
    };

    const ancestors = getAncestors(goalId);
    const completions = ancestors.map((id) => getGoalCompletion(id));

    return completions.length > 0 ? completions.reduce((sum, val) => sum + val, 0) / completions.length : 0;
  };

  // Single source of truth for goal progress calculation
  const getGoalProgress = (
    goalId: string,
  ): { ownProgress: number; dependenciesProgress: number; totalProgress: number } => {
    const goal = goals.find((g) => g.id === goalId);
    if (!goal) return { ownProgress: 0, dependenciesProgress: 0, totalProgress: 0 };

    // Get own task completion
    const ownProgress = getGoalCompletion(goalId);

    // Find predecessor connections (goals that connect TO this goal)
    const predecessorConnections = connections.filter((c) => c.target === goalId);

    // If no predecessors, return just own completion
    if (predecessorConnections.length === 0) {
      return { ownProgress, dependenciesProgress: 0, totalProgress: ownProgress };
    }

    // Calculate weighted average of predecessor completions
    let totalPredWeight = 0;
    let weightedPredCompletion = 0;

    for (const conn of predecessorConnections) {
      const predGoal = goals.find((g) => g.id === conn.source);
      if (predGoal) {
        // Recursively get the total progress of the predecessor
        const predProgress = getGoalProgress(conn.source).totalProgress;
        const weight = conn.weight || 1;
        totalPredWeight += weight;
        weightedPredCompletion += predProgress * weight;
      }
    }

    const dependenciesProgress = totalPredWeight > 0 ? weightedPredCompletion / totalPredWeight : 0;

    // Calculate final progress: 40% own tasks + 60% predecessors
    // If no tasks but has predecessors, give more weight to predecessors
    const hasOwnTasks = goal.tasks && goal.tasks.length > 0;
    const ownWeight = hasOwnTasks ? 0.4 : 0.1;
    const predWeight = hasOwnTasks ? 0.6 : 0.9;

    // Ensure the result is between 0 and 100
    const totalProgress = Math.min(100, Math.max(0, ownProgress * ownWeight + dependenciesProgress * predWeight));

    return {
      ownProgress: Math.min(100, Math.max(0, ownProgress)),
      dependenciesProgress: Math.min(100, Math.max(0, dependenciesProgress)),
      totalProgress,
    };
  };

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
