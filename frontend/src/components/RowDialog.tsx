import { useState } from 'react'
import type { Dataset } from '../types'
import { IconAlert } from './Icons'
import { Modal } from './Modal'

interface RowDialogProps {
  dataset: Dataset
  mode: 'create' | 'edit'
  initial?: Record<string, unknown>
  saving: boolean
  error: string
  onSave: (values: Record<string, string>) => void
  onClose: () => void
}

function initialValues(dataset: Dataset, initial?: Record<string, unknown>) {
  const values: Record<string, string> = {}
  for (const column of dataset.columns) {
    const value = initial?.[column.name]
    values[column.name] = value === null || value === undefined ? '' : String(value)
  }
  return values
}

export function RowDialog({
  dataset,
  mode,
  initial,
  saving,
  error,
  onSave,
  onClose,
}: RowDialogProps) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    initialValues(dataset, initial),
  )

  return (
    <Modal
      title={mode === 'create' ? '新增一行数据' : '编辑这一行'}
      subtitle={`${dataset.tableName} · 留空字段将保存为 NULL`}
      onClose={onClose}
      dismissible={!saving}
      width={640}
      footer={
        <>
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button className="btn btn-primary" type="submit" form="row-form" disabled={saving}>
            {saving && <span className="spinner spinner-sm" />}
            保存
          </button>
        </>
      }
    >
      <form
        id="row-form"
        className="row-form"
        onSubmit={(event) => {
          event.preventDefault()
          onSave(values)
        }}
      >
        {error && (
          <div className="inline-error">
            <IconAlert size={15} />
            <span>{error}</span>
          </div>
        )}
        <div className="form-grid">
          {dataset.columns.map((column) => (
            <label className="field" key={column.name}>
              <span className="field-label">
                {column.name}
                <em className={`type-chip type-${column.type.toLowerCase()}`}>{column.type}</em>
              </span>
              <input
                autoFocus={column === dataset.columns[0]}
                value={values[column.name] ?? ''}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [column.name]: event.target.value }))
                }
                inputMode={column.type === 'INTEGER' || column.type === 'REAL' ? 'decimal' : 'text'}
                placeholder={
                  column.type === 'INTEGER' || column.type === 'REAL' ? '输入数字' : '输入文本'
                }
              />
            </label>
          ))}
        </div>
      </form>
    </Modal>
  )
}
