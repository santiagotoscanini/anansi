import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { mcpJsonResult } from '../errors'
import * as attachments from '~/server/services/attachments'

/** Past this a file is no use in a tool result, and the app is the place to open it. */
const READABLE_BYTES = 5 * 1024 * 1024

/**
 * An attachment as a tool result: an image as an image, a text file as text,
 * anything else (or anything too large) as a note saying where to open it.
 */
export async function attachmentResult(userId: string, id: string): Promise<CallToolResult> {
  // The record first: a video is never read into memory just to say it is too large.
  const record = await attachments.find(userId, id)
  if (record.sizeBytes > READABLE_BYTES) {
    return mcpJsonResult({
      id: record.id,
      fileName: record.fileName,
      fileType: record.fileType,
      sizeBytes: record.sizeBytes,
      note: 'Too large to read here. Open it in the app.',
    })
  }
  const file = await attachments.read(userId, id)
  const about = { id: file.id, fileName: file.fileName, fileType: file.fileType, sizeBytes: file.sizeBytes }
  if (file.sizeBytes > READABLE_BYTES) {
    return mcpJsonResult({ ...about, note: 'Too large to read here. Open it in the app.' })
  }
  if (file.mimeType.startsWith('image/')) {
    return {
      content: [
        { type: 'image' as const, data: Buffer.from(file.data).toString('base64'), mimeType: file.mimeType },
        { type: 'text' as const, text: file.fileName },
      ],
    }
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(file.data)
    return mcpJsonResult({ ...about, text })
  } catch {
    return mcpJsonResult({ ...about, note: 'A binary file. Open it in the app.' })
  }
}
