import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export interface ImageUploadResult {
  filePath: string;
  fileName: string;
  url: string;
}

export interface FileUploadResult {
  filePath: string;
  fileName: string;
  url: string;
  fileType: "image" | "document" | "video" | "audio" | "other";
}

/**
 * Validates if a string is a valid base64 image
 * @param data - The data to validate
 * @returns boolean indicating if data is valid base64 image
 */
export function isValidBase64Image(data: string): boolean {
  try {
    // Check if it starts with data URL prefix or is pure base64
    const base64Pattern = /^data:image\/[a-zA-Z]+;base64,|^[A-Za-z0-9+/]+={0,2}$/;

    if (!base64Pattern.test(data)) {
      return false;
    }

    // Try to decode the base64 part
    const cleanBase64 = data.replace(/^data:image\/[a-zA-Z]+;base64,/, "");
    Buffer.from(cleanBase64, "base64");

    return true;
  } catch {
    return false;
  }
}

/**
 * Enhanced file upload function for weekly sync files
 * @param data - Base64 data or text content
 * @param relativePath - Full relative path (excluding /uploads base)
 * @param isText - Whether this is text content (not base64)
 * @returns Promise with file upload result
 */
export async function saveWeeklySyncFile(
  data: string,
  relativePath: string,
  isText = false,
): Promise<FileUploadResult> {
  try {
    let buffer: Buffer;
    let fileType: "image" | "document" | "video" | "audio" | "other" = "other";

    if (isText) {
      // Handle text content
      buffer = Buffer.from(data, "utf8");
      fileType = "document";
    } else {
      // Handle base64 data (images, etc.)
      const cleanBase64 = data.replace(/^data:[^;]+;base64,/, "");
      buffer = Buffer.from(cleanBase64, "base64");

      // Detect file type from filename extension
      const ext = path.extname(relativePath).toLowerCase();
      if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"].includes(ext)) {
        fileType = "image";
      } else if ([".pdf", ".doc", ".docx", ".txt"].includes(ext)) {
        fileType = "document";
      } else if ([".mp4", ".mov", ".avi", ".webm"].includes(ext)) {
        fileType = "video";
      } else if ([".mp3", ".wav", ".ogg"].includes(ext)) {
        fileType = "audio";
      }
    }

    // Create full file path: uploads/{relativePath}
    const fullPath = path.join(process.cwd(), "uploads", relativePath);

    // Ensure directory exists
    await mkdir(path.dirname(fullPath), { recursive: true });

    // Write file to disk
    await writeFile(fullPath, buffer);

    // Extract filename from relative path
    const fileName = path.basename(relativePath);

    // Return path information
    const url = `/uploads/${relativePath.replace(/\\/g, "/")}`; // Ensure forward slashes for URLs

    return {
      filePath: relativePath,
      fileName,
      url,
      fileType,
    };
  } catch (error) {
    console.error("Error saving file:", error);
    throw new Error(`Failed to save file: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Updates or creates a text file for weekly sync
 * @param content - Text content
 * @param relativePath - Full relative path (excluding /uploads base)
 * @returns Promise with file upload result
 */
export async function saveOrUpdateTextFile(content: string, relativePath: string): Promise<FileUploadResult> {
  try {
    // Create full file path: uploads/{relativePath}
    const fullPath = path.join(process.cwd(), "uploads", relativePath);

    // Ensure directory exists
    await mkdir(path.dirname(fullPath), { recursive: true });

    const buffer = Buffer.from(content, "utf8");

    // Write file to disk (this will overwrite any existing file)
    await writeFile(fullPath, buffer);

    // Extract filename from relative path
    const fileName = path.basename(relativePath);

    // Return path information
    const url = `/uploads/${relativePath.replace(/\\/g, "/")}`; // Ensure forward slashes for URLs

    return {
      filePath: relativePath,
      fileName,
      url,
      fileType: "document",
    };
  } catch (error) {
    console.error("Error saving text file:", error);
    throw new Error(`Failed to save text file: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Gets the expected text file path for a tracking item
 * @param userId - User ID
 * @param goalId - Goal ID
 * @param trackingItemId - Tracking item ID
 * @param weeklySyncDate - Date when the weekly sync was created
 * @returns The expected file path for the tracking item's text file
 */
export function getTextFilePath(userId: string, goalId: string, trackingItemId: string, weeklySyncDate: Date): string {
  const dateString = weeklySyncDate.toISOString().split("T")[0] || weeklySyncDate.toISOString().slice(0, 10);

  return path.join("uploads", userId, goalId, dateString, trackingItemId, "notes.txt");
}

/**
 * Reads a text file from the server
 * @param filePath - The relative file path to read
 * @returns Promise with file content or null if not found
 */
export async function readTextFile(filePath: string): Promise<string | null> {
  try {
    const { readFile } = await import("fs/promises");
    const fullPath = path.join(process.cwd(), filePath);

    if (existsSync(fullPath)) {
      const content = await readFile(fullPath, "utf8");
      return content;
    }

    return null;
  } catch (error) {
    console.error("Error reading text file:", error);
    return null;
  }
}

/**
 * Reads a text file for a specific tracking item using the standard path structure
 * @param userId - User ID
 * @param goalId - Goal ID
 * @param trackingItemId - Tracking item ID
 * @param weeklySyncDate - Date when the weekly sync was created
 * @returns Promise with file content or null if not found
 */
export async function readTrackingItemTextFile(
  userId: string,
  goalId: string,
  trackingItemId: string,
  weeklySyncDate: Date,
): Promise<string | null> {
  const filePath = getTextFilePath(userId, goalId, trackingItemId, weeklySyncDate);
  return readTextFile(filePath);
}

/**
 * Deletes any file from the server (enhanced version)
 * @param filePath - The relative file path to delete
 * @returns Promise<boolean> indicating success
 */
export async function deleteFile(filePath: string): Promise<boolean> {
  try {
    const { unlink } = await import("fs/promises");
    const fullPath = path.join(process.cwd(), filePath);

    if (existsSync(fullPath)) {
      await unlink(fullPath);
      return true;
    }

    return false; // File didn't exist
  } catch (error) {
    console.error("Error deleting file:", error);
    return false;
  }
}
