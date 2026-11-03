import { useRef, useState } from 'react'
import { errorMessage } from '../api'
import { copyText } from '../clipboard'
import type { Dataset } from '../types'
import {
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconDatabase,
  IconRefresh,
  IconTable,
} from './Icons'
import { UploadZone } from './UploadZone'

interface SidebarProps {
  datasets: Dataset[]
  activeId: number | null
  loading: boolean
  importing: boolean
  onSelect: (id: number) => void
  onImport: (file: File) => void
  onRefresh: () => void
  onRename: (id: number, name: string) => Promise<void>
  onError: (message: string) => void
}

export function Sidebar({
  datasets,
  activeId,
  loading,
  importing,
  onSelect,
  onImport,
  onRefresh,
  onRename,
  onError,
}: SidebarProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const cancelRenameRef = useRef(false)

  function beginRename(dataset: Dataset) {
    setExpandedId(dataset.id)
    setEditingId(dataset.id)
    setEditValue(dataset.tableName)
  }

  async function commitRename(dataset: Dataset) {
    if (cancelRenameRef.current) {
      cancelRenameRef.current = false
      setEditingId(null)
      return
    }
    if (renaming) return
    const next = editValue.trim()
    if (!next || next === dataset.tableName) {
      setEditingId(null)
      return
    }
    setRenaming(true)
    try {
      await onRename(dataset.id, next)
      setEditingId(null)
    } catch (err) {
      onError(errorMessage(err))
      window.setTimeout(() => renameInputRef.current?.focus(), 0)
    } finally {
      setRenaming(false)
    }
  }

  async function copyField(datasetId: number, name: string) {
    const key = `${datasetId}:${name}`
    try {
      await copyText(name)
      setCopiedField(key)
      window.setTimeout(
        () => setCopiedField((current) => (current === key ? null : current)),
        1500,
      )
    } catch {
      onError('复制失败，请手动选择字段名')
    }
  }

  return (
    <aside className="sidebar">
      <UploadZone onFile={onImport} onError={onError} busy={importing} />

      <div className="sidebar-head">
        <span>数据表</span>
        <span className="sidebar-count">{datasets.length}</span>
        <button className="icon-btn sidebar-refresh" title="刷新列表" onClick={onRefresh}>
          <IconRefresh size={15} />
        </button>
      </div>

      <div className="dataset-list">
        {loading && datasets.length === 0 ? (
          <>
            <div className="dataset-skeleton" />
            <div className="dataset-skeleton" />
            <div className="dataset-skeleton" />
          </>
        ) : datasets.length === 0 ? (
          <div className="sidebar-empty">
            <IconTable size={22} />
            <p>还没有数据表</p>
            <span>导入一个 Excel 开始</span>
          </div>
        ) : (
          datasets.map((dataset) => {
            const active = dataset.id === activeId
            const expanded = dataset.id === expandedId
            const editing = dataset.id === editingId
            return (
              <div className="dataset-group" key={dataset.id}>
                <div
                  className={`dataset-item${active ? ' is-active' : ''}${editing ? ' is-editing' : ''}`}
                  role="button"
                  tabIndex={0}
                  title={`单击展开字段 · 双击重命名\n${dataset.sourceFile || 'Excel'} · ${dataset.tableName}`}
                  onClick={() => {
                    onSelect(dataset.id)
                    setExpandedId(dataset.id)
                  }}
                  onDoubleClick={() => beginRename(dataset)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelect(dataset.id)
                      setExpandedId(dataset.id)
                    }
                  }}
                >
                  <span className="dataset-icon">
                    <IconTable size={17} />
                  </span>
                  <span className="dataset-text">
                    {editing ? (
                      <input
                        ref={renameInputRef}
                        className="rename-input"
                        value={editValue}
                        autoFocus
                        disabled={renaming}
                        onChange={(event) => setEditValue(event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        onDoubleClick={(event) => event.stopPropagation()}
                        onFocus={(event) => event.currentTarget.select()}
                        onKeyDown={(event) => {
                          event.stopPropagation()
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            event.currentTarget.blur()
                          } else if (event.key === 'Escape') {
                            cancelRenameRef.current = true
                            event.currentTarget.blur()
                          }
                        }}
                        onBlur={() => void commitRename(dataset)}
                      />
                    ) : (
                      <strong>{dataset.displayName}</strong>
                    )}
                    <small>
                      {dataset.rowCount.toLocaleString()} 行 · {dataset.columns.length} 列
                    </small>
                  </span>
                  <button
                    className={`expand-btn${expanded ? ' is-open' : ''}`}
                    title={expanded ? '收起字段' : '展开字段'}
                    aria-label={expanded ? '收起字段' : '展开字段'}
                    onClick={(event) => {
                      event.stopPropagation()
                      setExpandedId(expanded ? null : dataset.id)
                    }}
                  >
                    <IconChevronDown size={14} />
                  </button>
                </div>

                {expanded && (
                  <div className="dataset-fields">
                    {dataset.columns.length === 0 && (
                      <div className="field-empty">暂无字段</div>
                    )}
                    {dataset.columns.map((column) => {
                      const key = `${dataset.id}:${column.name}`
                      const copied = copiedField === key
                      return (
                        <button
                          key={column.name}
                          className={`field-item${copied ? ' is-copied' : ''}`}
                          title={`点击复制「${column.name}」`}
                          onClick={() => void copyField(dataset.id, column.name)}
                        >
                          <span className="field-name">{column.name}</span>
                          <span className={`type-chip type-${column.type.toLowerCase()}`}>
                            {column.type}
                          </span>
                          <span className="field-copy">
                            {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <div className="sidebar-foot">
        <IconDatabase size={14} />
        <span>数据仅保存在本机 SQLite</span>
      </div>
    </aside>
  )
}
