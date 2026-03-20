'use server'
import { getCategories } from '@/lib/api'
import { env } from '@/lib/env'
import { formatCategoryForAIPrompt } from '@/lib/utils'
import OpenAI from 'openai'
import { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/index.mjs'
import { readFile, unlink } from 'fs/promises'

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })

export async function extractExpenseInformationFromImage(
  filePath: string,
  mimeType: string,
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

  const categories = await getCategories()

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

  const [amountString, categoryId, date, ...titleParts] =
    completion.choices.at(0)?.message.content?.split(',') ?? [
      null,
      null,
      null,
      null,
    ]
  const title = titleParts.join(',').trim() || null
  const parsedDate = date?.trim()
  const today = new Date().toISOString().split('T')[0]
  return {
    amount: Number(amountString),
    categoryId: categoryId?.trim() ?? null,
    date: (!parsedDate || parsedDate === 'none') ? today : parsedDate,
    title,
  }
}

export type ReceiptExtractedInfo = Awaited<
  ReturnType<typeof extractExpenseInformationFromImage>
>
