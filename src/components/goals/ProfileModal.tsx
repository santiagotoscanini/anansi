"use client";

import { useRef, useState } from "react";
import { Camera, Download, Loader2, Upload, X } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "~/trpc/react";
import Avatar from "./Avatar";

interface ProfileModalProps {
  onClose: () => void;
  onLogout: () => void;
  onImportBackup: () => void;
}

const fieldLabel = "mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/40";
const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none transition-all placeholder:text-white/30 focus:border-white/30 focus:bg-white/[0.05]";
const sectionClass = "border-t border-white/5 px-6 py-5";

export default function ProfileModal({ onClose, onImportBackup }: ProfileModalProps) {
  const utils = api.useUtils();
  const meQuery = api.auth.me.useQuery();
  const updateProfile = api.auth.updateProfile.useMutation();
  const changePassword = api.auth.changePassword.useMutation();
  const uploadAvatar = api.auth.uploadAvatar.useMutation();
  const removeAvatar = api.auth.removeAvatar.useMutation();

  const me = meQuery.data;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Working copies — initialized once when the user record arrives so unsaved
  // edits aren't clobbered by background refetches.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [hydrated, setHydrated] = useState(false);
  if (!hydrated && me) {
    setHydrated(true);
    setName(me.name);
    setEmail(me.email);
  }

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const dirty = me && (name !== me.name || email !== me.email);

  const refreshMe = () => {
    void utils.auth.me.invalidate();
  };

  const handleSaveProfile = async () => {
    if (!me) return;
    const patch: { name?: string; email?: string } = {};
    if (name.trim() && name.trim() !== me.name) patch.name = name.trim();
    if (email.trim() && email.trim() !== me.email) patch.email = email.trim();
    if (Object.keys(patch).length === 0) return;
    try {
      await updateProfile.mutateAsync(patch);
      refreshMe();
      toast.success("Profile updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update profile");
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) return;
    if (newPassword !== confirmPassword) {
      toast.error("New passwords don't match");
      return;
    }
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to change password");
    }
  };

  const handleAvatarPick = () => fileInputRef.current?.click();

  const handleAvatarFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please pick an image");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image too large (max 5MB)");
      return;
    }
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      await uploadAvatar.mutateAsync({ fileName: file.name, data });
      refreshMe();
      toast.success("Avatar updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Avatar upload failed");
    }
  };

  const handleRemoveAvatar = async () => {
    if (!me?.avatarUrl) return;
    try {
      await removeAvatar.mutateAsync();
      refreshMe();
      toast.success("Avatar removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove avatar");
    }
  };

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    toast.loading("Preparing backup…", { id: "backup-export" });
    try {
      const backup = await utils.goals.backup.export.fetch();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `anansi-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Backup downloaded (${backup.files.length} files)`, { id: "backup-export" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed", { id: "backup-export" });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5">
          <h2 className="text-lg font-light">Profile</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-white/50 transition-all hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Avatar + name preview */}
        <div className={sectionClass}>
          <div className="flex items-center gap-4">
            <Avatar name={me?.name ?? ""} emoji={me?.avatarUrl ?? null} size="lg" shape="circle" />
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={handleAvatarPick}
                disabled={uploadAvatar.isPending}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 transition-all hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                <Camera className="h-3.5 w-3.5" /> Change picture
              </button>
              {me?.avatarUrl && (
                <button
                  type="button"
                  onClick={() => void handleRemoveAvatar()}
                  disabled={removeAvatar.isPending}
                  className="ml-2 rounded-md px-3 py-1.5 text-xs text-white/50 transition-all hover:bg-white/5 hover:text-white disabled:opacity-50"
                >
                  Remove
                </button>
              )}
              <p className="mt-1.5 text-[11px] text-white/40">PNG, JPG, GIF, or WebP. Up to 5MB.</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleAvatarFile(file);
                e.target.value = "";
              }}
              className="hidden"
            />
          </div>
        </div>

        {/* Display name + email */}
        <div className={sectionClass}>
          <label className={fieldLabel}>Display name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Your name"
          />
          <label className={`${fieldLabel} mt-4`}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="you@example.com"
          />
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => void handleSaveProfile()}
              disabled={!dirty || updateProfile.isPending}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-all hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {updateProfile.isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>

        {/* Password */}
        <div className={sectionClass}>
          <label className={fieldLabel}>Current password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={inputClass}
            autoComplete="current-password"
          />
          <label className={`${fieldLabel} mt-4`}>New password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputClass}
            autoComplete="new-password"
            placeholder="At least 6 characters"
          />
          <label className={`${fieldLabel} mt-4`}>Confirm new password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={inputClass}
            autoComplete="new-password"
          />
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => void handleChangePassword()}
              disabled={!currentPassword || !newPassword || changePassword.isPending}
              className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 transition-all hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {changePassword.isPending ? "Updating…" : "Change password"}
            </button>
          </div>
        </div>

        {/* Backups */}
        <div className={sectionClass}>
          <label className={fieldLabel}>Backups</label>
          <p className="mb-3 text-xs text-white/50">
            Export everything as a single JSON file (people, goals, syncs, attachments, …). Import replaces the current
            account state — keep an export first.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 transition-all hover:bg-white/10 hover:text-white disabled:opacity-50"
            >
              {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Export backup
            </button>
            <button
              type="button"
              onClick={() => {
                onImportBackup();
                onClose();
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 transition-all hover:bg-white/10 hover:text-white"
            >
              <Upload className="h-3.5 w-3.5" /> Import backup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
