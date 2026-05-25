'use server'
import { getCategoriesForGroup } from '@/lib/api'
import { env } from '@/lib/env'
import { formatCategoryForAIPrompt } from '@/lib/utils'
import { readFile, unlink } from 'fs/promises'
import OpenAI from 'openai'
import { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/index.mjs'

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })

export async function extractExpenseInformationFromImage(
  filePath: string,
  mimeType: string,
  groupId?: string,
) {
  'use server'

  // Read file from disk and convert to base64
  let imageBase64: string
  try {
    const buffer = await readFile(filePath)
    imageBase64 = buffer.toString('base64')
  } finally {
    // Always clean up the temp file
    await unlink(filePath).catch(() => {})
  }

  const categories = await getCategoriesForGroup(groupId)

  const body: ChatCompletionCreateParamsNonStreaming = {
    model: env.CATEGORY_EXTRACT_MODEL || 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `This image contains a receipt.
Read the total amount and store it as a non-formatted number without any other text or currency.
Then guess the category for this receipt among the following categories and store its ID: ${categories.map(
              (category) => formatCategoryForAIPrompt(category),
            )}.
If a date is clearly visible on the receipt, extract it as yyyy-mm-dd. If no date is visible, return "none" for the date field.
Guess a title for the expense.
Return the amount, the category, the date and the title with just a comma between them, without anything else.`,
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${imageBase64}`,
            },
          },
        ],
      },
    ],
  }
  const completion = await openai.chat.completions.create(body)

  const [amountString, categoryId, date, ...titleParts] = completion.choices
    .at(0)
    ?.message.content?.split(',') ?? [null, null, null, null]
  const title = titleParts.join(',').trim() || null
  const parsedDate = date?.trim()
  const today = new Date().toISOString().split('T')[0]
  return {
    amount: Number(amountString),
    categoryId: categoryId?.trim() ?? null,
    date: !parsedDate || parsedDate === 'none' ? today : parsedDate,
    title,
  }
}

export type ReceiptExtractedInfo = Awaited<
  ReturnType<typeof extractExpenseInformationFromImage>
>

export type ReceiptItem = {
  name: string
  qty: number
  price: number
  categoryId: string | null
}

export type ReceiptItemsExtractedInfo = ReceiptExtractedInfo & {
  items: ReceiptItem[]
}

export async function extractExpenseWithItemsFromImage(
  filePath: string,
  mimeType: string,
  groupId?: string,
): Promise<ReceiptItemsExtractedInfo> {
  'use server'

  // Read file from disk and convert to base64
  let imageBase64: string
  try {
    const buffer = await readFile(filePath)
    imageBase64 = buffer.toString('base64')
  } finally {
    // Always clean up the temp file
    await unlink(filePath).catch(() => {})
  }

  const categories = await getCategoriesForGroup(groupId)
  const categoryList = categories
    .map((c) => formatCategoryForAIPrompt(c))
    .join(', ')

  const body: ChatCompletionCreateParamsNonStreaming = {
    model: env.CATEGORY_EXTRACT_MODEL || 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `This image contains a receipt. Extract the following as JSON:

{
  "title": "Store/restaurant name",
  "amount": <total amount as number, e.g. 34.57>,
  "date": "<yyyy-mm-dd or 'none' if not visible>",
  "categoryId": "<best matching category ID for the overall receipt>",
  "items": [
    {"name": "Item name", "qty": 1, "price": 3.99, "categoryId": "<best matching category ID for this item>"},
    ...
  ]
}

Available categories: ${categoryList}

Rules:
- amount is the total, items are individual line items
- price per item is the total for that line (qty * unit price)
- categoryId for each item: pick the best match from available categories
- If no date is visible, use "none"
- Return ONLY valid JSON, nothing else`,
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${imageBase64}`,
            },
          },
        ],
      },
    ],
  }

  const completion = await openai.chat.completions.create(body)
  const content = completion.choices.at(0)?.message.content ?? '{}'

  try {
    const parsed = JSON.parse(content) as any
    const today = new Date().toISOString().split('T')[0]
    const parsedDate = parsed.date?.trim()

    return {
      title: parsed.title || null,
      amount: Number(parsed.amount) || 0,
      date: !parsedDate || parsedDate === 'none' ? today : parsedDate,
      categoryId: String(parsed.categoryId ?? ''),
      items: Array.isArray(parsed.items)
        ? parsed.items.map((item: any) => ({
            name: String(item.name || ''),
            qty: Number(item.qty) || 1,
            price: Number(item.price) || 0,
            categoryId: item.categoryId ? String(item.categoryId) : null,
          }))
        : [],
    }
  } catch {
    // Fallback: return without items
    return {
      title: null,
      amount: 0,
      date: new Date().toISOString().split('T')[0],
      categoryId: null,
      items: [],
    }
  }
}
