"use client";

import { X, AlertTriangle } from "lucide-react";
import type { Goal } from "~/contexts/GoalsContext";

interface DeleteConfirmationModalProps {
  goals: Goal[];
  onConfirm: () => void;
  onClose: () => void;
}

export default function DeleteConfirmationModal({ goals, onConfirm, onClose }: DeleteConfirmationModalProps) {
  const goalCount = goals.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-white/20 bg-black p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <h3 className="text-lg font-light">Delete Goal{goalCount > 1 ? "s" : ""}</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 transition-all hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="mb-6">
          <p className="mb-4 text-sm text-white/70">
            Are you sure you want to delete {goalCount === 1 ? "this goal" : `these ${goalCount} goals`}?
          </p>

          {/* Goals List */}
          <div className="max-h-[300px] space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-white/5 p-3">
            {goals.map((goal) => (
              <div key={goal.id} className="flex items-center gap-2 py-1">
                <div className="h-1.5 w-1.5 rounded-full bg-white/40" />
                <span className="text-sm text-white">{goal.title}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-white/20 px-4 py-2 transition-all hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-red-500 transition-all hover:bg-red-500/20"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
