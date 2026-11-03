import { useEffect, useMemo, useState } from 'react'
import { createRow, deleteRow, errorMessage, fetchRows, updateRow } from '../api'
import type { Column, Dataset, ToastKind } from '../types'
import {
  IconAlert,
  IconArrowDown,
  IconArrowUp,
  IconChevronLeft,
  IconChevronRight,
  IconEdit,
  IconPlus,
  IconRefresh,
  IconRows,
  IconSearch,
  IconTrash,
  IconX,
} from './Icons'
import { ConfirmDialog } from './Modal'
import { RowDialog } from './RowDialog'

type Row = Record<string, unknown>

interface DataPanelProps {
  dataset: Dataset
  notify: (kind: ToastKind, text: string) => void
  onRowCountChange: (count: number) => void
}

const PAGE_SIZES = [20, 50, 100]

function renderCell(value: unknown) {
  if (value === null || value === undefined) return <span className="cell-null">NULL</span>
  if (typeof value === 'string') {
    if (value === '') return <span className="cell-null">—</span>
    return (
      <span className="cell-text" title={value}>
        {value}
      </span>
    )
  }
  if (typeof value === 'number') return <span className="cell-number">{value}</span>
  if (typeof value === 'boolean') return <span className="cell-number">{String(value)}</span>
  return <span className="cell-text">{JSON.stringify(value)}</span>
}

export function DataPanel({ dataset, notify, onRowCountChange }: DataPanelProps) {
  const [columns, setColumns] = useState<Column[]>(dataset.columns)
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(dataset.rowCount)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<string | null>(null)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const [dialog, setDialog] = useState<{ mode: 'create' | 'edit'; row?: Row } | null>(null)
  const [saving, setSaving] = useState(false)
  const [dialogError, setDialogError] = useState('')

  const [pendingDelete, setPendingDelete] = useState<Row | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 280)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetchRows(dataset.id, {
      page,
      pageSize,
      search,
      sortBy: sortBy ?? undefined,
      sortOrder,
    })
      .then((result) => {
        if (cancelled) return
        setRows(result.rows)
        setTotal(result.total)
        setColumns(result.columns)
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [dataset.id, page, pageSize, search, sortBy, sortOrder, refreshKey])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const rowLabel = useMemo(() => {
    if (total === 0) return '暂无数据'
    const start = (page - 1) * pageSize + 1
    const end = Math.min(page * pageSize, total)
    return `${start}–${end} / ${total.toLocaleString()} 行`
  }, [page, pageSize, total])

  function toggleSort(name: string) {
    if (sortBy === name) {
      setSortOrder((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(name)
      setSortOrder('asc')
    }
    setPage(1)
  }

  function reload() {
    setRefreshKey((key) => key + 1)
  }

  async function handleSave(values: Record<string, string>) {
    setSaving(true)
    setDialogError('')
    try {
      if (dialog?.mode === 'create') {
        const result = await createRow(dataset.id, values)
        onRowCountChange(result.rowCount)
        notify('success', '已新增一行数据')
      } else if (dialog?.row) {
        await updateRow(dataset.id, Number(dialog.row._id), values)
        notify('success', '已更新该行数据')
      }
      setDialog(null)
      reload()
    } catch (err) {
      setDialogError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      const result = await deleteRow(dataset.id, Number(pendingDelete._id))
      onRowCountChange(result.rowCount)
      notify('success', '已删除该行数据')
      setPendingDelete(null)
      if (rows.length === 1 && page > 1) {
        setPage((current) => Math.max(1, current - 1))
      } else {
        reload()
      }
    } catch (err) {
      notify('error', errorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="data-panel">
      <div className="data-toolbar">
        <div className="search-box">
          <IconSearch size={16} />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                setSearch(searchInput.trim())
                setPage(1)
              }
            }}
            placeholder="搜索所有字段…"
            aria-label="搜索所有字段"
          />
          {searchInput && (
            <button
              className="search-clear"
              onClick={() => setSearchInput('')}
              aria-label="清空搜索"
            >
              <IconX size={14} />
            </button>
          )}
        </div>
        <div className="toolbar-actions">
          <button className="btn btn-ghost" onClick={reload} title="刷新">
            <IconRefresh size={15} />
            刷新
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setDialogError('')
              setDialog({ mode: 'create' })
            }}
          >
            <IconPlus size={16} />
            新增行
          </button>
        </div>
      </div>

      {error && (
        <div className="inline-error">
          <IconAlert size={15} />
          <span>{error}</span>
        </div>
      )}

      <div className={`table-card${loading ? ' is-loading' : ''}`}>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th className="row-num">#</th>
                {columns.map((column) => {
                  const active = sortBy === column.name
                  return (
                    <th key={column.name}>
                      <button className="th-sort" onClick={() => toggleSort(column.name)}>
                        <span className="th-name">{column.name}</span>
                        <span className={`type-chip type-${column.type.toLowerCase()}`}>
                          {column.type}
                        </span>
                        {active && (
                          <span className="sort-indicator">
                            {sortOrder === 'asc' ? (
                              <IconArrowUp size={13} />
                            ) : (
                              <IconArrowDown size={13} />
                            )}
                          </span>
                        )}
                      </button>
                    </th>
                  )
                })}
                <th className="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={String(row._id)}>
                  <td className="row-num">{(page - 1) * pageSize + index + 1}</td>
                  {columns.map((column) => (
                    <td key={column.name}>{renderCell(row[column.name])}</td>
                  ))}
                  <td className="col-actions">
                    <div className="row-actions">
                      <button
                        className="icon-btn"
                        title="编辑"
                        onClick={() => {
                          setDialogError('')
                          setDialog({ mode: 'edit', row })
                        }}
                      >
                        <IconEdit size={15} />
                      </button>
                      <button
                        className="icon-btn danger"
                        title="删除"
                        onClick={() => setPendingDelete(row)}
                      >
                        <IconTrash size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {rows.length === 0 && !loading && !error && (
            <div className="table-empty">
              <span className="empty-icon">
                <IconRows size={22} />
              </span>
              <strong>{search ? '没有匹配的数据' : '这张表还没有数据'}</strong>
              <span>
                {search ? `试试其他关键词，或清空「${search}」` : '可以从右上角新增一行开始'}
              </span>
            </div>
          )}
          {loading && rows.length === 0 && (
            <div className="table-empty">
              <span className="spinner" />
              <strong>正在读取数据…</strong>
            </div>
          )}
          {loading && rows.length > 0 && (
            <div className="table-loading">
              <span className="spinner spinner-sm" />
            </div>
          )}
        </div>

        <footer className="pager">
          <span className="pager-total">{rowLabel}</span>
          <div className="pager-controls">
            <label className="page-size">
              每页
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value))
                  setPage(1)
                }}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <div className="pager-nav">
              <button
                className="icon-btn"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                title="上一页"
              >
                <IconChevronLeft size={16} />
              </button>
              <span className="page-indicator">
                {page} / {totalPages}
              </span>
              <button
                className="icon-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                title="下一页"
              >
                <IconChevronRight size={16} />
              </button>
            </div>
          </div>
        </footer>
      </div>

      {dialog && (
        <RowDialog
          dataset={{ ...dataset, columns }}
          mode={dialog.mode}
          initial={dialog.row}
          saving={saving}
          error={dialogError}
          onSave={handleSave}
          onClose={() => {
            if (!saving) setDialog(null)
          }}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="删除这一行？"
          message="删除后无法恢复，但不会影响其他数据。"
          confirmText="删除"
          danger
          busy={deleting}
          onConfirm={handleDelete}
          onClose={() => {
            if (!deleting) setPendingDelete(null)
          }}
        />
      )}
    </div>
  )
}
