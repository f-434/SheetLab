import { useCallback, useEffect, useState } from 'react'
import {
  deleteDataset,
  errorMessage,
  importExcel,
  listDatasets,
  renameDataset,
} from './api'
import { DataPanel } from './components/DataPanel'
import {
  IconFileExcel,
  IconPanelLeft,
  IconRows,
  IconTerminal,
  IconTrash,
} from './components/Icons'
import { ConfirmDialog } from './components/Modal'
import { Sidebar } from './components/Sidebar'
import { SqlPanel } from './components/SqlPanel'
import { Toasts, useToasts } from './components/Toasts'
import { Welcome } from './components/Welcome'
import type { Dataset } from './types'

type Tab = 'data' | 'sql'

function BrandMark() {
  return (
    <span className="brand-mark">
      <svg viewBox="0 0 64 64" width="34" height="34" aria-hidden="true">
        <defs>
          <linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#1cc2a2" />
            <stop offset="1" stopColor="#0a8f78" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="17" fill="url(#brandGrad)" />
        <path
          d="M19 22.5c0-2 1.6-3.5 3.5-3.5h19c2 0 3.5 1.6 3.5 3.5v4.2H19v-4.2Z"
          fill="#fff"
          opacity=".96"
        />
        <rect x="19" y="31" width="26" height="5" rx="2.5" fill="#fff" opacity=".72" />
        <rect x="19" y="40" width="17" height="5" rx="2.5" fill="#fff" opacity=".5" />
      </svg>
    </span>
  )
}

export default function App() {
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [tab, setTab] = useState<Tab>('data')
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deletingDataset, setDeletingDataset] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => window.localStorage.getItem('sheetlab.sidebarCollapsed') === '1',
  )
  const { toasts, dismiss, push } = useToasts()

  const active = datasets.find((dataset) => dataset.id === activeId) ?? null

  const loadDatasets = useCallback(
    async (selectId?: number | null) => {
      setLoading(true)
      try {
        const list = await listDatasets()
        setDatasets(list)
        setActiveId((current) => {
          if (selectId != null && list.some((dataset) => dataset.id === selectId)) {
            return selectId
          }
          if (current != null && list.some((dataset) => dataset.id === current)) {
            return current
          }
          return list[0]?.id ?? null
        })
        return list
      } catch (err) {
        push('error', errorMessage(err))
        return []
      } finally {
        setLoading(false)
      }
    },
    [push],
  )

  useEffect(() => {
    void loadDatasets()
  }, [loadDatasets])

  useEffect(() => {
    window.localStorage.setItem(
      'sheetlab.sidebarCollapsed',
      sidebarCollapsed ? '1' : '0',
    )
  }, [sidebarCollapsed])

  async function handleImport(file: File) {
    setImporting(true)
    try {
      const created = await importExcel(file)
      await loadDatasets(created[0]?.id ?? null)
      setTab('data')
      push(
        'success',
        created.length > 1
          ? `导入成功，创建了 ${created.length} 张数据表`
          : `导入成功：${created[0]?.displayName ?? file.name}`,
      )
    } catch (err) {
      push('error', errorMessage(err))
    } finally {
      setImporting(false)
    }
  }

  function updateRowCount(count: number) {
    if (activeId == null) return
    setDatasets((list) =>
      list.map((dataset) =>
        dataset.id === activeId ? { ...dataset, rowCount: count } : dataset,
      ),
    )
  }

  async function handleRename(id: number, name: string) {
    const updated = await renameDataset(id, name)
    setDatasets((list) =>
      list.map((dataset) => (dataset.id === updated.id ? updated : dataset)),
    )
    push('success', `表名已更新为「${updated.tableName}」`)
  }

  async function handleDeleteDataset() {
    if (!active) return
    setDeletingDataset(true)
    try {
      await deleteDataset(active.id)
      push('success', `已删除数据表「${active.displayName}」`)
      setConfirmDelete(false)
      await loadDatasets(null)
    } catch (err) {
      push('error', errorMessage(err))
    } finally {
      setDeletingDataset(false)
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-left">
          <button
            className={`icon-btn sidebar-toggle${sidebarCollapsed ? ' is-collapsed' : ''}`}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            title={sidebarCollapsed ? '展开数据表栏' : '收起数据表栏'}
            aria-pressed={!sidebarCollapsed}
          >
            <IconPanelLeft size={17} />
          </button>
          <div className="brand">
            <BrandMark />
            <div className="brand-text">
              <strong>SheetLab</strong>
              <span>数据工作台</span>
            </div>
          </div>
        </div>

        <nav className="flow" aria-label="工作流">
          <span className={`flow-step${datasets.length > 0 ? ' is-done' : ''}`}>
            <i>1</i>
            导入数据
          </span>
          <span className="flow-line" />
          <span className={`flow-step${tab === 'sql' ? ' is-active' : ''}`}>
            <i>2</i>
            SQL 加工
          </span>
          <span className="flow-line" />
          <span className="flow-step">
            <i>3</i>
            导出结果
          </span>
        </nav>

        <div className="topbar-right">
          <span className="db-badge">
            <i />
            SQLite 本地库
          </span>
        </div>
      </header>

      <div className={`workspace${sidebarCollapsed ? ' is-sidebar-collapsed' : ''}`}>
        {!sidebarCollapsed && (
          <Sidebar
            datasets={datasets}
            activeId={activeId}
            loading={loading}
            importing={importing}
            onSelect={(id) => setActiveId(id)}
            onImport={handleImport}
            onRefresh={() => void loadDatasets(activeId)}
            onRename={handleRename}
            onError={(message) => push('error', message)}
          />
        )}

        <main className="main">
          {loading && datasets.length === 0 ? (
            <div className="app-loading">
              <span className="spinner" />
              <span>正在加载数据表…</span>
            </div>
          ) : !active ? (
            <Welcome
              onImport={handleImport}
              onError={(message) => push('error', message)}
              importing={importing}
            />
          ) : (
            <>
              <div className="dataset-head">
                <div className="dataset-title">
                  <div className="title-line">
                    <h1>{active.displayName}</h1>
                    <span className="table-name" title="SQL 表名">
                      {active.tableName}
                    </span>
                  </div>
                  <div className="dataset-meta">
                    <span>
                      <IconRows size={14} />
                      {active.rowCount.toLocaleString()} 行
                    </span>
                    <span>{active.columns.length} 列</span>
                    {active.sourceFile && (
                      <span title={active.sourceFile}>
                        <IconFileExcel size={14} />
                        {active.sourceFile}
                      </span>
                    )}
                  </div>
                </div>
                <div className="dataset-actions">
                  <button
                    className="btn btn-ghost danger-text"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <IconTrash size={15} />
                    删除数据表
                  </button>
                </div>
              </div>

              <div className="tabs" role="tablist">
                <button
                  role="tab"
                  aria-selected={tab === 'data'}
                  className={`tab${tab === 'data' ? ' is-active' : ''}`}
                  onClick={() => setTab('data')}
                >
                  <IconRows size={15} />
                  数据预览
                </button>
                <button
                  role="tab"
                  aria-selected={tab === 'sql'}
                  className={`tab${tab === 'sql' ? ' is-active' : ''}`}
                  onClick={() => setTab('sql')}
                >
                  <IconTerminal size={15} />
                  SQL 查询
                </button>
              </div>

              <div className="panels">
                <div className="panel" hidden={tab !== 'data'}>
                  <DataPanel
                    key={active.id}
                    dataset={active}
                    notify={push}
                    onRowCountChange={updateRowCount}
                  />
                </div>
                <div className="panel" hidden={tab !== 'sql'}>
                  <SqlPanel datasets={datasets} activeDataset={active} notify={push} />
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {confirmDelete && active && (
        <ConfirmDialog
          title="删除整张数据表？"
          message={
            <>
              将删除「{active.displayName}」及其中 {active.rowCount.toLocaleString()} 行数据，
              此操作不可恢复。
            </>
          }
          confirmText="删除数据表"
          danger
          busy={deletingDataset}
          onConfirm={handleDeleteDataset}
          onClose={() => {
            if (!deletingDataset) setConfirmDelete(false)
          }}
        />
      )}

      <Toasts items={toasts} onDismiss={dismiss} />
    </div>
  )
}
