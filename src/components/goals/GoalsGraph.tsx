import { useCallback, useRef, useState, useEffect } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { ReactFlow, MiniMap, Controls, Background, useNodesState, useEdgesState, getOutgoers } from '@xyflow/react'
import type { Connection, Edge, Node, ReactFlowInstance } from '@xyflow/react'
import { HelpCircle, LayoutGrid, Plus, Target } from 'lucide-react'
import { createId } from '@paralleldrive/cuid2'
import { useTranslation } from 'react-i18next'
import { useGoalProgress } from '~/lib/computation/use-goal-progress'
import {
  useArrangeGoals,
  useCreateConnection,
  useCreateGoal,
  useDeleteConnection,
  useDeleteGoal,
  useSetGoalPositions,
  useUpdateGoal,
} from '~/lib/mutations/goals-data'
import { useGoalsData } from '~/lib/queries/goals'
import type { Goal } from '~/lib/api/types'
import GoalNodeComponent from './GoalNode'
import GoalModal from './GoalModal'
import EditableEdge from './EditableEdge'
import DeleteConfirmationModal from './DeleteConfirmationModal'
import GraphMathHelpModal from './GraphMathHelpModal'
import toast from 'react-hot-toast'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GoalNode = Node<any>

const nodeTypes = {
  goalNode: GoalNodeComponent,
}

const edgeTypes = {
  editableEdge: EditableEdge,
}

export default function GoalsGraph() {
  const { t } = useTranslation()
  const { goals, connections } = useGoalsData()
  const { getGoalProgress } = useGoalProgress(goals, connections)
  const updateGoal = useUpdateGoal()
  const addGoal = useCreateGoal()
  const addConnection = useCreateConnection()
  const deleteConnection = useDeleteConnection()
  const deleteGoal = useDeleteGoal()
  const arrange = useArrangeGoals()
  const setPositions = useSetGoalPositions()
  // The canvas, for bringing the whole graph into view after it is rearranged.
  const flow = useRef<ReactFlowInstance<GoalNode, Edge> | null>(null)
  const showAll = () => setTimeout(() => void flow.current?.fitView({ duration: 400, padding: 0.15 }), 80)

  // Arrange: the server lays the graph out from its connections (the same
  // function the MCP tool runs) and answers what moved and from where, which is
  // exactly what Undo sends back.
  const handleArrange = async () => {
    try {
      const { moved } = await arrange.mutateAsync()
      showAll()
      if (moved.length === 0) {
        toast.success(t('goalsGraph.alreadyArranged'))
        return
      }
      toast(
        (shown) => (
          <span className="flex items-center gap-3">
            {t('goalsGraph.arranged', { count: moved.length })}
            <button
              type="button"
              className="rounded-md px-2 py-0.5 font-medium underline"
              onClick={() => {
                toast.dismiss(shown.id)
                setPositions.mutate(
                  moved.map((m) => ({ id: m.id, ...m.from })),
                  { onSuccess: showAll, onError: () => toast.error(t('common.saveFailed')) },
                )
              }}
            >
              {t('goalsGraph.undo')}
            </button>
          </span>
        ),
        { duration: 10_000 },
      )
    } catch {
      toast.error(t('common.saveFailed'))
    }
  }

  // `.mutate` is read off each hook so the keyboard/drag callbacks below can
  // depend on a stable function instead of on the mutation object, which is a
  // fresh reference every render and would re-register the keydown listener
  // on each one.
  const addConnectionFn = addConnection.mutate
  const deleteConnectionFn = deleteConnection.mutate
  const updateGoalFn = updateGoal.mutate
  const addGoalFn = addGoal.mutate

  const [nodes, setNodes, onNodesChange] = useNodesState<GoalNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  // The goal editor's open/closed state lives in the URL (`?goal=new` to
  // create, `?goal=<id>` to edit) rather than in useState, so a goal is
  // linkable and the modal survives a reload.
  //
  // `openGoal` is memoised on `navigate` because it is captured by the node
  // reconciliation effect below. That effect deliberately preserves object
  // identity for unchanged nodes — an unstable callback in its dependency list
  // would rebuild every node on every render, which is exactly the churn that
  // triggers React Flow error #015 mid-drag.
  //
  // Read with the ROUTE-AGNOSTIC hooks, not a bound `Route.useSearch()`: this
  // component is the component for both `/app` and `/app/objectives`, and a
  // hook bound to one of them throws "Invariant failed" when rendered under the
  // other. Both routes declare `goal` in validateSearch, so the value is typed
  // and preserved either way.
  const goalParam = useSearch({ strict: false, select: (s) => (s as { goal?: string }).goal })
  const navigate = useNavigate()
  const openGoal = useCallback(
    // `to: '.'` keeps the current route (either /app or /app/objectives) and is
    // what lets the untyped navigate resolve a search reducer at all.
    (id: string | undefined) =>
      void navigate({ to: '.', search: (prev: Record<string, unknown>) => ({ ...prev, goal: id }) }),
    [navigate],
  )
  const isModalOpen = goalParam !== undefined
  const selectedGoal = goalParam && goalParam !== 'new' ? goalParam : null
  const [copiedGoal, setCopiedGoal] = useState<Goal | null>(null)
  const [selectedNodes, setSelectedNodes] = useState<string[]>([])
  const [selectedEdges, setSelectedEdges] = useState<string[]>([])
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [goalsToDelete, setGoalsToDelete] = useState<Goal[]>([])
  const [isHelpOpen, setIsHelpOpen] = useState(false)

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
      const prevById = new Map(prev.map((n) => [n.id, n]))
      let allReused = goals.length === prev.length

      const next: GoalNode[] = goals.map((goal) => {
        const existing = prevById.get(goal.id)
        const wantSelected = selectedNodes.includes(goal.id)
        if (
          existing &&
          (existing.data as { _goalRef?: Goal })._goalRef === goal &&
          existing.selected === wantSelected
        ) {
          return existing
        }
        allReused = false
        return {
          id: goal.id,
          type: 'goalNode',
          position: goal.position,
          selected: wantSelected,
          data: {
            ...goal,
            _goalRef: goal,
            onEdit: () => openGoal(goal.id),
          },
        }
      })

      // If every node is the same reference as before, return the previous
      // array so React Flow's internal node tracking stays put.
      return allReused ? prev : next
    })
  }, [goals, selectedNodes, setNodes, openGoal])

  // Convert connections to edges with selection styling
  useEffect(() => {
    const newEdges = connections.map((conn) => ({
      id: conn.id,
      source: conn.source,
      target: conn.target,
      sourceHandle: 'right',
      targetHandle: 'left',
      animated: true,
      selected: selectedEdges.includes(conn.id),
      selectable: true,
      style: {
        strokeWidth: 2,
        cursor: 'pointer',
      },
      type: 'editableEdge',
    }))
    setEdges(newEdges)
  }, [connections, selectedEdges, setEdges])

  // Validate connection to prevent cycles and duplicates
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (!connection.source || !connection.target) {
        return false
      }

      // Prevent self-connections
      if (connection.source === connection.target) {
        return false
      }

      // Check if connection already exists
      const exists = edges.some((edge) => edge.source === connection.source && edge.target === connection.target)
      if (exists) {
        return false
      }

      // Find the target node
      const target = nodes.find((node) => node.id === connection.target)
      if (!target) return false

      // Cycle detection using DFS
      const hasCycle = (node: Node, visited = new Set<string>()) => {
        if (visited.has(node.id)) return false

        visited.add(node.id)

        for (const outgoer of getOutgoers(node, nodes, edges)) {
          if (outgoer.id === connection.source) return true
          if (hasCycle(outgoer, visited)) return true
        }

        return false
      }

      return !hasCycle(target)
    },
    [nodes, edges],
  )

  const onConnect = useCallback(
    (params: Connection) => {
      if (params.source && params.target) {
        addConnectionFn({
          source: params.source,
          target: params.target,
          weight: 1,
        })
        toast.success(t('goalsGraph.goalsConnected'))
      }
    },
    [addConnectionFn, t],
  )

  // `_event` is typed as the DOM union rather than React.MouseEvent: React Flow
  // 12.9 widened OnNodeDrag to `MouseEvent | TouchEvent` so touch drags type
  // correctly. The handler never reads the event, so this is signature-only.
  const onNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, node: Node, nodes?: Node[]) => {
      // If multiple nodes were dragged, update all of them
      if (nodes && nodes.length > 1) {
        // Filter to only selected nodes that were actually moved
        const movedNodes = nodes.filter((n) => n.selected)

        // Update all moved nodes' positions
        movedNodes.forEach((movedNode) => {
          updateGoalFn({ id: movedNode.id, position: movedNode.position })
        })
      } else {
        // Fallback: single node drag (existing behavior)
        updateGoalFn({ id: node.id, position: node.position })
      }
    },
    [updateGoalFn],
  )

  const onEdgeDelete = useCallback(
    (edges: Edge[]) => {
      edges.forEach((edge) => {
        const connection = connections.find((c) => c.id === edge.id)
        if (connection) {
          deleteConnectionFn(connection.id)
        }
      })
    },
    [connections, deleteConnectionFn],
  )

  const onSelectionChange = useCallback((params: { nodes: Node[]; edges: Edge[] }) => {
    setSelectedNodes(params.nodes.map((n) => n.id))
    setSelectedEdges(params.edges.map((e) => e.id))
  }, [])

  // useCallback so the Cmd+G keyboard effect below can list it as a dependency
  // without re-registering its listener on every render.
  const handleAddGoal = useCallback(() => openGoal('new'), [openGoal])

  const handleModalClose = () => openGoal(undefined)

  const handleDeleteConfirm = async () => {
    try {
      for (const goal of goalsToDelete) {
        await deleteGoal.mutateAsync(goal.id)
      }
      toast.success(t('goalsGraph.deletedGoals', { count: goalsToDelete.length }))
      setSelectedNodes([])
      setGoalsToDelete([])
      setIsDeleteModalOpen(false)
    } catch (error) {
      toast.error(t('goalsGraph.deleteGoalsFailed'))
      console.error(error)
    }
  }

  const handleDeleteCancel = () => {
    setIsDeleteModalOpen(false)
    setGoalsToDelete([])
  }

  // Keyboard shortcuts for adding new goal, copy/paste, and delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+G or Cmd+G for new goal
      if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault()
        handleAddGoal()
      }

      // Ctrl+C or Cmd+C for copy
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !isModalOpen) {
        e.preventDefault()
        if (selectedNodes.length > 0) {
          const goalToCopy = goals.find((g) => g.id === selectedNodes[0])
          if (goalToCopy) {
            setCopiedGoal(goalToCopy)
            toast.success(t('goalsGraph.goalCopied'))
          }
        }
      }

      // Ctrl+V or Cmd+V for paste
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !isModalOpen && copiedGoal) {
        e.preventDefault()

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
        }))

        const goalData = {
          title: `${copiedGoal.title} ${t('goalsGraph.copySuffix')}`,
          description: copiedGoal.description,
          emoji: copiedGoal.emoji,
          valueIds: copiedGoal.valueIds,
          tasks: tasksWithFreshIds,
          parentId: copiedGoal.parentId,
          position: {
            x: copiedGoal.position.x + 50,
            y: copiedGoal.position.y + 50,
          },
        }
        addGoalFn(goalData)
        toast.success(t('goalsGraph.goalPasted'))
      }

      // Delete or Backspace to delete selected nodes or edges
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isModalOpen && !isDeleteModalOpen) {
        e.preventDefault()

        // Priority: Delete nodes if any are selected
        if (selectedNodes.length > 0) {
          const nodesToDelete = goals.filter((g) => selectedNodes.includes(g.id))
          setGoalsToDelete(nodesToDelete)
          setIsDeleteModalOpen(true)
        }
        // Otherwise, delete edges
        else if (selectedEdges.length > 0) {
          selectedEdges.forEach((edgeId) => {
            const connection = connections.find((c) => c.id === edgeId)
            if (connection) {
              deleteConnectionFn(connection.id)
            }
          })
          toast.success(t('goalsGraph.deletedConnections', { count: selectedEdges.length }))
          setSelectedEdges([])
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    selectedNodes,
    selectedEdges,
    copiedGoal,
    isModalOpen,
    isDeleteModalOpen,
    goals,
    connections,
    addGoalFn,
    deleteConnectionFn,
    handleAddGoal,
    t,
  ])

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--paper)' }}>
      {/* Warm ScreenHeader on top of the graph — matches the design's
          Objectives view. New Goal + How-it-works moved into the action
          row instead of floating chips on the canvas. */}
      <header className="shrink-0 px-6 pt-10 pb-7 md:px-12" style={{ borderBottom: '1px solid var(--hairline)' }}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: '0.08em',
                color: 'var(--ink-3)',
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              {t('goalsGraph.eyebrow')}
            </div>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 44,
                lineHeight: 1.2,
                letterSpacing: '-0.02em',
                color: 'var(--ink)',
              }}
            >
              {t('goalsGraph.titlePre')}
              <span className="brand-em">{t('goalsGraph.titleEm')}</span>
            </h1>
            <p
              className="mt-3 max-w-2xl"
              style={{
                fontFamily: 'var(--font-text)',
                fontStyle: 'italic',
                fontSize: 17,
                color: 'var(--ink-2)',
                lineHeight: 1.4,
              }}
            >
              {t('goalsGraph.subtitle')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setIsHelpOpen(true)}
              className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm transition-all"
              style={{
                background: 'var(--canvas)',
                color: 'var(--ink)',
                border: '1px solid var(--hairline-2)',
                boxShadow: 'var(--shadow-sm)',
              }}
              title={t('goalsGraph.howItWorksTitle')}
            >
              <HelpCircle className="h-4 w-4" />
              <span className="hidden sm:inline">{t('goalsGraph.howItWorks')}</span>
            </button>
            <button
              onClick={() => void handleArrange()}
              disabled={arrange.isPending || goals.length < 2}
              className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: 'var(--canvas)',
                color: 'var(--ink)',
                border: '1px solid var(--hairline-2)',
                boxShadow: 'var(--shadow-sm)',
              }}
              title={t('goalsGraph.arrangeTitle')}
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">{t('goalsGraph.arrange')}</span>
            </button>
            <button
              onClick={handleAddGoal}
              className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm transition-all"
              style={{
                background: 'var(--clay)',
                color: 'var(--paper)',
                boxShadow: 'var(--shadow-sm)',
              }}
              title={t('goalsGraph.newGoalTitle')}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">{t('goalsGraph.newGoal')}</span>
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
          onInit={(instance) => {
            flow.current = instance
          }}
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
          <Controls className="!rounded-lg !border-[var(--hairline-2)] !bg-[var(--canvas)] !shadow-sm [&>button]:!border-b [&>button]:!border-[var(--hairline)] [&>button]:!bg-[var(--canvas)] [&>button]:!text-[var(--ink)] [&>button:hover]:!bg-[var(--vellum)] [&>button>svg]:!fill-[var(--ink-2)]" />
          {/* MiniMap is dead weight on a phone — hide on small screens to free real estate. */}
          <MiniMap
            className="!hidden !border-[var(--hairline-2)] !bg-[var(--vellum)] md:!block"
            nodeColor={(node) => {
              const goal = goals.find((g) => g.id === node.id)
              if (!goal) return 'oklch(0.72 0.012 65)'
              const completion = getGoalProgress(goal.id).totalProgress
              if (completion < 33) return 'oklch(0.55 0.14 28)' // rust
              if (completion < 67) return 'oklch(0.72 0.13 75)' // amber
              return 'oklch(0.55 0.09 135)' // moss
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
              <h3 className="mt-4 text-xl font-light">{t('goalsGraph.emptyTitle')}</h3>
              <p className="mt-2 text-sm opacity-60">{t('goalsGraph.emptyHint')}</p>
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
  )
}
