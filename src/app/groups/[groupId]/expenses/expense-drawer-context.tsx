'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'

type DrawerState =
  | { mode: 'closed' }
  | { mode: 'edit'; expenseId: string }
  | { mode: 'create'; params?: URLSearchParams }

interface ExpenseDrawerContextValue {
  state: DrawerState
  openExpense: (expenseId: string) => void
  openCreateExpense: (params?: URLSearchParams) => void
  closeDrawer: () => void
}

const ExpenseDrawerContext = createContext<ExpenseDrawerContextValue | null>(null)

export function useExpenseDrawer() {
  const ctx = useContext(ExpenseDrawerContext)
  if (!ctx) {
    throw new Error('useExpenseDrawer must be used within ExpenseDrawerProvider')
  }
  return ctx
}

/** Optional hook that won't throw if outside the provider (for pages that can be rendered standalone) */
export function useExpenseDrawerOptional() {
  return useContext(ExpenseDrawerContext)
}

export function ExpenseDrawerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DrawerState>({ mode: 'closed' })

  const openExpense = useCallback((expenseId: string) => {
    setState({ mode: 'edit', expenseId })
  }, [])

  const openCreateExpense = useCallback((params?: URLSearchParams) => {
    setState({ mode: 'create', params })
  }, [])

  const closeDrawer = useCallback(() => {
    setState({ mode: 'closed' })
  }, [])

  useEffect(() => {
    const open = (event: Event) => openCreateExpense(new URLSearchParams((event as CustomEvent<string>).detail))
    const edit = (event: Event) => openExpense((event as CustomEvent<string>).detail)
    window.addEventListener('spliit-open-create', open)
    window.addEventListener('spliit-open-edit', edit)
    return () => {
      window.removeEventListener('spliit-open-create', open)
      window.removeEventListener('spliit-open-edit', edit)
    }
  }, [openCreateExpense, openExpense])

  return (
    <ExpenseDrawerContext.Provider
      value={{ state, openExpense, openCreateExpense, closeDrawer }}
    >
      {children}
    </ExpenseDrawerContext.Provider>
  )
}
