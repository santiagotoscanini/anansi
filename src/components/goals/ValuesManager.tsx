"use client";

import { useState } from "react";
import { Plus, Trash2, Edit2, Check, X, Palette } from "lucide-react";
import { useGoals, type Value } from "~/contexts/GoalsContext";
import toast from "react-hot-toast";

const DEFAULT_COLORS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#e11d48",
  "#be123c",
  "#881337",
];

export default function ValuesManager() {
  const { values, addValue, updateValue, deleteValue } = useGoals();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newValueName, setNewValueName] = useState("");
  const [editValue, setEditValue] = useState({ name: "", color: "" });
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null);

  const getRandomColor = () => {
    return DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)]!;
  };

  const handleAdd = () => {
    if (!newValueName.trim()) {
      toast.error("Value name is required");
      return;
    }

    addValue({ name: newValueName, color: getRandomColor() });
    toast.success("Value added successfully");
    setNewValueName("");
  };

  const handleEdit = (value: Value) => {
    setEditingId(value.id);
    setEditValue({ name: value.name, color: value.color });
  };

  const handleUpdate = () => {
    if (!editValue.name.trim()) {
      toast.error("Value name is required");
      return;
    }

    if (editingId) {
      updateValue(editingId, editValue);
      toast.success("Value updated successfully");
      setEditingId(null);
    }
  };

  const handleDelete = (id: string) => {
    deleteValue(id);
    toast.success("Value deleted successfully");
  };

  return (
    <div className="h-full px-8 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h2 className="text-2xl font-light">Your Values</h2>
          <p className="mt-2 text-sm opacity-60">Define the core values that guide your goals and decisions</p>
        </div>

        {/* Add new value form - Always visible */}
        <div className="mb-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <input
              type="text"
              value={newValueName}
              onChange={(e) => setNewValueName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="Enter a new value and press Enter..."
              className="flex-1 rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-white outline-none transition-all placeholder:text-white/30 focus:border-white/40 focus:bg-white/10"
              autoFocus
            />
            <button
              onClick={handleAdd}
              className="flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-sm transition-all hover:bg-white hover:text-black md:text-base"
            >
              <Plus className="h-4 w-4" />
              Add Value
            </button>
          </div>
          <p className="mt-2 text-xs text-white/40">Colors will be automatically assigned and can be changed later</p>
        </div>

        {/* Separator */}
        <div className="mb-8 border-t border-white/10" />

        {/* Values list */}
        <div className="grid gap-4">
          {values.map((value) => (
            <div
              key={value.id}
              className="group rounded-lg border border-white/20 bg-white/5 p-4 transition-all hover:bg-white/10"
            >
              {editingId === value.id ? (
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <button
                      onClick={() => setShowColorPicker(showColorPicker === value.id ? null : value.id)}
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20"
                      style={{ backgroundColor: editValue.color }}
                    >
                      <Palette className="h-5 w-5 text-white mix-blend-difference" />
                    </button>

                    {showColorPicker === value.id && (
                      <div className="absolute left-0 top-12 z-10 grid grid-cols-5 gap-2 rounded-lg border border-white/20 bg-black p-3">
                        {DEFAULT_COLORS.map((color) => (
                          <button
                            key={color}
                            onClick={() => {
                              setEditValue({ ...editValue, color });
                              setShowColorPicker(null);
                            }}
                            className="h-8 w-8 rounded border border-white/20 transition-transform hover:scale-110"
                            style={{ backgroundColor: color }}
                            aria-label={`Select color ${color}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  <input
                    type="text"
                    value={editValue.name}
                    onChange={(e) => setEditValue({ ...editValue, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleUpdate();
                      if (e.key === "Escape") {
                        setEditingId(null);
                        setShowColorPicker(null);
                      }
                    }}
                    className="flex-1 bg-transparent text-white outline-none"
                    autoFocus
                  />

                  <div className="flex gap-2">
                    <button
                      onClick={handleUpdate}
                      className="rounded-lg bg-white/10 p-2 transition-all hover:bg-white/20"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(null);
                        setShowColorPicker(null);
                      }}
                      className="rounded-lg bg-white/10 p-2 transition-all hover:bg-white/20"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg" style={{ backgroundColor: value.color }} />
                    <span className="text-lg">{value.name}</span>
                  </div>

                  <div className="flex gap-2 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                    <button
                      onClick={() => handleEdit(value)}
                      className="rounded-lg bg-white/10 p-2 transition-all hover:bg-white/20"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(value.id)}
                      className="rounded-lg bg-red-500/20 p-2 transition-all hover:bg-red-500/30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {values.length === 0 && (
            <div className="rounded-lg border border-white/10 bg-white/5 p-12 text-center">
              <Palette className="mx-auto h-12 w-12 opacity-30" />
              <p className="mt-4 text-lg font-light">No values defined yet</p>
              <p className="mt-2 text-sm opacity-60">Start by adding your first value above</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
