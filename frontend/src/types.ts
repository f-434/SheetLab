export interface Column {
  name: string
  type: string
}

export interface Dataset {
  id: number
  tableName: string
  displayName: string
  sourceFile: string
  sheetName: string
  rowCount: number
  createdAt: string
  columns: Column[]
}

export interface RowPage {
  columns: Column[]
  rows: Record<string, unknown>[]
  total: number
  page: number
  pageSize: number
}

export interface QueryResult {
  columns: string[]
  rows: unknown[][]
  rowCount: number
  truncated: boolean
  elapsedMs: number
}

export type ToastKind = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  kind: ToastKind
  text: string
}
