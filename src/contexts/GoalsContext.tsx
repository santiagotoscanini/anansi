"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { clientAuth } from "~/lib/auth-client";
import { api } from "~/trpc/react";
import { FileSystemManager, type GoalsData } from "~/lib/file-system";

export interface Value {
  id: string;
  name: string;
  color: string;
}

export interface Task {
  id: string;
  title: string;
  difficulty: 1 | 2 | 3;
  completed: boolean;
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  valueIds: string[];
  importance: number;
  tasks: Task[];
  parentId?: string;
  position: { x: number; y: number };
}

export interface Connection {
  id: string;
  source: string;
  target: string;
  weight: number;
}

export interface WeeklyReview {
  id: string;
  week: string;
  goalIds: string[];
  notes: string;
  photos: string[];
  categories: string[];
}

interface GoalsContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  values: Value[];
  goals: Goal[];
  connections: Connection[];
  weeklyReviews: WeeklyReview[];
  currentFileName: string | null;
  hasUnsavedChanges: boolean;

  authenticate: (password: string) => Promise<boolean>;
  logout: () => void;
  checkAuthentication: () => Promise<void>;

  openFile: () => Promise<void>;
  saveFile: (isUserActivated?: boolean) => Promise<boolean>;
  saveAsNewFile: () => Promise<void>;

  addValue: (value: Omit<Value, "id">) => void;
  updateValue: (id: string, value: Partial<Value>) => void;
  deleteValue: (id: string) => void;

  addGoal: (goal: Omit<Goal, "id">) => void;
  updateGoal: (id: string, goal: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;

  addTask: (goalId: string, task: Omit<Task, "id">) => void;
  updateTask: (goalId: string, taskId: string, task: Partial<Task>) => void;
  deleteTask: (goalId: string, taskId: string) => void;

  addConnection: (connection: Omit<Connection, "id">) => void;
  updateConnection: (id: string, connection: Partial<Connection>) => void;
  deleteConnection: (id: string) => void;

  addWeeklyReview: (review: Omit<WeeklyReview, "id">) => void;
  updateWeeklyReview: (id: string, review: Partial<WeeklyReview>) => void;
  deleteWeeklyReview: (id: string) => void;

  getGoalCompletion: (goalId: string) => number;
  getPathCompletion: (goalId: string) => number;
  getGoalProgress: (goalId: string) => { ownProgress: number; dependenciesProgress: number; totalProgress: number };
}

const GoalsContext = createContext<GoalsContextType | undefined>(undefined);

export function GoalsProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [values, setValues] = useState<Value[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [weeklyReviews, setWeeklyReviews] = useState<WeeklyReview[]>([]);
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const fileManager = useRef(new FileSystemManager());

  // Initialize token state
  const [token, setToken] = useState<string | null>(null);

  // Use tRPC to verify token
  const verifyQuery = api.auth.verify.useQuery(
    { token: token ?? "" },
    {
      enabled: !!token,
      retry: false,
    },
  );

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

      // Restore files
      const initializeFile = async () => {
        try {
          const data = await fileManager.current.initialize();
          if (data) {
            setValues(data.values ?? []);
            setGoals(data.goals ?? []);
            setConnections(data.connections ?? []);
            setWeeklyReviews(data.weeklyReviews ?? []);
            setCurrentFileName(fileManager.current.getFileName());
            setHasUnsavedChanges(false);
          }
        } catch (error) {
          // Ignore errors
        }
      };
      void initializeFile();
    } else if (verifyQuery.data !== undefined) {
      setIsAuthenticated(false);
      setIsLoading(false);
    }
  }, [token, verifyQuery.data, verifyQuery.isLoading]);

  // File operations
  const openFile = useCallback(async () => {
    const data = await fileManager.current.openFile();
    if (data) {
      setValues(data.values ?? []);
      setGoals(data.goals ?? []);
      setConnections(data.connections ?? []);
      setWeeklyReviews(data.weeklyReviews ?? []);
      setCurrentFileName(fileManager.current.getFileName());
      setHasUnsavedChanges(false);
    }
  }, []);

  const saveFile = useCallback(
    async (isUserActivated = false) => {
      const data: GoalsData = {
        version: "1.0.0",
        values,
        goals,
        connections,
        weeklyReviews,
        lastModified: new Date().toISOString(),
      };

      const success = await fileManager.current.saveToFile(data, isUserActivated);
      if (success) {
        setHasUnsavedChanges(false);
        setCurrentFileName(fileManager.current.getFileName());
      }
      return success;
    },
    [values, goals, connections, weeklyReviews],
  );

  const saveAsNewFile = useCallback(async () => {
    // Create empty data for new file
    const data: GoalsData = {
      version: "1.0.0",
      values: [],
      goals: [],
      connections: [],
      weeklyReviews: [],
      lastModified: new Date().toISOString(),
    };

    const success = await fileManager.current.saveAsNewFile(data);
    if (success) {
      // Clear current data and set up new file
      setValues([]);
      setGoals([]);
      setConnections([]);
      setWeeklyReviews([]);
      setHasUnsavedChanges(false);
      setCurrentFileName(fileManager.current.getFileName());
    }
  }, []);

  // Mark as changed when data changes (only if file is open and data actually changed)
  useEffect(() => {
    if (
      fileManager.current.hasOpenFile() &&
      (values.length > 0 || goals.length > 0 || connections.length > 0 || weeklyReviews.length > 0)
    ) {
      setHasUnsavedChanges(true);
    }
  }, [values, goals, connections, weeklyReviews]);

  const authMutation = api.auth.authenticate.useMutation();

  const authenticate = async (password: string): Promise<boolean> => {
    try {
      const result = await authMutation.mutateAsync({ password });

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

  const addValue = (value: Omit<Value, "id">) => {
    const newValue = { ...value, id: crypto.randomUUID() };
    setValues((prev) => [...prev, newValue]);
  };

  const updateValue = (id: string, value: Partial<Value>) => {
    setValues((prev) => prev.map((v) => (v.id === id ? { ...v, ...value } : v)));
  };

  const deleteValue = (id: string) => {
    setValues((prev) => prev.filter((v) => v.id !== id));
    setGoals((prev) =>
      prev.map((g) => ({
        ...g,
        valueIds: g.valueIds.filter((vid) => vid !== id),
      })),
    );
  };

  const addGoal = (goal: Omit<Goal, "id">) => {
    const newGoal = { ...goal, id: crypto.randomUUID() };
    setGoals((prev) => [...prev, newGoal]);
  };

  const updateGoal = (id: string, goal: Partial<Goal>) => {
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, ...goal } : g)));
  };

  const deleteGoal = (id: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== id));
    setConnections((prev) => prev.filter((c) => c.source !== id && c.target !== id));
  };

  const addTask = (goalId: string, task: Omit<Task, "id">) => {
    const newTask = { ...task, id: crypto.randomUUID() };
    setGoals((prev) => prev.map((g) => (g.id === goalId ? { ...g, tasks: [...g.tasks, newTask] } : g)));
  };

  const updateTask = (goalId: string, taskId: string, task: Partial<Task>) => {
    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId
          ? {
              ...g,
              tasks: g.tasks.map((t) => (t.id === taskId ? { ...t, ...task } : t)),
            }
          : g,
      ),
    );
  };

  const deleteTask = (goalId: string, taskId: string) => {
    setGoals((prev) =>
      prev.map((g) => (g.id === goalId ? { ...g, tasks: g.tasks.filter((t) => t.id !== taskId) } : g)),
    );
  };

  const addConnection = (connection: Omit<Connection, "id">) => {
    const newConnection = { ...connection, id: crypto.randomUUID() };
    setConnections((prev) => [...prev, newConnection]);
  };

  const updateConnection = (id: string, connection: Partial<Connection>) => {
    setConnections((prev) => prev.map((c) => (c.id === id ? { ...c, ...connection } : c)));
  };

  const deleteConnection = (id: string) => {
    setConnections((prev) => prev.filter((c) => c.id !== id));
  };

  const addWeeklyReview = (review: Omit<WeeklyReview, "id">) => {
    const newReview = { ...review, id: crypto.randomUUID() };
    setWeeklyReviews((prev) => [...prev, newReview]);
  };

  const updateWeeklyReview = (id: string, review: Partial<WeeklyReview>) => {
    setWeeklyReviews((prev) => prev.map((r) => (r.id === id ? { ...r, ...review } : r)));
  };

  const deleteWeeklyReview = (id: string) => {
    setWeeklyReviews((prev) => prev.filter((r) => r.id !== id));
  };

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
        const weight = (conn.weight || 1) * (predGoal.importance || 5);
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
    weeklyReviews,
    currentFileName,
    hasUnsavedChanges,
    authenticate,
    logout,
    checkAuthentication,
    openFile,
    saveFile,
    saveAsNewFile,
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
    addWeeklyReview,
    updateWeeklyReview,
    deleteWeeklyReview,
    getGoalCompletion,
    getPathCompletion,
    getGoalProgress,
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
