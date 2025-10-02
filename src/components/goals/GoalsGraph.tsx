"use client";

import { useCallback, useState, useEffect } from "react";
import { ReactFlow, MiniMap, Controls, Background, useNodesState, useEdgesState, getOutgoers } from "@xyflow/react";
import type { Connection, Edge, Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus, Target } from "lucide-react";
import { useGoals, type Goal } from "~/contexts/GoalsContext";
import GoalNodeComponent from "./GoalNode";
import GoalModal from "./GoalModal";
import EditableEdge from "./EditableEdge";
import DeleteConfirmationModal from "./DeleteConfirmationModal";
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
  const { goals, connections, updateGoal, addGoal, addConnection, deleteConnection, deleteGoal, getGoalProgress } = useGoals();

  const [nodes, setNodes, onNodesChange] = useNodesState<GoalNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copiedGoal, setCopiedGoal] = useState<Goal | null>(null);
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<string[]>([]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [goalsToDelete, setGoalsToDelete] = useState<Goal[]>([]);

  // Convert goals to nodes with edit callback
  useEffect(() => {
    const newNodes: GoalNode[] = goals.map((goal) => ({
      id: goal.id,
      type: "goalNode",
      position: goal.position,
      selected: selectedNodes.includes(goal.id),
      data: {
        ...goal,
        onEdit: () => {
          setSelectedGoal(goal.id);
          setIsModalOpen(true);
        },
      },
    }));
    setNodes(newNodes);
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
        addConnection({
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
          updateGoal(movedNode.id, { position: movedNode.position });
        });
      } else {
        // Fallback: single node drag (existing behavior)
        updateGoal(node.id, { position: node.position });
      }
    },
    [updateGoal],
  );

  const onEdgeDelete = useCallback(
    (edges: Edge[]) => {
      edges.forEach((edge) => {
        const connection = connections.find((c) => c.id === edge.id);
        if (connection) {
          deleteConnection(connection.id);
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

        // Create a new goal with the same properties but new ID and slightly offset position
        const newGoal = {
          ...copiedGoal,
          id: crypto.randomUUID(),
          title: `${copiedGoal.title} (Copy)`,
          position: {
            x: copiedGoal.position.x + 50,
            y: copiedGoal.position.y + 50,
          },
        };

        // Remove the id since addGoal will create a new one
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, ...goalData } = newGoal;
        addGoal(goalData);
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
              deleteConnection(connection.id);
            }
          });
          toast.success(`Deleted ${selectedEdges.length} connection${selectedEdges.length > 1 ? "s" : ""}`);
          setSelectedEdges([]);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNodes, selectedEdges, copiedGoal, isModalOpen, isDeleteModalOpen, goals, connections, addGoal, deleteConnection]);

  return (
    <div className="h-full">
      <div className="relative h-full">
        {/* Add Goal Button */}
        <button
          onClick={handleAddGoal}
          className="absolute left-8 top-8 z-10 flex items-center gap-2 rounded-lg border border-white/20 bg-black px-4 py-2 transition-all hover:bg-white hover:text-black"
          title="Add new goal (Ctrl+G)"
        >
          <Plus className="h-4 w-4" />
          <span>Add Goal</span>
          <span className="ml-1 text-xs opacity-60">(Ctrl+G)</span>
        </button>

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
          className="bg-black"
        >
          <Controls className="!border-white/20 !bg-black [&>button>svg]:!fill-white [&>button]:!border [&>button]:!border-white/20 [&>button]:!bg-black [&>button]:!text-white" />
          <MiniMap
            className="!border-white/20 !bg-white/10"
            nodeColor={(node) => {
              const goal = goals.find((g) => g.id === node.id);
              if (!goal) return "#666";
              const completion = getGoalProgress(goal.id).totalProgress;
              if (completion < 33) return "#ef4444";
              if (completion < 67) return "#eab308";
              return "#22c55e";
            }}
          />
          <Background color="#333" gap={20} />
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
    </div>
  );
}
