"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { clientAuth } from "~/lib/auth-client";
import { api } from "~/trpc/react";
import type { Value, Goal, Task, Connection, TrackingItem } from "~/lib/api/types";

// Re-export types from the shared API types
export type { Value, Goal, Task, Connection, TrackingItem } from "~/lib/api/types";

interface GoalsContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  values: Value[];
  goals: Goal[];
  connections: Connection[];
  isDataLoading: boolean;

  authenticate: (password: string, userName: string) => Promise<boolean>;
  logout: () => void;
  checkAuthentication: () => Promise<void>;

  refreshData: () => Promise<void>;

  addValue: (value: Omit<Value, "id">) => Promise<void>;
  updateValue: (id: string, value: Partial<Value>) => Promise<void>;
  deleteValue: (id: string) => Promise<void>;

  addGoal: (goal: Omit<Goal, "id">) => Promise<void>;
  updateGoal: (id: string, goal: Partial<Goal>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;

  addTask: (goalId: string, task: Omit<Task, "id">) => Promise<void>;
  updateTask: (goalId: string, taskId: string, task: Partial<Task>) => Promise<void>;
  deleteTask: (goalId: string, taskId: string) => Promise<void>;

  addConnection: (connection: Omit<Connection, "id">) => Promise<void>;
  updateConnection: (id: string, connection: Partial<Connection>) => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;

  getTrackingItems: (goalId: string) => Promise<TrackingItem[]>;
  addTrackingItem: (trackingItem: Omit<TrackingItem, "id">) => Promise<void>;
  updateTrackingItem: (id: string, trackingItem: Partial<TrackingItem>) => Promise<void>;
  deleteTrackingItem: (id: string) => Promise<{ success: boolean; type: "soft_delete" | "hard_delete" }>;

  getGoalCompletion: (goalId: string) => number;
  getPathCompletion: (goalId: string) => number;
  getGoalProgress: (goalId: string) => { ownProgress: number; dependenciesProgress: number; totalProgress: number };
  calculateImportance: (goalId: string) => "Low" | "Medium" | "High";
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

  // Handle token verification
  useEffect(() => {
    if (!token) return;

    if (verifyQuery.isLoading) return;

    if (verifyQuery.data?.isValid) {
      setIsAuthenticated(true);
      setIsLoading(false);
    } else if (verifyQuery.data !== undefined) {
      setIsAuthenticated(false);
      setIsLoading(false);
    }
  }, [token, verifyQuery.data, verifyQuery.isLoading]);

  // Handle data loading when authenticated
  useEffect(() => {
    if (dataQuery.data) {
      setValues(dataQuery.data.values ?? []);
      setGoals(dataQuery.data.goals ?? []);
      setConnections(dataQuery.data.connections ?? []);
    }
    setIsDataLoading(dataQuery.isLoading);
  }, [dataQuery.data, dataQuery.isLoading]);

  const authenticate = async (password: string, userName: string): Promise<boolean> => {
    try {
      const result = await authMutation.mutateAsync({ password, userName });

      if (result.success && result.token) {
        // Store token in cookie
        clientAuth.setCookie(result.token);
        // Update state
        setToken(result.token);
        setIsAuthenticated(true);
        return true;
      }
    } catch (error) {
      // Authentication failed
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
    async (goal: Omit<Goal, "id">) => {
      try {
        const { importance, ...goalData } = goal;
        await goalsMutations.create.mutateAsync(goalData);
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
        const { importance, ...goalData } = goal;
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
  const utils = api.useUtils();

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
    async (trackingItem: Omit<TrackingItem, "id">) => {
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
    async (id: string) => {
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
    getGoalCompletion,
    getPathCompletion,
    getGoalProgress,
    calculateImportance,
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
