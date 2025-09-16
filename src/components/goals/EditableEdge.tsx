"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { useGoals } from "~/contexts/GoalsContext";

const DEFAULT_WEIGHT = 100;

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
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const { updateConnection, connections } = useGoals();
  const connection = connections.find((conn) => conn.id === id);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(connection?.weight || DEFAULT_WEIGHT);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsEditing(true);
      setEditValue(connection?.weight || DEFAULT_WEIGHT);
    },
    [connection?.weight],
  );

  const handleInputSubmit = useCallback(() => {
    if (!isNaN(editValue) && connection) {
      updateConnection(connection.id, { weight: editValue });
    }
    setIsEditing(false);
  }, [editValue, connection, updateConnection]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setEditValue(isNaN(value) ? 0 : value);
  }, []);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleInputSubmit();
      } else if (e.key === "Escape") {
        setIsEditing(false);
        setEditValue(connection?.weight || DEFAULT_WEIGHT);
      }
    },
    [handleInputSubmit, connection?.weight],
  );

  const handleInputBlur = useCallback(() => {
    handleInputSubmit();
  }, [handleInputSubmit]);

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
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
              className="h-6 w-12 rounded border border-white/40 bg-black/80 text-center text-xs text-white focus:border-white/80 focus:outline-none"
            />
          ) : (
            <div
              onClick={handleClick}
              className="flex h-6 min-w-[20px] cursor-pointer items-center justify-center rounded border border-white/20 bg-black/80 px-2 text-xs font-medium text-white transition-colors hover:border-white/40"
              title="Click to edit"
            >
              {connection?.weight || DEFAULT_WEIGHT}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
