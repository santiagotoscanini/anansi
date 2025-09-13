import type { Value, Goal, Connection, WeeklyReview } from "~/contexts/GoalsContext";
import { get, set, del } from "idb-keyval";

interface FileSystemHandlePermissionDescriptor {
  mode?: "read" | "readwrite";
}

declare global {
  interface Window {
    showOpenFilePicker(options?: {
      types?: Array<{
        description?: string;
        accept?: Record<string, string[]>;
      }>;
      multiple?: boolean;
    }): Promise<FileSystemFileHandle[]>;
    showSaveFilePicker(options?: {
      suggestedName?: string;
      types?: Array<{
        description?: string;
        accept?: Record<string, string[]>;
      }>;
    }): Promise<FileSystemFileHandle>;
  }

  interface FileSystemFileHandle {
    queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
    requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  }
}

const FILE_HANDLE_KEY = "goals.fileHandle";
const FILE_NAME_KEY = "goals.lastFileName";

export interface GoalsData {
  version: string;
  values: Value[];
  goals: Goal[];
  connections: Connection[];
  weeklyReviews: WeeklyReview[];
  lastModified: string;
}

export class FileSystemManager {
  private fileHandle: FileSystemFileHandle | null = null;
  private lastSavedData: string | null = null;

  /**
   * Initialize and try to restore previous file handle
   */
  async initialize(): Promise<GoalsData | null> {
    try {
      // Try to restore the file handle from IndexedDB
      const storedHandle = (await get(FILE_HANDLE_KEY)) as unknown as FileSystemFileHandle | undefined;

      if (storedHandle) {
        // Check if we still have permission
        const permission = await storedHandle.queryPermission({ mode: "readwrite" });

        if (permission === "granted") {
          this.fileHandle = storedHandle;

          // Read the file
          const file = await storedHandle.getFile();
          const text = await file.text();
          const data = JSON.parse(text) as GoalsData;
          this.lastSavedData = text;

          // Store the file name for display
          await set(FILE_NAME_KEY, storedHandle.name);

          return data;
        } else if (permission === "prompt") {
          // Request permission
          const newPermission = await storedHandle.requestPermission({ mode: "readwrite" });
          if (newPermission === "granted") {
            this.fileHandle = storedHandle;

            const file = await storedHandle.getFile();
            const text = await file.text();
            const data = JSON.parse(text) as GoalsData;
            this.lastSavedData = text;

            await set(FILE_NAME_KEY, storedHandle.name);
            return data;
          }
        }
      }
    } catch (error) {
      console.log("Could not restore file handle:", error);
    }

    return null;
  }

  /**
   * Opens a file picker and loads a .santigoals file
   */
  async openFile(): Promise<GoalsData | null> {
    try {
      // Show file picker
      const handles = await window.showOpenFilePicker({
        types: [
          {
            description: "Santiago Goals files",
            accept: {
              "application/json": [".santigoals"],
            },
          },
        ],
        multiple: false,
      });

      if (!handles || handles.length === 0) {
        return null;
      }

      const fileHandle = handles[0];
      if (!fileHandle) {
        return null;
      }

      this.fileHandle = fileHandle;

      // Store the file handle in IndexedDB for next session
      await set(FILE_HANDLE_KEY, fileHandle);
      await set(FILE_NAME_KEY, fileHandle.name);

      // Read file
      const file = await fileHandle.getFile();
      const text = await file.text();

      // Parse and validate
      const data = JSON.parse(text) as GoalsData;
      this.lastSavedData = text;

      return data;
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        // Failed to open file
        throw error; // Re-throw to handle in UI
      }
      return null;
    }
  }

  /**
   * Creates a new file and saves data
   */
  async saveAsNewFile(data: GoalsData): Promise<boolean> {
    try {
      // Show save picker
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: `goals-${new Date().toISOString().split("T")[0]}.santigoals`,
        types: [
          {
            description: "Santiago Goals files",
            accept: {
              "application/json": [".santigoals"],
            },
          },
        ],
      });

      this.fileHandle = fileHandle;

      // Store the file handle in IndexedDB for next session
      await set(FILE_HANDLE_KEY, fileHandle);
      await set(FILE_NAME_KEY, fileHandle.name);

      return await this.saveToFile(data);
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        // Failed to save file
        throw error;
      }
      return false;
    }
  }

  /**
   * Saves data to the currently opened file
   * @param isUserActivated - whether this save was triggered by user action (needed for permissions)
   */
  async saveToFile(data: GoalsData, isUserActivated = false): Promise<boolean> {
    if (!this.fileHandle) {
      // Only prompt for new file if user-activated
      if (isUserActivated) {
        return await this.saveAsNewFile(data);
      }
      return false;
    }

    try {
      // Add metadata
      const dataWithMeta: GoalsData = {
        ...data,
        lastModified: new Date().toISOString(),
        version: "1.0.0",
      };

      const jsonString = JSON.stringify(dataWithMeta, null, 2);

      // Only save if data changed
      if (jsonString === this.lastSavedData) {
        return true;
      }

      // Check permissions first
      const permission = await this.fileHandle.queryPermission({ mode: "readwrite" });

      // If we don't have permission and this isn't user-activated, we can't save
      if (permission !== "granted" && !isUserActivated) {
        // Auto-save skipped: requires user activation for permissions
        return false;
      }

      // Request permission if needed (only works with user activation)
      if (permission !== "granted") {
        const newPermission = await this.fileHandle.requestPermission({ mode: "readwrite" });
        if (newPermission !== "granted") {
          // Write permission denied
          return false;
        }
      }

      // Create writable stream
      const writable = await this.fileHandle.createWritable();

      // Write data
      await writable.write(jsonString);

      // Close file
      await writable.close();

      this.lastSavedData = jsonString;
      return true;
    } catch (error) {
      // Failed to save to file
      console.error("Failed to save to file:", error);
      // If it's a security error during auto-save, don't throw
      if (!isUserActivated && (error as Error).name === "SecurityError") {
        // Auto-save requires user interaction - will retry on next manual save
        return false;
      }
      return false;
    }
  }

  /**
   * Gets the current file name
   */
  getFileName(): string | null {
    return this.fileHandle?.name ?? null;
  }

  /**
   * Checks if a file is currently open
   */
  hasOpenFile(): boolean {
    return this.fileHandle !== null;
  }

  /**
   * Closes the current file
   */
  async closeFile(): Promise<void> {
    this.fileHandle = null;
    this.lastSavedData = null;
    await del(FILE_HANDLE_KEY);
    await del(FILE_NAME_KEY);
  }

  /**
   * Gets the last opened file name from IndexedDB
   */
  static async getLastFileName(): Promise<string | null> {
    try {
      return (await get(FILE_NAME_KEY)) as string | null;
    } catch {
      return null;
    }
  }

  /**
   * Checks if File System Access API is supported
   */
  static isSupported(): boolean {
    return "showOpenFilePicker" in window && "showSaveFilePicker" in window;
  }
}
