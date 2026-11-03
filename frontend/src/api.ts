import type { Dataset, QueryResult, RowPage } from './types'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function readError(response: Response): Promise<string> {
  const text = await response.text()
  try {
    const data = JSON.parse(text) as { error?: string }
    if (data.error) return data.error
  } catch {
    // Not a JSON error body.
  }
  return text || `请求失败 (${response.status})`
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json()) as T
}

export async function listDatasets(): Promise<Dataset[]> {
  const data = await request<{ datasets: Dataset[] }>('/api/datasets')
  return data.datasets
}

export async function importExcel(file: File): Promise<Dataset[]> {
  const form = new FormData()
  form.append('file', file)
  const data = await request<{ datasets: Dataset[] }>('/api/datasets/import', {
    method: 'POST',
    body: form,
  })
  return data.datasets
}

export async function renameDataset(id: number, name: string): Promise<Dataset> {
  const data = await request<{ dataset: Dataset }>(`/api/datasets/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name }),
  })
  return data.dataset
}

export async function deleteDataset(id: number): Promise<void> {
  await request<{ ok: boolean }>(`/api/datasets/${id}`, { method: 'DELETE' })
}

export interface RowQuery {
  page: number
  pageSize: number
  search: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export async function fetchRows(datasetId: number, query: RowQuery): Promise<RowPage> {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  })
  if (query.search) params.set('search', query.search)
  if (query.sortBy) {
    params.set('sortBy', query.sortBy)
    params.set('sortOrder', query.sortOrder ?? 'asc')
  }
  return request<RowPage>(`/api/datasets/${datasetId}/rows?${params.toString()}`)
}

export async function createRow(
  datasetId: number,
  values: Record<string, string>,
): Promise<{ id: number; rowCount: number }> {
  return request(`/api/datasets/${datasetId}/rows`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ values }),
  })
}

export async function updateRow(
  datasetId: number,
  rowId: number,
  values: Record<string, string>,
): Promise<void> {
  await request(`/api/datasets/${datasetId}/rows/${rowId}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ values }),
  })
}

export async function deleteRow(
  datasetId: number,
  rowId: number,
): Promise<{ rowCount: number }> {
  return request(`/api/datasets/${datasetId}/rows/${rowId}`, { method: 'DELETE' })
}

export async function runQuery(sql: string): Promise<QueryResult> {
  return request<QueryResult>('/api/query', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ sql }),
  })
}

export async function exportQuery(sql: string): Promise<Blob> {
  const response = await fetch('/api/query/export', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ sql }),
  })
  if (!response.ok) throw new Error(await readError(response))
  return response.blob()
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '发生未知错误'
}
