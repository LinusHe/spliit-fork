import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { randomUUID } from 'crypto'
import path from 'path'
import {
  MAX_RECEIPT_BYTES,
  RECEIPT_UPLOAD_DIR as UPLOAD_DIR,
  receiptExtension,
} from '@/lib/receipt-upload'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (!file.type.startsWith('image/') || file.size > MAX_RECEIPT_BYTES) {
      return NextResponse.json({ error: 'Invalid file' }, { status: 400 })
    }

    await mkdir(UPLOAD_DIR, { recursive: true })

    const ext = receiptExtension(file.type)
    const filename = `${randomUUID()}.${ext}`
    const filepath = path.join(UPLOAD_DIR, filename)

    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(filepath, buffer)

    return NextResponse.json({ filename })
  } catch (error) {
    console.error('Receipt upload error:', error)
    return NextResponse.json(
      { error: 'Upload failed' },
      { status: 500 },
    )
  }
}
