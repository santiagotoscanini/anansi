"use client";

import { useState } from "react";
import { X, Tag, Check } from "lucide-react";
import type { Value } from "~/lib/api/types";

interface ValueSelectionModalProps {
  availableValues: Value[];
  selectedValueIds: string[];
  onConfirm: (selectedIds: string[]) => void;
  onClose: () => void;
}

export default function ValueSelectionModal({
  availableValues,
  selectedValueIds,
  onConfirm,
  onClose,
}: ValueSelectionModalProps) {
  const [tempSelectedIds, setTempSelectedIds] = useState<string[]>(selectedValueIds);

  const handleToggleValue = (valueId: string) => {
    if (tempSelectedIds.includes(valueId)) {
      setTempSelectedIds(tempSelectedIds.filter((id) => id !== valueId));
    } else {
      setTempSelectedIds([...tempSelectedIds, valueId]);
    }
  };

  const handleConfirm = () => {
    onConfirm(tempSelectedIds);
    onClose();
  };

  return (
    <div className="bg-[var(--ink)]/80 fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-[var(--hairline-2)] bg-[var(--paper)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-light">Add Values</h3>
          <button onClick={onClose} className="rounded-lg p-2 transition-all hover:bg-[var(--vellum)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Values List */}
        <div className="mb-6 max-h-[400px] space-y-1 overflow-y-auto">
          {availableValues.length === 0 ? (
            <p className="py-4 text-center text-sm text-[var(--ink-3)]">No values available</p>
          ) : (
            availableValues.map((value) => {
              const isSelected = tempSelectedIds.includes(value.id);
              return (
                <div
                  key={value.id}
                  onClick={() => handleToggleValue(value.id)}
                  className={`flex cursor-pointer items-center justify-between rounded-lg px-4 py-3 transition-all ${
                    isSelected
                      ? "border border-[var(--hairline-2)] bg-[var(--vellum)]"
                      : "border border-transparent hover:bg-[var(--vellum)]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Tag className="h-4 w-4" style={{ color: value.color }} />
                    <span className="text-[var(--ink)]">{value.name}</span>
                  </div>
                  {isSelected && <Check className="h-5 w-5 text-[var(--ink)]" />}
                </div>
              );
            })
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-[var(--hairline-2)] px-4 py-2 transition-all hover:bg-[var(--vellum)]"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 rounded-lg border border-[var(--hairline-2)] bg-[var(--paper)] px-4 py-2 text-black transition-all hover:bg-[var(--paper)]"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
