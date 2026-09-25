import path from 'path'

/** Temporary receipt images between upload and AI extraction. */
export const RECEIPT_UPLOAD_DIR = '/tmp/receipts'
/** Receipts are phone photos; anything larger is not a receipt. */
export const MAX_RECEIPT_BYTES = 15 * 1024 * 1024

const EXTENSIONS = { 'image/png': 'png', 'image/webp': 'webp' } as const
const MIME_TYPES = { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg' }

export function receiptExtension(mimeType: string) {
  return EXTENSIONS[mimeType as keyof typeof EXTENSIONS] ?? 'jpg'
}

/**
 * Resolves a receipt upload by the name the upload route handed out.
 *
 * The AI actions are server actions and therefore directly callable. They used
 * to accept a full file path and delete the file afterwards, which let any
 * caller read (via the model) and delete arbitrary files in the container.
 * Only `<uuid>.<png|webp|jpg>` inside the upload directory is accepted now,
 * and the MIME type is derived here instead of trusting the caller.
 */
export function resolveReceiptUpload(filename: string) {
  const match =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|webp|jpg)$/.exec(
      filename,
    )
  if (!match) throw new Error('Invalid receipt upload.')
  return {
    filePath: path.join(RECEIPT_UPLOAD_DIR, filename),
    mimeType: MIME_TYPES[match[1] as keyof typeof MIME_TYPES],
  }
}
