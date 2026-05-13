"use client";

import { useCallback, useState, useEffect } from "react";
import { ReactFlow, MiniMap, Controls, Background, useNodesState, useEdgesState, getOutgoers } from "@xyflow/react";
import type { Connection, Edge, Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { HelpCircle, Plus, Target } from "lucide-react";
import { createId } from "@paralleldrive/cuid2";
import { useGoals } from "~/contexts/GoalsContext";
import type { Goal } from "~/lib/api/types";
import GoalNodeComponent from "./GoalNode";
import GoalModal from "./GoalModal";
import EditableEdge from "./EditableEdge";
import DeleteConfirmationModal from "./DeleteConfirmationModal";
import GraphMathHelpModal from "./GraphMathHelpModal";
import toast from "react-hot-toast";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GoalNode = Node<any>;

const nodeTypes = {
  goalNode: GoalNodeComponent,
};

const edgeTypes = {
  editableEdge: EditableEdge,
};

export default function GoalsGraph() {
  const { goals, connections, updateGoal, addGoal, addConnection, deleteConnection, deleteGoal, getGoalProgress } =
    useGoals();

  const [nodes, setNodes, onNodesChange] = useNodesState<GoalNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copiedGoal, setCopiedGoal] = useState<Goal | null>(null);
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<string[]>([]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [goalsToDelete, setGoalsToDelete] = useState<Goal[]>([]);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // Map goals → nodes, preserving object identity for unchanged goals.
  //
  // Why surgical reconciliation matters: `setNodes` with a wholly new array
  // forces React Flow to re-measure every node via ResizeObserver. If the
  // user starts a new drag before the measurement cycle completes, RF emits
  // error #015 ("trying to drag a node that is not initialized"). We avoid
  // that by reusing the previous node object for any goal whose underlying
  // ref + selection haven't changed.
  //
  // TanStack Query's default structural sharing keeps the same `goal`
  // reference between refetches as long as that goal didn't change, so a
  // simple `_goalRef === goal` check is enough — no deep compare needed.
  useEffect(() => {
    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      let allReused = goals.length === prev.length;

      const next: GoalNode[] = goals.map((goal) => {
        const existing = prevById.get(goal.id);
        const wantSelected = selectedNodes.includes(goal.id);
        if (
          existing &&
          (existing.data as { _goalRef?: Goal })._goalRef === goal &&
          existing.selected === wantSelected
        ) {
          return existing;
        }
        allReused = false;
        return {
          id: goal.id,
          type: "goalNode",
          position: goal.position,
          selected: wantSelected,
          data: {
            ...goal,
            _goalRef: goal,
            onEdit: () => {
              setSelectedGoal(goal.id);
              setIsModalOpen(true);
            },
          },
        };
      });

      // If every node is the same reference as before, return the previous
      // array so React Flow's internal node tracking stays put.
      return allReused ? prev : next;
    });
  }, [goals, selectedNodes, setNodes]);

  // Convert connections to edges with selection styling
  useEffect(() => {
    const newEdges = connections.map((conn) => ({
      id: conn.id,
      source: conn.source,
      target: conn.target,
      sourceHandle: "right",
      targetHandle: "left",
      animated: true,
      selected: selectedEdges.includes(conn.id),
      selectable: true,
      style: {
        strokeWidth: 2,
        cursor: "pointer",
      },
      type: "editableEdge",
    }));
    setEdges(newEdges);
  }, [connections, selectedEdges, setEdges]);

  // Validate connection to prevent cycles and duplicates
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (!connection.source || !connection.target) {
        return false;
      }

      // Prevent self-connections
      if (connection.source === connection.target) {
        return false;
      }

      // Check if connection already exists
      const exists = edges.some((edge) => edge.source === connection.source && edge.target === connection.target);
      if (exists) {
        return false;
      }

      // Find the target node
      const target = nodes.find((node) => node.id === connection.target);
      if (!target) return false;

      // Cycle detection using DFS
      const hasCycle = (node: Node, visited = new Set<string>()) => {
        if (visited.has(node.id)) return false;

        visited.add(node.id);

        for (const outgoer of getOutgoers(node, nodes, edges)) {
          if (outgoer.id === connection.source) return true;
          if (hasCycle(outgoer, visited)) return true;
        }

        return false;
      };

      return !hasCycle(target);
    },
    [nodes, edges],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (params.source && params.target) {
        void addConnection({
          source: params.source,
          target: params.target,
          weight: 1,
        });
        toast.success("Goals connected");
      }
    },
    [addConnection],
  );

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node, nodes?: Node[]) => {
      // If multiple nodes were dragged, update all of them
      if (nodes && nodes.length > 1) {
        // Filter to only selected nodes that were actually moved
        const movedNodes = nodes.filter((n) => n.selected);

        // Update all moved nodes' positions
        movedNodes.forEach((movedNode) => {
          void updateGoal(movedNode.id, { position: movedNode.position });
        });
      } else {
        // Fallback: single node drag (existing behavior)
        void updateGoal(node.id, { position: node.position });
      }
    },
    [updateGoal],
  );

  const onEdgeDelete = useCallback(
    (edges: Edge[]) => {
      edges.forEach((edge) => {
        const connection = connections.find((c) => c.id === edge.id);
        if (connection) {
          void deleteConnection(connection.id);
        }
      });
    },
    [connections, deleteConnection],
  );

  const onSelectionChange = useCallback((params: { nodes: Node[]; edges: Edge[] }) => {
    setSelectedNodes(params.nodes.map((n) => n.id));
    setSelectedEdges(params.edges.map((e) => e.id));
  }, []);

  const handleAddGoal = () => {
    setSelectedGoal(null);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedGoal(null);
  };

  const handleDeleteConfirm = async () => {
    try {
      for (const goal of goalsToDelete) {
        await deleteGoal(goal.id);
      }
      toast.success(`Deleted ${goalsToDelete.length} goal${goalsToDelete.length > 1 ? "s" : ""}`);
      setSelectedNodes([]);
      setGoalsToDelete([]);
      setIsDeleteModalOpen(false);
    } catch (error) {
      toast.error("Failed to delete goals");
      console.error(error);
    }
  };

  const handleDeleteCancel = () => {
    setIsDeleteModalOpen(false);
    setGoalsToDelete([]);
  };

  // Keyboard shortcuts for adding new goal, copy/paste, and delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+G or Cmd+G for new goal
      if ((e.ctrlKey || e.metaKey) && e.key === "g") {
        e.preventDefault();
        handleAddGoal();
      }

      // Ctrl+C or Cmd+C for copy
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && !isModalOpen) {
        e.preventDefault();
        if (selectedNodes.length > 0) {
          const goalToCopy = goals.find((g) => g.id === selectedNodes[0]);
          if (goalToCopy) {
            setCopiedGoal(goalToCopy);
            toast.success("Goal copied");
          }
        }
      }

      // Ctrl+V or Cmd+V for paste
      if ((e.ctrlKey || e.metaKey) && e.key === "v" && !isModalOpen && copiedGoal) {
        e.preventDefault();

        // Generate fresh cuid2 ids for each pasted task. Sending the source
        // ids would cause a primary-key collision with the still-existing
        // source tasks (and on a second paste, with the first paste's
        // tasks). referentIds + groupIds intentionally don't carry through
        // — those are relationship semantics that shouldn't silently
        // duplicate just because someone copied the goal card.
        const tasksWithFreshIds = copiedGoal.tasks.map((t) => ({
          ...t,
          id: createId(),
          referentIds: [],
          groupIds: [],
        }));

        const goalData = {
          title: `${copiedGoal.title} (Copy)`,
          description: copiedGoal.description,
          emoji: copiedGoal.emoji,
          valueIds: copiedGoal.valueIds,
          tasks: tasksWithFreshIds,
          parentId: copiedGoal.parentId,
          position: {
            x: copiedGoal.position.x + 50,
            y: copiedGoal.position.y + 50,
          },
        };
        void addGoal(goalData);
        toast.success("Goal pasted");
      }

      // Delete or Backspace to delete selected nodes or edges
      if ((e.key === "Delete" || e.key === "Backspace") && !isModalOpen && !isDeleteModalOpen) {
        e.preventDefault();

        // Priority: Delete nodes if any are selected
        if (selectedNodes.length > 0) {
          const nodesToDelete = goals.filter((g) => selectedNodes.includes(g.id));
          setGoalsToDelete(nodesToDelete);
          setIsDeleteModalOpen(true);
        }
        // Otherwise, delete edges
        else if (selectedEdges.length > 0) {
          selectedEdges.forEach((edgeId) => {
            const connection = connections.find((c) => c.id === edgeId);
            if (connection) {
              void deleteConnection(connection.id);
            }
          });
          toast.success(`Deleted ${selectedEdges.length} connection${selectedEdges.length > 1 ? "s" : ""}`);
          setSelectedEdges([]);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedNodes,
    selectedEdges,
    copiedGoal,
    isModalOpen,
    isDeleteModalOpen,
    goals,
    connections,
    addGoal,
    deleteConnection,
  ]);

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--paper)" }}>
      {/* Warm ScreenHeader on top of the graph — matches the design's
          Objectives view. New Goal + How-it-works moved into the action
          row instead of floating chips on the canvas. */}
      <header className="shrink-0 px-6 pb-7 pt-10 md:px-12" style={{ borderBottom: "1px solid var(--hairline)" }}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.08em",
                color: "var(--ink-3)",
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              Goals · objectives
            </div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 44,
                lineHeight: 1.2,
                letterSpacing: "-0.02em",
                color: "var(--ink)",
              }}
            >
              A graph of what <span className="brand-em">I want.</span>
            </h1>
            <p
              className="mt-3 max-w-2xl"
              style={{
                fontFamily: "var(--font-text)",
                fontStyle: "italic",
                fontSize: 17,
                color: "var(--ink-2)",
                lineHeight: 1.4,
              }}
            >
              Cards on a free-positioned canvas. Edges carry weight. Look at the canvas and the heaviness shows you
              where to look.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setIsHelpOpen(true)}
              className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm transition-all"
              style={{
                background: "var(--canvas)",
                color: "var(--ink)",
                border: "1px solid var(--hairline-2)",
                boxShadow: "var(--shadow-sm)",
              }}
              title="How are progress and importance calculated?"
            >
              <HelpCircle className="h-4 w-4" />
              <span className="hidden sm:inline">How it works</span>
            </button>
            <button
              onClick={handleAddGoal}
              className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm transition-all"
              style={{
                background: "var(--clay)",
                color: "var(--paper)",
                boxShadow: "var(--shadow-sm)",
              }}
              title="Add new goal (Ctrl+G)"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New goal</span>
            </button>
          </div>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        {/* React Flow Graph */}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          minZoom={0.001}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          onEdgesDelete={onEdgeDelete}
          onSelectionChange={onSelectionChange}
          isValidConnection={isValidConnection}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          className="bg-[var(--paper)]"
        >
          <Controls className="!rounded-lg !border-[var(--hairline-2)] !bg-[var(--canvas)] !shadow-sm [&>button:hover]:!bg-[var(--vellum)] [&>button>svg]:!fill-[var(--ink-2)] [&>button]:!border-b [&>button]:!border-[var(--hairline)] [&>button]:!bg-[var(--canvas)] [&>button]:!text-[var(--ink)]" />
          {/* MiniMap is dead weight on a phone — hide on small screens to free real estate. */}
          <MiniMap
            className="!hidden !border-[var(--hairline-2)] !bg-[var(--vellum)] md:!block"
            nodeColor={(node) => {
              const goal = goals.find((g) => g.id === node.id);
              if (!goal) return "oklch(0.72 0.012 65)";
              const completion = getGoalProgress(goal.id).totalProgress;
              if (completion < 33) return "oklch(0.55 0.14 28)"; // rust
              if (completion < 67) return "oklch(0.72 0.13 75)"; // amber
              return "oklch(0.55 0.09 135)"; // moss
            }}
          />
          {/* Warm dot grid — uses a tinted ink color (~6% opacity) so it
              reads as paper texture, not a CRT graticule. */}
          <Background color="#1c140822" gap={22} />
        </ReactFlow>

        {/* Empty State */}
        {goals.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Target className="mx-auto h-16 w-16 opacity-30" />
              <h3 className="mt-4 text-xl font-light">No goals yet</h3>
              <p className="mt-2 text-sm opacity-60">Click &quot;Add Goal&quot; to create your first goal</p>
            </div>
          </div>
        )}
      </div>

      {/* Goal Modal */}
      {isModalOpen && <GoalModal goalId={selectedGoal} onClose={handleModalClose} />}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <DeleteConfirmationModal goals={goalsToDelete} onConfirm={handleDeleteConfirm} onClose={handleDeleteCancel} />
      )}

      {/* Help Modal — explains all the math on the graph */}
      {isHelpOpen && <GraphMathHelpModal onClose={() => setIsHelpOpen(false)} />}
    </div>
  );
}
