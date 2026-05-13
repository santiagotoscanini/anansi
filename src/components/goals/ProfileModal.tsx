"use client";

import { useRef, useState } from "react";
import { Camera, Download, Loader2, Sun, Moon, Monitor, Upload, X } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "~/trpc/react";
import Avatar from "./Avatar";
import { useTheme, type ThemePref } from "~/lib/theme";

interface ProfileModalProps {
  onClose: () => void;
  onLogout: () => void;
  onImportBackup: () => void;
}

const fieldLabel = "mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[var(--ink-3)]";
const inputClass =
  "w-full rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-3 py-2 text-sm text-[var(--ink)] outline-none transition-all placeholder:text-[var(--ink-4)] focus:border-[var(--hairline-2)] focus:bg-[var(--vellum)]";
const sectionClass = "border-t border-[var(--hairline)] px-6 py-5";

export default function ProfileModal({ onClose, onImportBackup }: ProfileModalProps) {
  const utils = api.useUtils();
  const meQuery = api.auth.me.useQuery();
  const updateProfile = api.auth.updateProfile.useMutation();
  const changePassword = api.auth.changePassword.useMutation();
  const uploadAvatar = api.auth.uploadAvatar.useMutation();
  const removeAvatar = api.auth.removeAvatar.useMutation();

  const me = meQuery.data;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { pref: themePref, setPref: setThemePref } = useTheme();

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
      className="bg-[var(--ink)]/70 fixed inset-0 z-40 flex items-center justify-center p-4 backdrop-blur"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[var(--hairline)] bg-[var(--canvas)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5">
          <h2 className="text-lg font-light">Profile</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--ink-3)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
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
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--hairline)] bg-[var(--vellum)] px-3 py-1.5 text-xs text-[var(--ink)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)] disabled:opacity-50"
              >
                <Camera className="h-3.5 w-3.5" /> Change picture
              </button>
              {me?.avatarUrl && (
                <button
                  type="button"
                  onClick={() => void handleRemoveAvatar()}
                  disabled={removeAvatar.isPending}
                  className="ml-2 rounded-md px-3 py-1.5 text-xs text-[var(--ink-3)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)] disabled:opacity-50"
                >
                  Remove
                </button>
              )}
              <p className="mt-1.5 text-[11px] text-[var(--ink-3)]">PNG, JPG, GIF, or WebP. Up to 5MB.</p>
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
              className="rounded-lg bg-[var(--paper)] px-4 py-2 text-sm font-medium text-black transition-all hover:bg-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-40"
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
            placeholder="At least 12 characters"
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
              className="rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-4 py-2 text-sm text-[var(--ink)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {changePassword.isPending ? "Updating…" : "Change password"}
            </button>
          </div>
        </div>

        {/* Theme — Light / Dark / Auto. Persisted on the user profile;
            "Auto" follows the OS prefers-color-scheme query in real time. */}
        <div className={sectionClass}>
          <label className={fieldLabel}>Theme</label>
          <p className="mb-3 text-xs text-[var(--ink-3)]">
            Light is warm cream. Dark is deep coffee — same warmth, lower lumens. Auto follows your operating system.
          </p>
          <div
            className="inline-flex gap-1 rounded-full p-1"
            role="radiogroup"
            aria-label="Theme"
            style={{ background: "var(--paper-deep)", border: "1px solid var(--hairline)" }}
          >
            {(
              [
                { value: "light", label: "Light", icon: Sun },
                { value: "dark", label: "Dark", icon: Moon },
                { value: "system", label: "Auto", icon: Monitor },
              ] as { value: ThemePref; label: string; icon: typeof Sun }[]
            ).map(({ value, label, icon: Icon }) => {
              const active = themePref === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setThemePref(value)}
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs transition-all"
                  style={{
                    background: active ? "var(--canvas)" : "transparent",
                    color: active ? "var(--ink)" : "var(--ink-2)",
                    fontWeight: active ? 500 : 400,
                    boxShadow: active ? "var(--shadow-sm)" : "none",
                  }}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Backups */}
        <div className={sectionClass}>
          <label className={fieldLabel}>Backups</label>
          <p className="mb-3 text-xs text-[var(--ink-3)]">
            Export everything as a single JSON file (people, goals, syncs, attachments, …). Import replaces the current
            account state — keep an export first.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--hairline)] bg-[var(--vellum)] px-3 py-1.5 text-xs text-[var(--ink)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)] disabled:opacity-50"
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
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--hairline)] bg-[var(--vellum)] px-3 py-1.5 text-xs text-[var(--ink)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
            >
              <Upload className="h-3.5 w-3.5" /> Import backup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
