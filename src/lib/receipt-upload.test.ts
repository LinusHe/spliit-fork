import { resolveReceiptUpload } from './receipt-upload'

describe('resolveReceiptUpload', () => {
  const uuid = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b'

  it('resolves names handed out by the upload route', () => {
    expect(resolveReceiptUpload(`${uuid}.jpg`)).toEqual({
      filePath: `/tmp/receipts/${uuid}.jpg`,
      mimeType: 'image/jpeg',
    })
    expect(resolveReceiptUpload(`${uuid}.png`).mimeType).toBe('image/png')
    expect(resolveReceiptUpload(`${uuid}.webp`).mimeType).toBe('image/webp')
  })

  it.each([
    '/etc/passwd',
    '/usr/app/.next/BUILD_ID',
    `../${uuid}.jpg`,
    `${uuid}.jpg/../../etc/passwd`,
    `/tmp/receipts/${uuid}.jpg`,
    `${uuid}.svg`,
    `${uuid}.jpg\0.png`,
    'receipt.jpg',
    '',
  ])('rejects %j', (name) => {
    expect(() => resolveReceiptUpload(name)).toThrow('Invalid receipt upload.')
  })
})
