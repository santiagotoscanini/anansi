import React, { useState, useRef, useEffect } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { useUpdateConnection } from '~/lib/mutations/goals-data'
import { useGoalsData } from '~/lib/queries/goals'
import type { Connection } from '~/lib/api/types'

const DEFAULT_WEIGHT = 1

// Calculate the total percentage for all connections to a specific target
const getTargetPercentageSum = (targetId: string, connections: Connection[]) => {
  return connections.filter((conn) => conn.target === targetId).reduce((sum, conn) => sum + (conn.weight ?? 0), 0)
}

// Get validation color based on percentage sum
const getValidationColor = (percentageSum: number) => {
  if (percentageSum === 100) return '#999' // Normal gray
  if (percentageSum < 100) return '#eab308' // Yellow for under 100%
  return '#ef4444' // Red for over 100%
}

// Lighten a hex color by a given amount (0-1, where 1 is white)
const lightenColor = (hex: string, amount: number) => {
  const color = hex.replace('#', '')
  const num = parseInt(color, 16)
  const r = Math.min(255, Math.floor((num >> 16) + (255 - (num >> 16)) * amount))
  const g = Math.min(255, Math.floor(((num >> 8) & 0x00ff) + (255 - ((num >> 8) & 0x00ff)) * amount))
  const b = Math.min(255, Math.floor((num & 0x0000ff) + (255 - (num & 0x0000ff)) * amount))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

export default function EditableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected = false,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const { connections } = useGoalsData()
  const updateConnection = useUpdateConnection()
  const connection = connections.find((conn) => conn.id === id)

  // Calculate validation color based on target percentage sum
  const targetPercentageSum = connection ? getTargetPercentageSum(connection.target, connections) : 0
  const validationColor = getValidationColor(targetPercentageSum)

  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(connection?.weight ?? DEFAULT_WEIGHT)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // The React Compiler memoizes handlers automatically, so we intentionally
  // drop the manual useCallback wrappers (they conflicted with the compiler's
  // dependency analysis on the mutable `connection` object).
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEditing(true)
    setEditValue(connection?.weight ?? DEFAULT_WEIGHT)
  }

  const handleInputSubmit = () => {
    if (!isNaN(editValue) && connection) {
      updateConnection.mutate({ id: connection.id, weight: editValue })
    }
    setIsEditing(false)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value)
    setEditValue(isNaN(value) ? 0 : value)
  }

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleInputSubmit()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
      setEditValue(connection?.weight ?? DEFAULT_WEIGHT)
    }
  }

  const handleInputBlur = () => {
    handleInputSubmit()
  }

  // Use lighter color when selected, normal validation color otherwise
  const edgeColor = selected ? lightenColor(validationColor, 0.4) : validationColor
  const edgeStyle = {
    ...style,
    stroke: edgeColor,
  }

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={edgeStyle} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 transform"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          {isEditing ? (
            <input
              ref={inputRef}
              type="number"
              value={editValue}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              onBlur={handleInputBlur}
              className="h-6 w-12 rounded border border-[var(--hairline-2)] bg-[var(--canvas)] text-center text-xs text-[var(--ink)] focus:border-[var(--hairline-2)] focus:outline-none"
            />
          ) : (
            <div
              onClick={handleClick}
              className="flex h-6 min-w-[20px] cursor-pointer items-center justify-center rounded border border-[var(--hairline-2)] bg-[var(--canvas)] px-2 text-xs font-medium text-[var(--ink)] transition-colors hover:border-[var(--hairline-2)]"
              title="Click to edit"
            >
              {connection?.weight ?? DEFAULT_WEIGHT}%
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
