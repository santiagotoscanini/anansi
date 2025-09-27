import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { createId } from "@paralleldrive/cuid2";

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
 * Saves a base64 image to the server file system organized by user and date
 * @param base64Data - The base64 image data (with or without data URL prefix)
 * @param userId - The user ID to organize files by user
 * @param userName - The user name for directory naming
 * @param originalFileName - Optional original file name for extension detection
 * @returns Promise with file path information
 */
export async function saveImageToFile(
  base64Data: string,
  userId: string,
  userName: string,
  originalFileName?: string,
): Promise<ImageUploadResult> {
  try {
    // Remove data URL prefix if present (e.g., "data:image/jpeg;base64,")
    const cleanBase64 = base64Data.replace(/^data:image\/[a-zA-Z]+;base64,/, "");

    // Convert base64 to buffer
    const buffer = Buffer.from(cleanBase64, "base64");

    // Detect file extension from original filename or default to jpg
    let extension = "jpg";
    if (originalFileName) {
      const ext = path.extname(originalFileName).toLowerCase();
      if ([".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext)) {
        extension = ext.slice(1); // Remove the dot
      }
    } else if (base64Data.startsWith("data:image/")) {
      // Try to detect from data URL
      const match = base64Data.match(/^data:image\/([a-zA-Z]+);base64,/);
      if (match && match[1]) {
        extension = match[1] === "jpeg" ? "jpg" : match[1];
      }
    }

    // Create user and date-based directory structure
    const today = new Date();
    const dateString = today.toISOString().split("T")[0]; // YYYY-MM-DD format

    if (!dateString) {
      throw new Error("Failed to generate date string");
    }

    // Sanitize user name for directory name
    const sanitizedUserName = userName.replace(/[^a-zA-Z0-9_-]/g, "_");

    // Define paths - uploads/userId_userName/YYYY-MM-DD/
    const uploadsDir = path.join(process.cwd(), "uploads");
    const userDir = path.join(uploadsDir, `${userId}_${sanitizedUserName}`);
    const dateDir = path.join(userDir, dateString);

    // Ensure directories exist
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }
    if (!existsSync(userDir)) {
      await mkdir(userDir, { recursive: true });
    }
    if (!existsSync(dateDir)) {
      await mkdir(dateDir, { recursive: true });
    }

    // Generate unique filename
    const uniqueId = createId();
    const fileName = `${uniqueId}.${extension}`;
    const filePath = path.join(dateDir, fileName);

    // Write file to disk
    await writeFile(filePath, buffer);

    // Return path information
    const relativePath = path.join("uploads", `${userId}_${sanitizedUserName}`, dateString, fileName);
    const url = `/${relativePath.replace(/\\/g, "/")}`; // Ensure forward slashes for URLs

    return {
      filePath: relativePath,
      fileName,
      url,
    };
  } catch (error) {
    console.error("Error saving image:", error);
    throw new Error(`Failed to save image: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
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
 * Gets the MIME type from base64 data URL
 * @param data - The base64 data URL
 * @returns The MIME type or null if not found
 */
export function getMimeTypeFromBase64(data: string): string | null {
  const match = data.match(/^data:image\/([a-zA-Z]+);base64,/);
  return match ? `image/${match[1]}` : null;
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
export async function saveOrUpdateTextFile(
  content: string,
  relativePath: string,
): Promise<FileUploadResult> {
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
 * Deletes an image file from the server
 * @param filePath - The relative file path to delete
 * @returns Promise<boolean> indicating success
 */
export async function deleteImageFile(filePath: string): Promise<boolean> {
  try {
    const { unlink } = await import("fs/promises");
    const fullPath = path.join(process.cwd(), filePath);

    if (existsSync(fullPath)) {
      await unlink(fullPath);
      return true;
    }

    return false; // File didn't exist
  } catch (error) {
    console.error("Error deleting image:", error);
    return false;
  }
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
