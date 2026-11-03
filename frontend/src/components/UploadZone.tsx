import { useRef, useState } from 'react'
import { IconUpload } from './Icons'

interface UploadZoneProps {
  onFile: (file: File) => void
  onError: (message: string) => void
  busy: boolean
}

export function UploadZone({ onFile, onError, busy }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const pick = (file: File | null | undefined) => {
    if (!file) return
    if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
      onError('仅支持 .xlsx / .xlsm 格式的 Excel 文件')
      return
    }
    onFile(file)
  }

  return (
    <div
      className={`upload-zone${dragging ? ' is-drag' : ''}${busy ? ' is-busy' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => !busy && inputRef.current?.click()}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && !busy) {
          event.preventDefault()
          inputRef.current?.click()
        }
      }}
      onDragOver={(event) => {
        event.preventDefault()
        if (!busy) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        if (!busy) pick(event.dataTransfer.files?.[0])
      }}
    >
      <span className="upload-icon">
        {busy ? <span className="spinner" /> : <IconUpload size={19} />}
      </span>
      <span className="upload-copy">
        <strong>{busy ? '正在导入…' : '导入 Excel'}</strong>
        <span>{busy ? '解析工作表并写入本地库' : '拖拽文件到此处，或点击选择'}</span>
      </span>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xlsm"
        hidden
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          pick(event.currentTarget.files?.[0])
          event.currentTarget.value = ''
        }}
      />
    </div>
  )
}
