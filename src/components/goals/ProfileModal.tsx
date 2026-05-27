"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import {
  Camera,
  Check,
  Copy,
  Download,
  Loader2,
  Sparkles,
  Sun,
  Moon,
  Monitor,
  Upload,
  X,
  Languages,
} from "lucide-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { api } from "~/trpc/react";
import { createClient } from "~/lib/supabase/client";
import Avatar from "./Avatar";
import { useTheme, type ThemePref } from "~/lib/theme";
import { useLocale } from "~/i18n/useLocale";

const supabase = createClient();

interface ProfileModalProps {
  onClose: () => void;
  onLogout: () => void;
  onImportBackup: () => void;
}

const fieldLabel = "mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[var(--ink-3)]";
const inputClass =
  "w-full rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-3 py-2 text-sm text-[var(--ink)] outline-none transition-all placeholder:text-[var(--ink-4)] focus:border-[var(--hairline-2)] focus:bg-[var(--vellum)]";
const sectionClass = "border-t border-[var(--hairline)] px-6 py-5";

// Fallback host shown in the MCP snippets before the client-side hydration
// resolves `window.location.origin`. Also the canonical prod URL, so the
// pre-hydration paint shows something that's actually correct in production
// rather than a placeholder the user has to mentally substitute.
const DEFAULT_MCP_URL = "https://anansi.toscanini.me/api/mcp";

// Code snippet block with an absolutely-positioned Copy button. Used inside
// the MCP setup panel for the `claude mcp add` CLI line and the .mcp.json
// fragment. Each instance owns its own "copied" flash state so two visible
// snippets don't clobber each other's feedback.
function CodeSnippet({ code, ariaLabel }: { code: string; ariaLabel: string }) {
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard write can be blocked (insecure context, embedded iframe).
      // Text inside <pre> stays selectable, so the user always has a fallback.
    }
  };
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] py-2 pl-3 pr-12 font-mono text-[12px] leading-relaxed text-[var(--ink)]">
        {code}
      </pre>
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label={copied ? t("profile.mcpCopied") : ariaLabel}
        title={copied ? t("profile.mcpCopied") : t("profile.mcpCopyUrl")}
        className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--hairline)] bg-[var(--canvas)] text-[var(--ink-3)] transition-all hover:text-[var(--ink)]"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

export default function ProfileModal({ onClose, onImportBackup }: ProfileModalProps) {
  const { t } = useTranslation();
  const utils = api.useUtils();
  const meQuery = api.auth.me.useQuery();
  const updateProfile = api.auth.updateProfile.useMutation();
  const uploadAvatar = api.auth.uploadAvatar.useMutation();
  const removeAvatar = api.auth.removeAvatar.useMutation();
  const [changingPassword, setChangingPassword] = useState(false);

  const me = meQuery.data;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { pref: themePref, setPref: setThemePref } = useTheme();
  const { locale, setLocale, supported: supportedLocales } = useLocale();

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

  // MCP server URL — derived from window.location.origin so it works in dev
  // (http://localhost:3000) and prod alike. useSyncExternalStore handles the
  // SSR/CSR split cleanly (empty string on server snapshot, real URL on
  // client) without tripping react-hooks/set-state-in-effect.
  const mcpServerUrl = useSyncExternalStore(
    () => () => undefined,
    () => `${window.location.origin}/api/mcp`,
    () => "",
  );
  const [mcpCopied, setMcpCopied] = useState(false);

  const handleCopyMcpUrl = async () => {
    if (!mcpServerUrl) return;
    try {
      await navigator.clipboard.writeText(mcpServerUrl);
      setMcpCopied(true);
      setTimeout(() => setMcpCopied(false), 1600);
    } catch {
      // Clipboard API can be blocked (insecure context, embedded iframe, …);
      // the URL is still selectable, so silent fallback is fine.
    }
  };

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
      toast.success(t("profile.profileUpdated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("profile.profileUpdateFailed"));
    }
  };

  const handleChangePassword = async () => {
    if (!me || !currentPassword || !newPassword) return;
    if (newPassword !== confirmPassword) {
      toast.error(t("profile.passwordsDontMatch"));
      return;
    }
    if (newPassword.length < 12) {
      toast.error("New password must be at least 12 characters");
      return;
    }
    setChangingPassword(true);
    try {
      // Supabase doesn't ask for the current password on updateUser — to
      // preserve the previous "verify current first" UX we re-authenticate
      // with the supplied old password. If that fails the change is rejected.
      const reauth = await supabase.auth.signInWithPassword({ email: me.email, password: currentPassword });
      if (reauth.error) {
        toast.error("Current password is incorrect");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast.error(error.message);
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success(t("profile.passwordUpdated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("profile.passwordChangeFailed"));
    } finally {
      setChangingPassword(false);
    }
  };

  const handleAvatarPick = () => fileInputRef.current?.click();

  const handleAvatarFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error(t("profile.avatarPickImage"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("profile.avatarTooLarge"));
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
      toast.success(t("profile.avatarUpdated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("profile.avatarUploadFailed"));
    }
  };

  const handleRemoveAvatar = async () => {
    if (!me?.avatarUrl) return;
    try {
      await removeAvatar.mutateAsync();
      refreshMe();
      toast.success(t("profile.avatarRemoved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("profile.avatarRemoveFailed"));
    }
  };

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    toast.loading(t("profile.preparingBackup"), { id: "backup-export" });
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
      toast.success(t("profile.backupDownloaded", { count: backup.files.length }), { id: "backup-export" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("profile.exportFailed"), { id: "backup-export" });
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
          <h2 className="text-lg font-light">{t("profile.title")}</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--ink-3)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
            aria-label={t("common.close")}
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
                <Camera className="h-3.5 w-3.5" /> {t("profile.changePicture")}
              </button>
              {me?.avatarUrl && (
                <button
                  type="button"
                  onClick={() => void handleRemoveAvatar()}
                  disabled={removeAvatar.isPending}
                  className="ml-2 rounded-md px-3 py-1.5 text-xs text-[var(--ink-3)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)] disabled:opacity-50"
                >
                  {t("profile.removePicture")}
                </button>
              )}
              <p className="mt-1.5 text-[11px] text-[var(--ink-3)]">{t("profile.pictureHelp")}</p>
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
          <label className={fieldLabel}>{t("profile.displayName")}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder={t("profile.displayNamePlaceholder")}
          />
          <label className={`${fieldLabel} mt-4`}>{t("profile.email")}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder={t("profile.emailPlaceholder")}
          />
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => void handleSaveProfile()}
              disabled={!dirty || updateProfile.isPending}
              className="rounded-lg bg-[var(--surface-inverse)] px-4 py-2 text-sm font-medium text-[var(--on-inverse)] transition-all hover:bg-[var(--surface-inverse)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {updateProfile.isPending ? t("common.saving") : t("common.saveChanges")}
            </button>
          </div>
        </div>

        {/* Password */}
        <div className={sectionClass}>
          <label className={fieldLabel}>{t("profile.currentPassword")}</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={inputClass}
            autoComplete="current-password"
          />
          <label className={`${fieldLabel} mt-4`}>{t("profile.newPassword")}</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputClass}
            autoComplete="new-password"
            placeholder={t("profile.newPasswordPlaceholder")}
          />
          <label className={`${fieldLabel} mt-4`}>{t("profile.confirmNewPassword")}</label>
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
              disabled={!currentPassword || !newPassword || changingPassword}
              className="rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-4 py-2 text-sm text-[var(--ink)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {changingPassword ? t("profile.changingPassword") : t("profile.changePassword")}
            </button>
          </div>
        </div>

        {/* Theme — Light / Dark / Auto. */}
        <div className={sectionClass}>
          <label className={fieldLabel}>{t("profile.theme")}</label>
          <p className="mb-3 text-xs text-[var(--ink-3)]">{t("profile.themeHelp")}</p>
          <div
            className="inline-flex gap-1 rounded-full p-1"
            role="radiogroup"
            aria-label={t("profile.theme")}
            style={{ background: "var(--paper-deep)", border: "1px solid var(--hairline)" }}
          >
            {(
              [
                { value: "light", labelKey: "profile.themeLight" as const, icon: Sun },
                { value: "dark", labelKey: "profile.themeDark" as const, icon: Moon },
                { value: "system", labelKey: "profile.themeAuto" as const, icon: Monitor },
              ] as {
                value: ThemePref;
                labelKey: "profile.themeLight" | "profile.themeDark" | "profile.themeAuto";
                icon: typeof Sun;
              }[]
            ).map(({ value, labelKey, icon: Icon }) => {
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
                  {t(labelKey)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Language — English / Español. Browser-stored per device under
            `anansi:locale`; setLocale triggers i18next.changeLanguage and the
            detector persists. Adding a new language = add a JSON file in
            src/i18n/locales/ and a code to SUPPORTED_LOCALES in config.ts. */}
        <div className={sectionClass}>
          <label className={fieldLabel}>{t("profile.language")}</label>
          <p className="mb-3 text-xs text-[var(--ink-3)]">{t("profile.languageHelp")}</p>
          <div
            className="inline-flex gap-1 rounded-full p-1"
            role="radiogroup"
            aria-label={t("profile.language")}
            style={{ background: "var(--paper-deep)", border: "1px solid var(--hairline)" }}
          >
            {supportedLocales.map(({ code, label }) => {
              const active = locale === code;
              return (
                <button
                  key={code}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setLocale(code)}
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs transition-all"
                  style={{
                    background: active ? "var(--canvas)" : "transparent",
                    color: active ? "var(--ink)" : "var(--ink-2)",
                    fontWeight: active ? 500 : 400,
                    boxShadow: active ? "var(--shadow-sm)" : "none",
                  }}
                >
                  <Languages className="h-3.5 w-3.5" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Backups */}
        <div className={sectionClass}>
          <label className={fieldLabel}>{t("profile.backups")}</label>
          <p className="mb-3 text-xs text-[var(--ink-3)]">{t("profile.backupsHelp")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--hairline)] bg-[var(--vellum)] px-3 py-1.5 text-xs text-[var(--ink)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)] disabled:opacity-50"
            >
              {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {t("profile.exportBackup")}
            </button>
            <button
              type="button"
              onClick={() => {
                onImportBackup();
                onClose();
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--hairline)] bg-[var(--vellum)] px-3 py-1.5 text-xs text-[var(--ink)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
            >
              <Upload className="h-3.5 w-3.5" /> {t("profile.importBackup")}
            </button>
          </div>
        </div>

        {/* MCP — connect Anansi to Claude. The URL is the only piece of data
            the user needs to copy; from there the OAuth flow is browser-driven
            (sign-in → consent → token issued to the Claude client). We don't
            surface "manage connected clients" UI yet; revocation goes through
            the Claude side for v1. */}
        <div className={sectionClass}>
          <label className={fieldLabel}>
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" />
              {t("profile.mcp")}
            </span>
          </label>
          <p className="mb-4 text-xs leading-relaxed text-[var(--ink-3)]">{t("profile.mcpHelp")}</p>

          <label className={`${fieldLabel} mt-3`}>{t("profile.mcpServerUrl")}</label>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={mcpServerUrl}
              onClick={(e) => e.currentTarget.select()}
              className={`${inputClass} font-mono text-[12px]`}
              spellCheck={false}
              aria-label={t("profile.mcpServerUrl")}
            />
            <button
              type="button"
              onClick={() => void handleCopyMcpUrl()}
              disabled={!mcpServerUrl}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--hairline)] bg-[var(--vellum)] px-3 py-1.5 text-xs text-[var(--ink)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)] disabled:opacity-50"
            >
              {mcpCopied ? (
                <>
                  <Check className="h-3.5 w-3.5" /> {t("profile.mcpCopied")}
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> {t("profile.mcpCopyUrl")}
                </>
              )}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-[var(--ink-3)]">{t("profile.mcpServerUrlHelp")}</p>

          {/* Claude Code CLI — the lowest-friction path. `claude mcp add`
              writes the server into the user-scope config, no JSON editing.
              Same pattern as Linear's docs (`claude mcp add --transport http
              linear-server https://mcp.linear.app/mcp`). */}
          <div className="mt-5">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--ink-3)]">
              {t("profile.mcpClaudeCliHeading")}
            </div>
            <p className="mb-2 text-xs text-[var(--ink-3)]">{t("profile.mcpClaudeCliHelp")}</p>
            <CodeSnippet
              ariaLabel={t("profile.mcpCopyUrl")}
              code={`claude mcp add --transport http anansi ${mcpServerUrl || DEFAULT_MCP_URL}`}
            />
          </div>

          {/* Claude Code — show a copy-pasteable .mcp.json snippet. Plain
              <pre> so the JSON copies verbatim including the braces; users
              who use Claude Code know this format. */}
          <div className="mt-5">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--ink-3)]">
              {t("profile.mcpClaudeCodeHeading")}
            </div>
            <p className="mb-2 text-xs text-[var(--ink-3)]">{t("profile.mcpClaudeCodeHelp")}</p>
            <CodeSnippet
              ariaLabel={t("profile.mcpCopyUrl")}
              code={`{
  "mcpServers": {
    "anansi": { "type": "http", "url": "${mcpServerUrl || DEFAULT_MCP_URL}" }
  }
}`}
            />
          </div>

          {/* Claude Desktop + claude.ai — the URL goes into the connector
              form. No code snippet here; the UI form handles the rest. */}
          <div className="mt-5">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--ink-3)]">
              {t("profile.mcpClaudeDesktopHeading")}
            </div>
            <p className="text-xs text-[var(--ink-3)]">{t("profile.mcpClaudeDesktopHelp")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
