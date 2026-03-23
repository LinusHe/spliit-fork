import { getUserLocale } from './locale'

// Lightweight server-side notification translations
// Keep in sync with messages/{locale}.json Notifications keys

const translations: Record<string, Record<string, string>> = {
  'en-US': {
    'expense.created.title': 'New Expense',
    'expense.created.body': '{name} added: {title} ({amount})',
    'expense.updated.title': 'Expense Updated',
    'expense.updated.body': '{name} updated: {title}',
    'expense.deleted.title': 'Expense Deleted',
    'expense.deleted.body': '{name} deleted: {title}',
  },
  'de-DE': {
    'expense.created.title': 'Neue Ausgabe',
    'expense.created.body': '{name} hat hinzugefügt: {title} ({amount})',
    'expense.updated.title': 'Ausgabe aktualisiert',
    'expense.updated.body': '{name} hat aktualisiert: {title}',
    'expense.deleted.title': 'Ausgabe gelöscht',
    'expense.deleted.body': '{name} hat gelöscht: {title}',
  },
  'fr-FR': {
    'expense.created.title': 'Nouvelle dépense',
    'expense.created.body': '{name} a ajouté : {title} ({amount})',
    'expense.updated.title': 'Dépense mise à jour',
    'expense.updated.body': '{name} a mis à jour : {title}',
    'expense.deleted.title': 'Dépense supprimée',
    'expense.deleted.body': '{name} a supprimé : {title}',
  },
  'es': {
    'expense.created.title': 'Nuevo gasto',
    'expense.created.body': '{name} añadió: {title} ({amount})',
    'expense.updated.title': 'Gasto actualizado',
    'expense.updated.body': '{name} actualizó: {title}',
    'expense.deleted.title': 'Gasto eliminado',
    'expense.deleted.body': '{name} eliminó: {title}',
  },
  'nl-NL': {
    'expense.created.title': 'Nieuwe uitgave',
    'expense.created.body': '{name} heeft toegevoegd: {title} ({amount})',
    'expense.updated.title': 'Uitgave bijgewerkt',
    'expense.updated.body': '{name} heeft bijgewerkt: {title}',
    'expense.deleted.title': 'Uitgave verwijderd',
    'expense.deleted.body': '{name} heeft verwijderd: {title}',
  },
}

function interpolate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}

function getTranslation(locale: string, key: string): string {
  // Try exact match, then language prefix, then fallback to en-US
  const t =
    translations[locale]?.[key] ??
    translations[locale.split('-')[0]]?.[key] ??
    translations['en-US'][key] ??
    key
  return t
}

export async function getNotificationText(
  key: string,
  vars: Record<string, string>,
): Promise<string> {
  let locale: string
  try {
    locale = await getUserLocale()
  } catch {
    locale = 'en-US'
  }
  return interpolate(getTranslation(locale, key), vars)
}

export async function getNotificationTitle(key: string): Promise<string> {
  let locale: string
  try {
    locale = await getUserLocale()
  } catch {
    locale = 'en-US'
  }
  return getTranslation(locale, key)
}
