export const CATEGORY_PRESETS = {
  all: {
    label: 'all',
    categoryIds: [],
  },
  custom: {
    label: 'custom',
    categoryIds: [],
  },
  travel: {
    label: 'travel',
    categoryIds: [
      0, 1, 8, 9, 10, 29, 30, 31, 33, 34, 35, 44, 45, 46, 47, 48, 49, 50, 51,
      52, 53, 25,
    ],
  },
  outdoorTravel: {
    label: 'outdoorTravel',
    categoryIds: [0, 1, 9, 8, 29, 34, 35, 44, 45, 46, 47, 49, 50, 25],
  },
  household: {
    label: 'household',
    categoryIds: [0, 1, 18, 38, 39, 42, 41, 37, 14, 13, 15, 9, 19],
  },
  event: {
    label: 'event',
    categoryIds: [0, 1, 7, 9, 10, 2, 5, 54, 55, 57, 56, 29, 35, 23],
  },
  friends: {
    label: 'friends',
    categoryIds: [0, 1, 8, 9, 10, 2, 4, 5, 6, 29, 35, 23],
  },
  project: {
    label: 'project',
    categoryIds: [0, 1, 58, 59, 60, 61, 62, 19, 27, 8],
  },
} as const

export type CategoryPreset = keyof typeof CATEGORY_PRESETS

export const CATEGORY_PRESET_KEYS = Object.keys(
  CATEGORY_PRESETS,
) as CategoryPreset[]

export function isCategoryPreset(value: string): value is CategoryPreset {
  return value in CATEGORY_PRESETS
}

export function getPresetCategoryIds(preset: string | undefined) {
  if (!preset || !isCategoryPreset(preset)) {
    return [...CATEGORY_PRESETS.all.categoryIds]
  }
  return [...CATEGORY_PRESETS[preset].categoryIds]
}
