import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { createId } from "@paralleldrive/cuid2";

export interface ImageUploadResult {
  filePath: string;
  fileName: string;
  url: string;
}

/**
 * Saves a base64 image to the server file system organized by date
 * @param base64Data - The base64 image data (with or without data URL prefix)
 * @param originalFileName - Optional original file name for extension detection
 * @returns Promise with file path information
 */
export async function saveImageToFile(
  base64Data: string,
  originalFileName?: string
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

    // Create date-based directory structure
    const today = new Date();
    const dateString = today.toISOString().split("T")[0]; // YYYY-MM-DD format

    if (!dateString) {
      throw new Error("Failed to generate date string");
    }

    // Define paths
    const uploadsDir = path.join(process.cwd(), "uploads");
    const dateDir = path.join(uploadsDir, dateString);

    // Ensure directories exist
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
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
    const relativePath = path.join("uploads", dateString, fileName);
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