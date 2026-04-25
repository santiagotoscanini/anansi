"use client";

import { useState, useRef } from "react";
import { X, AlertTriangle, Upload } from "lucide-react";
import toast from "react-hot-toast";
import { useGoals } from "~/contexts/GoalsContext";
import { api } from "~/trpc/react";
import { backupSchema, type Backup } from "~/lib/api/types";

interface BackupImportModalProps {
  onClose: () => void;
}

interface ParsedBackup {
  backup: Backup;
  fileName: string;
}

export default function BackupImportModal({ onClose }: BackupImportModalProps) {
  const { refreshData } = useGoals();
  const importMutation = api.goals.backup.import.useMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedBackup | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [confirmToken, setConfirmToken] = useState("");

  const canConfirm = parsed !== null && confirmToken === "REPLACE" && !importMutation.isPending;

  const handleFile = async (file: File) => {
    setParseError(null);
    setParsed(null);
    try {
      const text = await file.text();
      const json: unknown = JSON.parse(text);
      const result = backupSchema.safeParse(json);
      if (!result.success) {
        const first = result.error.issues[0];
        setParseError(
          `Not a valid backup file${first ? ` (${first.path.join(".") || "root"}: ${first.message})` : ""}`,
        );
        return;
      }
      setParsed({ backup: result.data, fileName: file.name });
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to read file");
    }
  };

  const handleConfirm = async () => {
    if (!parsed) return;
    toast.loading("Restoring backup…", { id: "backup-import" });
    try {
      const res = await importMutation.mutateAsync({ backup: parsed.backup, confirmReplace: true });
      await refreshData();
      const msg = res.fileFailures.length
        ? `Backup restored — ${res.fileFailures.length} file(s) failed to write`
        : "Backup restored";
      if (res.fileFailures.length) {
        toast.error(msg, { id: "backup-import", duration: 6000 });
      } else {
        toast.success(msg, { id: "backup-import" });
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed", { id: "backup-import" });
    }
  };

  const b = parsed?.backup;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-white/20 bg-black p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            <h3 className="text-lg font-light">Import backup</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 transition-all hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* File picker */}
        {!parsed && (
          <div className="mb-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-lg border border-dashed border-white/30 px-4 py-8 text-sm text-white/70 transition-all hover:border-white/60 hover:bg-white/5"
            >
              Choose backup file (.json)
            </button>
            {parseError && (
              <p className="mt-2 flex items-start gap-1.5 text-sm text-red-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{parseError}</span>
              </p>
            )}
          </div>
        )}

        {/* Summary + confirmation */}
        {parsed && b && (
          <div className="space-y-4">
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
              <div className="mb-2 truncate text-white/50">{parsed.fileName}</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <div className="text-white/60">Exported</div>
                <div className="text-right">{b.exportedAt.toISOString().slice(0, 10)}</div>
                <div className="text-white/60">Account</div>
                <div className="truncate text-right" title={b.user.email}>
                  {b.user.email}
                </div>
                <div className="text-white/60">Goals</div>
                <div className="text-right">{b.goals.length}</div>
                <div className="text-white/60">Values</div>
                <div className="text-right">{b.values.length}</div>
                <div className="text-white/60">Connections</div>
                <div className="text-right">{b.connections.length}</div>
                <div className="text-white/60">Tracking items</div>
                <div className="text-right">{b.trackingItems.length}</div>
                <div className="text-white/60">Weekly syncs</div>
                <div className="text-right">{b.weeklySync.length}</div>
                <div className="text-white/60">Files</div>
                <div className="text-right">{b.files.length}</div>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
              <span>
                This will <strong>permanently delete</strong> everything currently in your account and replace it with
                the contents of this backup. Type <code className="rounded bg-black/40 px-1">REPLACE</code> to confirm.
              </span>
            </div>

            <input
              type="text"
              value={confirmToken}
              onChange={(e) => setConfirmToken(e.target.value)}
              placeholder="Type REPLACE"
              className="w-full rounded-lg border border-white/20 bg-transparent px-4 py-2 text-white placeholder-white/30 outline-none transition-all focus:border-white/40"
              autoFocus
            />

            <div className="flex gap-2">
              <button
                onClick={onClose}
                disabled={importMutation.isPending}
                className="flex-1 rounded-lg border border-white/20 px-4 py-2 transition-all hover:bg-white/10 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={!canConfirm}
                className="flex-1 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-red-400 transition-all hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {importMutation.isPending ? "Restoring…" : "Replace everything"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
