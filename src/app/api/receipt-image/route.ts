import { NextRequest, NextResponse } from 'next/server'
import { readFile, unlink, stat } from 'fs/promises'
import path from 'path'

const UPLOAD_DIR = '/tmp/receipts'

export async function GET(request: NextRequest) {
  const filename = request.nextUrl.searchParams.get('f')
  if (!filename || filename.includes('..') || filename.includes('/')) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
  }

  const filepath = path.join(UPLOAD_DIR, filename)

  try {
    const fileStat = await stat(filepath)
    // Reject files older than 5 minutes
    if (Date.now() - fileStat.mtimeMs > 5 * 60 * 1000) {
      await unlink(filepath).catch(() => {})
      return NextResponse.json({ error: 'File expired' }, { status: 410 })
    }

    const buffer = await readFile(filepath)
    const ext = path.extname(filename).slice(1)
    const mimeType =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : 'image/jpeg'

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }
}
