// Expense dates are calendar days, not instants. PostgreSQL DATE is serialized
// as UTC midnight; the date picker, in contrast, returns local midnight.
export function fromCalendarDate(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
}

export function toCalendarDate(date: Date): Date {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}
