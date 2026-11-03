import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { SQLite, sql, type SQLNamespace } from '@codemirror/lang-sql'
import { downloadBlob, errorMessage, exportQuery, runQuery } from '../api'
import { copyText } from '../clipboard'
import type { Dataset, QueryResult, ToastKind } from '../types'
import {
  IconAlert,
  IconCheck,
  IconCopy,
  IconDownload,
  IconInfo,
  IconPlay,
  IconTable,
  IconTerminal,
} from './Icons'

interface SqlPanelProps {
  datasets: Dataset[]
  activeDataset: Dataset | null
  notify: (kind: ToastKind, text: string) => void
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function loadNumber(key: string, fallback: number, min: number, max: number): number {
  const raw = window.localStorage.getItem(key)
  if (raw == null) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback
}

function loadFlag(key: string, fallback: boolean): boolean {
  const raw = window.localStorage.getItem(key)
  return raw == null ? fallback : raw === '1'
}

function renderResultCell(value: unknown) {
  if (value === null || value === undefined) return <span className="cell-null">NULL</span>
  if (typeof value === 'string') {
    if (value === '') return <span className="cell-null">—</span>
    return (
      <span className="cell-text" title={value}>
        {value}
      </span>
    )
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return <span className="cell-number">{String(value)}</span>
  }
  return <span className="cell-text">{JSON.stringify(value)}</span>
}

function ResultTable({ result, height }: { result: QueryResult; height: number }) {
  return (
    <div className="table-scroll result-scroll" style={{ height }}>
      <table className="data-table result-table">
        <thead>
          <tr>
            <th className="row-num">#</th>
            {result.columns.map((column, index) => (
              <th key={`${column}-${index}`}>
                <span className="th-name">{column}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              <td className="row-num">{rowIndex + 1}</td>
              {row.map((value, cellIndex) => (
                <td key={cellIndex}>{renderResultCell(value)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function SqlPanel({ datasets, activeDataset, notify }: SqlPanelProps) {
  const [sqlText, setSqlText] = useState('')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [hasRun, setHasRun] = useState(false)
  const [running, setRunning] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [fieldDatasetId, setFieldDatasetId] = useState<number | null>(
    activeDataset?.id ?? null,
  )
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [selectedLength, setSelectedLength] = useState(0)
  const [executedSql, setExecutedSql] = useState('')
  const [ranSelection, setRanSelection] = useState(false)
  const [showFieldPanel, setShowFieldPanel] = useState(() =>
    loadFlag('sheetlab.showFieldPanel', true),
  )
  const [editorHeight, setEditorHeight] = useState(() =>
    loadNumber('sheetlab.editorHeight', 200, 120, 640),
  )
  const [resultHeight, setResultHeight] = useState(() =>
    loadNumber('sheetlab.resultHeight', 320, 140, 720),
  )
  const editorRef = useRef<ReactCodeMirrorRef>(null)
  const previousTableRef = useRef<{ id: number; tableName: string } | null>(
    activeDataset ? { id: activeDataset.id, tableName: activeDataset.tableName } : null,
  )

  useEffect(() => {
    window.localStorage.setItem('sheetlab.showFieldPanel', showFieldPanel ? '1' : '0')
  }, [showFieldPanel])

  useEffect(() => {
    window.localStorage.setItem('sheetlab.editorHeight', String(editorHeight))
  }, [editorHeight])

  useEffect(() => {
    window.localStorage.setItem('sheetlab.resultHeight', String(resultHeight))
  }, [resultHeight])

  useEffect(() => {
    setSqlText((current) => {
      if (current.trim() !== '') return current
      const table = activeDataset?.tableName ?? datasets[0]?.tableName
      if (!table) return current
      return `SELECT *\nFROM "${table.replace(/"/g, '""')}"\nLIMIT 100;`
    })
  }, [activeDataset?.id, activeDataset?.tableName, datasets])

  useEffect(() => {
    setFieldDatasetId(activeDataset?.id ?? null)
  }, [activeDataset?.id])

  // Keep already-written queries usable when the active table is renamed.
  useEffect(() => {
    if (!activeDataset) {
      previousTableRef.current = null
      return
    }
    const previous = previousTableRef.current
    if (previous && previous.id === activeDataset.id && previous.tableName !== activeDataset.tableName) {
      const oldQuoted = `"${previous.tableName.replace(/"/g, '""')}"`
      const newQuoted = `"${activeDataset.tableName.replace(/"/g, '""')}"`
      setSqlText((current) => current.split(oldQuoted).join(newQuoted))
    }
    previousTableRef.current = { id: activeDataset.id, tableName: activeDataset.tableName }
  }, [activeDataset?.id, activeDataset?.tableName])

  const fieldDataset =
    datasets.find((dataset) => dataset.id === fieldDatasetId) ??
    activeDataset ??
    datasets[0] ??
    null

  const schema = useMemo<SQLNamespace>(() => {
    const namespace: SQLNamespace = {}
    for (const dataset of datasets) {
      namespace[dataset.tableName] = dataset.columns.map((column) => column.name)
    }
    return namespace
  }, [datasets])

  const extensions = useMemo(
    () => [
      sql({
        dialect: SQLite,
        schema,
        upperCaseKeywords: true,
        defaultTable: activeDataset?.tableName,
      }),
    ],
    [schema, activeDataset?.tableName],
  )

  function getSelectedSql(): string | null {
    const view = editorRef.current?.view
    if (!view) return null
    const { from, to } = view.state.selection.main
    if (from === to) return null
    return view.state.sliceDoc(from, to).trim() || null
  }

  async function run() {
    const selected = getSelectedSql()
    const query = selected ?? sqlText
    if (!query.trim() || running) return
    setRunning(true)
    setError('')
    try {
      const queryResult = await runQuery(query)
      setResult(queryResult)
      setExecutedSql(query)
      setRanSelection(Boolean(selected))
      setHasRun(true)
      if (selected) {
        notify(
          'info',
          `已运行选中的 SQL 片段 · 返回 ${queryResult.rowCount.toLocaleString()} 行`,
        )
      }
    } catch (err) {
      setError(errorMessage(err))
      setResult(null)
      setRanSelection(Boolean(selected))
      setHasRun(true)
    } finally {
      setRunning(false)
    }
  }

  async function handleExport() {
    const query = result && executedSql ? executedSql : sqlText
    if (!query.trim() || exporting || running) return
    setExporting(true)
    try {
      const blob = await exportQuery(query)
      const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')
      downloadBlob(blob, `sheetlab_${stamp}.xlsx`)
      notify('success', '查询结果已导出为 Excel')
    } catch (err) {
      notify('error', errorMessage(err))
    } finally {
      setExporting(false)
    }
  }

  async function copyCSV() {
    if (!result) return
    const escape = (value: unknown) => {
      if (value === null || value === undefined) return ''
      const text = String(value)
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
    }
    const lines = [
      result.columns.map(escape).join(','),
      ...result.rows.map((row) => row.map(escape).join(',')),
    ]
    try {
      await copyText(lines.join('\n'))
      setCopied(true)
      notify('success', '已复制 CSV 到剪贴板')
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      notify('error', '复制失败，请手动选择结果复制')
    }
  }

  async function copyFieldName(name: string) {
    try {
      await copyText(name)
      setCopiedField(name)
      window.setTimeout(
        () => setCopiedField((current) => (current === name ? null : current)),
        1500,
      )
    } catch {
      notify('error', '复制失败，请手动选择字段名')
    }
  }

  function insertTable(name: string) {
    const quoted = `"${name.replace(/"/g, '""')}"`
    const view = editorRef.current?.view
    if (!view) {
      setSqlText((current) => `${current}${current ? ' ' : ''}${quoted}`)
      return
    }
    const { from, to } = view.state.selection.main
    view.dispatch({
      changes: { from, to, insert: quoted },
      selection: { anchor: from + quoted.length },
    })
    view.focus()
  }

  function clear() {
    setSqlText('')
    setResult(null)
    setHasRun(false)
    setError('')
    setSelectedLength(0)
    setRanSelection(false)
  }

  function startResize(kind: 'editor' | 'result', event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    const startY = event.clientY
    const startHeight = kind === 'editor' ? editorHeight : resultHeight
    const move = (moveEvent: PointerEvent) => {
      const next = startHeight + (moveEvent.clientY - startY)
      if (kind === 'editor') {
        setEditorHeight(clamp(next, 120, 640))
      } else {
        setResultHeight(clamp(next, 140, 720))
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.classList.remove('is-resizing')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    document.body.classList.add('is-resizing')
  }

  function resizeWithKeyboard(kind: 'editor' | 'result', event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const delta = event.key === 'ArrowUp' ? -20 : 20
    if (kind === 'editor') {
      setEditorHeight((height) => clamp(height + delta, 120, 640))
    } else {
      setResultHeight((height) => clamp(height + delta, 140, 720))
    }
  }

  return (
    <div
      className="sql-panel"
      onKeyDownCapture={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault()
          void run()
        }
      }}
    >
      <section className="editor-card">
        <header className="editor-head">
          <div className="editor-title">
            <span className="editor-icon">
              <IconTerminal size={16} />
            </span>
            <div>
              <strong>SQL 工作区</strong>
              <span>只读查询 · SELECT / WITH</span>
            </div>
          </div>
          <div className="editor-actions">
            <button
              className={`btn btn-ghost btn-sm${showFieldPanel ? ' is-on' : ''}`}
              onClick={() => setShowFieldPanel((visible) => !visible)}
              title={showFieldPanel ? '隐藏字段速查' : '显示字段速查'}
              aria-pressed={showFieldPanel}
            >
              <IconTable size={14} />
              字段速查
            </button>
            <button className="btn btn-ghost btn-sm" onClick={clear} disabled={running}>
              清空
            </button>
            <button
              className="btn btn-primary"
              onClick={() => void run()}
              disabled={running || !sqlText.trim()}
              title={
                selectedLength > 0 ? `仅运行选中的 ${selectedLength} 个字符` : '运行全部 SQL'
              }
            >
              {running ? <span className="spinner spinner-sm" /> : <IconPlay size={15} />}
              {running ? '执行中' : selectedLength > 0 ? '运行选中' : '运行查询'}
              <kbd>Ctrl ↵</kbd>
            </button>
          </div>
        </header>

        <div className="editor-body">
          <div className="editor-main">
            <div className="table-chips">
              <span className="chips-label">插入表名</span>
              {datasets.length === 0 && <span className="chips-empty">还没有可用的数据表</span>}
              {datasets.map((dataset) => (
                <button
                  key={dataset.id}
                  className={`chip${dataset.id === activeDataset?.id ? ' is-active' : ''}`}
                  onClick={() => insertTable(dataset.tableName)}
                  title={`${dataset.displayName} · ${dataset.rowCount} 行`}
                >
                  {dataset.tableName}
                </button>
              ))}
            </div>

            <div className="editor-wrap">
              <CodeMirror
                ref={editorRef}
                value={sqlText}
                height={`${editorHeight}px`}
                extensions={extensions}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: false,
                  highlightActiveLine: true,
                  autocompletion: true,
                  bracketMatching: true,
                  closeBrackets: true,
                }}
                onChange={(value) => setSqlText(value)}
                onUpdate={(update) => {
                  if (!update.selectionSet && !update.docChanged) return
                  const { from, to } = update.state.selection.main
                  const length =
                    from === to ? 0 : update.state.sliceDoc(from, to).trim().length
                  setSelectedLength(length)
                }}
              />
            </div>

            <footer className="editor-foot">
              <span className={`hint${selectedLength > 0 ? ' is-selection' : ''}`}>
                <IconInfo size={13} />
                {selectedLength > 0
                  ? `已选中 ${selectedLength} 个字符 · 运行按钮将只执行选中片段`
                  : '只读执行，支持多表 JOIN · Ctrl + Space 补全'}
              </span>
              <span>{sqlText.length} 字符</span>
            </footer>
          </div>

          {showFieldPanel && (
            <aside className="field-panel">
              <div className="field-panel-head">
              <div className="field-panel-title">
                <IconTable size={13} />
                <span>字段速查</span>
                {fieldDataset && (
                  <span className="field-panel-count">{fieldDataset.columns.length}</span>
                )}
              </div>
              <select
                className="field-panel-select"
                value={fieldDataset?.id ?? ''}
                onChange={(event) => setFieldDatasetId(Number(event.target.value))}
                aria-label="选择要查看字段的数据表"
              >
                {datasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>
                    {dataset.tableName}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-panel-list">
              {!fieldDataset ? (
                <div className="field-panel-empty">还没有数据表</div>
              ) : fieldDataset.columns.length === 0 ? (
                <div className="field-panel-empty">暂无字段</div>
              ) : (
                fieldDataset.columns.map((column) => {
                  const copied = copiedField === column.name
                  return (
                    <button
                      key={column.name}
                      className={`field-row${copied ? ' is-copied' : ''}`}
                      title={`点击复制「${column.name}」`}
                      onClick={() => void copyFieldName(column.name)}
                    >
                      <span className="field-name">{column.name}</span>
                      <span className={`type-chip type-${column.type.toLowerCase()}`}>
                        {column.type}
                      </span>
                      <span className="copy-ic">
                        {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                      </span>
                    </button>
                  )
                })
              )}
            </div>

              <div className="field-panel-foot">
                <span>点击字段复制</span>
                <span>Ctrl + Space 补全</span>
              </div>
            </aside>
          )}
        </div>

        <div
          className="resize-bar"
          role="separator"
          aria-orientation="horizontal"
          aria-label="调整 SQL 编辑区高度"
          tabIndex={0}
          title="拖动调整编辑区高度，双击重置"
          onPointerDown={(event) => startResize('editor', event)}
          onKeyDown={(event) => resizeWithKeyboard('editor', event)}
          onDoubleClick={() => setEditorHeight(200)}
        />
      </section>

      {error && (
        <div className="inline-error">
          <IconAlert size={15} />
          <span>{error}</span>
        </div>
      )}

      <section className="result-card">
        <header className="result-head">
          <div className="result-title">
            <strong>查询结果</strong>
            {result && (
              <span className="result-meta">
                {ranSelection && <span className="run-badge">选中片段</span>}
                {result.rowCount.toLocaleString()} 行 · {result.elapsedMs} ms
                {result.truncated ? ' · 已截断' : ''}
              </span>
            )}
          </div>
          <div className="result-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => void copyCSV()} disabled={!result}>
              {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
              {copied ? '已复制' : '复制 CSV'}
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => void handleExport()}
              disabled={!result || exporting || running}
              title="导出当前查询结果"
            >
              {exporting ? <span className="spinner spinner-sm" /> : <IconDownload size={15} />}
              导出 Excel
            </button>
          </div>
        </header>

        {result ? (
          result.rowCount === 0 ? (
            <div className="result-empty">
              <span className="empty-icon">
                <IconCheck size={22} />
              </span>
              <strong>查询成功，但没有返回数据</strong>
              <span>试试调整筛选条件或查询其他数据表</span>
            </div>
          ) : (
            <>
              {result.truncated && (
                <div className="result-note">
                  <IconInfo size={14} />
                  结果超过展示上限，这里仅显示前 {result.rowCount.toLocaleString()} 行；导出文件会包含完整查询结果。
                </div>
              )}
              <ResultTable result={result} height={resultHeight} />
            </>
          )
        ) : (
          <div className="result-empty">
            <span className="empty-icon">
              <IconTerminal size={22} />
            </span>
            <strong>{hasRun && error ? '查询未完成' : '结果会显示在这里'}</strong>
            <span>在上方输入 SQL，按 Ctrl + Enter 运行</span>
          </div>
        )}

        {result && result.rowCount > 0 && (
          <div
            className="resize-bar"
            role="separator"
            aria-orientation="horizontal"
            aria-label="调整结果窗口高度"
            tabIndex={0}
            title="拖动调整结果窗口高度，双击重置"
            onPointerDown={(event) => startResize('result', event)}
            onKeyDown={(event) => resizeWithKeyboard('result', event)}
            onDoubleClick={() => setResultHeight(320)}
          />
        )}
      </section>
    </div>
  )
}
